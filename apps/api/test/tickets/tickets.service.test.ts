import type {
  ChangeTicketDepartmentInput,
  ChangeTicketStatusInput,
  CreateTicketInput,
  ListTicketsInput,
  UpdateTicketInput,
} from "@syc/contracts";
import { listTicketsInputSchema, updateTicketInputSchema } from "@syc/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/common/authenticated-request";
import type { AuditEntry } from "@/modules/audit/audit.repository";
import type { AuditService } from "@/modules/audit/audit.service";
import type {
  AreaRow,
  EstadoRow,
  ModuloRow,
  ReferenceMatch,
  ReferenceRow,
  TicketCatalog,
  TicketCreateData,
  TicketDepartmentData,
  TicketRow,
  TicketStatusData,
  TicketSummaryRow,
  TicketsRepository,
  TicketUpdateData,
} from "@/modules/tickets/tickets.repository";
import { TicketsService } from "@/modules/tickets/tickets.service";

const admin: AuthenticatedUser = {
  id: "admin-1",
  username: "admin",
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
  scope: { departmentId: null },
};
const agenteTecnico: AuthenticatedUser = {
  id: "ana",
  username: "ana",
  name: "Ana",
  email: "ana@example.com",
  role: "agente",
  scope: { departmentId: "tec" },
};

const agenteRedes: AuthenticatedUser = {
  id: "beto",
  username: "beto",
  name: "Beto",
  email: "beto@example.com",
  role: "agente",
  scope: { departmentId: "red" },
};

const input = (extra: Partial<CreateTicketInput> = {}): CreateTicketInput => ({
  departamentoId: "tec",
  titulo: "Impresora rota",
  descripcion: null,
  prioridadId: "alta",
  tipoId: null,
  moduloId: null,
  fechaRecepcion: "2026-10-01",
  actuacionSimple: null,
  proveedorId: null,
  referenciaExterna: null,
  numeroFactura: null,
  ...extra,
});

const ref = (id: string, nombre: string, activo = true): ReferenceRow => ({ id, nombre, activo });
const diputado = { id: "dip", nombre: "Diputado" };
const area = (id: string, nombre: string, activo = true): AreaRow => ({
  id,
  nombre,
  activo,
  tipo: diputado,
});
const modulo = (
  id: string,
  nombre: string,
  departamentoIds: string[],
  activo = true,
): ModuloRow => ({ id, nombre, activo, departamentoIds });
const estado = (id: string, nombre: string, activo = true): EstadoRow => ({
  id,
  nombre,
  activo,
  clave: null,
});

// Un ticket ya guardado, en el estado "Pendiente" y sin nada asignado salvo lo obligatorio.
const unTicket = (extra: Partial<TicketRow> = {}): TicketRow => ({
  id: "t-1",
  numero: 13,
  departamento: { id: "tec", nombre: "Técnico" },
  area: null,
  edificio: null,
  tipo: null,
  modulo: null,
  prioridad: { id: "alta", nombre: "Alta" },
  estado: { id: "pend", nombre: "Pendiente", clave: null },
  proveedor: null,
  titulo: "Impresora rota",
  descripcion: null,
  actuacionSimple: null,
  referenciaExterna: null,
  numeroFactura: null,
  solucionDescripcion: null,
  notificado: false,
  fechaRecepcion: "2026-10-01",
  fechaCierre: null,
  fechaReabierto: null,
  creador: { id: "ana", nombre: "Ana" },
  editor: { id: "ana", nombre: "Ana" },
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-06T10:00:00.000Z",
  ...extra,
});

// La edición que no cambia nada: reenvía los valores actuales del ticket. Cada test pisa lo que prueba.
const edit = (t: TicketRow, extra: Partial<UpdateTicketInput> = {}): UpdateTicketInput => ({
  ticketId: t.id,
  updatedAt: t.updatedAt,
  titulo: t.titulo,
  descripcion: t.descripcion,
  actuacionSimple: t.actuacionSimple,
  prioridadId: t.prioridad.id,
  areaId: t.area?.id ?? null,
  edificioId: t.edificio?.id ?? null,
  tipoId: t.tipo?.id ?? null,
  moduloId: t.modulo?.id ?? null,
  proveedorId: t.proveedor?.id ?? null,
  referenciaExterna: t.referenciaExterna,
  numeroFactura: t.numeroFactura,
  fechaRecepcion: t.fechaRecepcion,
  fechaCierre: t.fechaCierre,
  fechaReabierto: t.fechaReabierto,
  solucionDescripcion: t.solucionDescripcion,
  notificado: t.notificado,
  ...extra,
});

interface World {
  departamentos?: ReferenceRow[];
  catalogos?: Partial<Record<TicketCatalog, ReferenceRow[]>>;
  areas?: AreaRow[];
  modulos?: ModuloRow[];
  estados?: EstadoRow[];
  tickets?: TicketRow[];
  referencias?: (ReferenceMatch & { proveedorId: string; referenciaExterna: string })[];
}

// Repository en memoria. `create` imita lo que hace el real: toma el número de la secuencia, resuelve
// las referencias por nombre y deja el `AuditLog` que en producción se escribe en la misma
// transacción (acá se arma con el callback `auditOf`, igual que en producción).
function buildService(world: World = {}) {
  const departamentos = world.departamentos ?? [ref("tec", "Técnico"), ref("red", "Redes")];
  const areas = world.areas ?? [];
  const modulos = world.modulos ?? [];
  const catalogos: Record<TicketCatalog, ReferenceRow[]> = {
    edificio: [],
    tipoTicket: [],
    prioridad: [ref("alta", "Alta"), ref("baja", "Baja", false)],
    proveedor: [ref("acme", "Acme"), ref("viejo", "Viejo", false)],
    ...world.catalogos,
  };
  const estados = world.estados ?? [estado("pend", "Pendiente"), estado("prog", "En progreso")];
  const tickets = world.tickets ?? [];
  const referencias = world.referencias ?? [];
  const audits: AuditEntry[] = [];
  const created: { data: TicketCreateData; actorId: string }[] = [];
  const departmentChanges: {
    id: string;
    expectedUpdatedAt: string;
    data: TicketDepartmentData;
    actorId: string;
  }[] = [];
  const deletions: { id: string; actorId: string }[] = [];
  const history = vi.fn(async (_entityType: string, _entityId: string) => []);
  const statusChanges: {
    id: string;
    expectedUpdatedAt: string;
    data: TicketStatusData;
    actorId: string;
  }[] = [];
  const updates: {
    id: string;
    expectedUpdatedAt: string;
    data: TicketUpdateData;
    actorId: string;
  }[] = [];
  const pageCalls: { departmentId: string | null; filters: ListTicketsInput }[] = [];
  let sequence = 12;

  const repository = {
    findDepartment: async (id: string) => departamentos.find((d) => d.id === id) ?? null,
    findArea: async (id: string) => areas.find((a) => a.id === id) ?? null,
    findCatalogItem: async (catalog: TicketCatalog, id: string) =>
      catalogos[catalog].find((item) => item.id === id) ?? null,
    findModulo: async (id: string) => modulos.find((m) => m.id === id) ?? null,
    findEstados: async () => estados,
    findByReferencia: async (proveedorId: string, referenciaExterna: string, exceptId?: string) =>
      referencias.find(
        (r) =>
          r.proveedorId === proveedorId &&
          r.referenciaExterna === referenciaExterna &&
          r.id !== exceptId,
      ) ?? null,
    findDetail: async (id: string) => tickets.find((t) => t.id === id) ?? null,
    findDepartmentId: async (id: string) =>
      tickets.find((t) => t.id === id)?.departamento.id ?? null,
    findPage: async (departmentId: string | null, filters: ListTicketsInput) => {
      pageCalls.push({ departmentId, filters });
      return { items: tickets as unknown as TicketSummaryRow[], total: tickets.length };
    },
    create: async (
      data: TicketCreateData,
      actorId: string,
      auditOf: (row: TicketRow) => Omit<AuditEntry, "entityId">,
    ): Promise<TicketRow> => {
      created.push({ data, actorId });
      sequence += 1;
      const nombreDe = <T extends { id: string; nombre: string }>(
        items: T[],
        id: string | null,
      ) => {
        const found = id ? items.find((i) => i.id === id) : null;
        return found ? { id: found.id, nombre: found.nombre } : null;
      };
      const estadoRow = estados.find((e) => e.id === data.estadoId) as EstadoRow;
      const row: TicketRow = {
        id: `t-${sequence}`,
        numero: sequence,
        departamento: nombreDe(departamentos, data.departamentoId) as {
          id: string;
          nombre: string;
        },
        area: null,
        edificio: null,
        tipo: nombreDe(catalogos.tipoTicket, data.tipoId),
        modulo: nombreDe(modulos, data.moduloId),
        prioridad: nombreDe(catalogos.prioridad, data.prioridadId) as {
          id: string;
          nombre: string;
        },
        estado: { id: estadoRow.id, nombre: estadoRow.nombre, clave: estadoRow.clave },
        proveedor: nombreDe(catalogos.proveedor, data.proveedorId),
        titulo: data.titulo,
        descripcion: data.descripcion,
        actuacionSimple: data.actuacionSimple,
        referenciaExterna: data.referenciaExterna,
        numeroFactura: data.numeroFactura,
        solucionDescripcion: null,
        notificado: false,
        fechaRecepcion: data.fechaRecepcion,
        fechaCierre: null,
        fechaReabierto: null,
        creador: { id: actorId, nombre: "Quien crea" },
        editor: { id: actorId, nombre: "Quien crea" },
        createdAt: "2026-10-06T10:00:00.000Z",
        updatedAt: "2026-10-06T10:00:00.000Z",
      };
      audits.push({ ...auditOf(row), entityId: row.id });
      return row;
    },
    // Imita el `update` real: guarda lo que el service decide escribir, deja la auditoría y devuelve
    // la fila con las referencias resueltas por nombre y `updatedAt` nuevo.
    update: async (
      id: string,
      expectedUpdatedAt: string,
      data: TicketUpdateData,
      actorId: string,
      audit: AuditEntry,
    ): Promise<TicketRow> => {
      updates.push({ id, expectedUpdatedAt, data, actorId });
      audits.push(audit);
      const current = tickets.find((t) => t.id === id) as TicketRow;
      const areaDe = (areaId: string | null) => {
        const found = areas.find((a) => a.id === areaId);
        return found ? { id: found.id, nombre: found.nombre, tipo: found.tipo } : null;
      };
      const refOf = (items: ReferenceRow[], refId: string | null) => {
        const found = refId ? items.find((i) => i.id === refId) : null;
        return found ? { id: found.id, nombre: found.nombre } : null;
      };
      return {
        ...current,
        ...data,
        prioridad: refOf(catalogos.prioridad, data.prioridadId) ?? current.prioridad,
        area: areaDe(data.areaId),
        edificio: refOf(catalogos.edificio, data.edificioId),
        tipo: refOf(catalogos.tipoTicket, data.tipoId),
        modulo: refOf(modulos, data.moduloId),
        proveedor: refOf(catalogos.proveedor, data.proveedorId),
        updatedAt: "2026-10-06T11:00:00.000Z",
      };
    },
    // Imita el `changeStatus` real: solo pisa lo que el service manda (lo ausente no se toca).
    changeStatus: async (
      id: string,
      expectedUpdatedAt: string,
      data: TicketStatusData,
      actorId: string,
      audit: AuditEntry,
    ): Promise<TicketRow> => {
      statusChanges.push({ id, expectedUpdatedAt, data, actorId });
      audits.push(audit);
      const current = tickets.find((t) => t.id === id) as TicketRow;
      const destino = estados.find((e) => e.id === data.estadoId) as EstadoRow;
      const { estadoId: _estadoId, ...campos } = data;
      return {
        ...current,
        ...campos,
        estado: { id: destino.id, nombre: destino.nombre, clave: destino.clave },
        updatedAt: "2026-10-06T11:00:00.000Z",
      };
    },
    changeDepartment: async (
      id: string,
      expectedUpdatedAt: string,
      data: TicketDepartmentData,
      actorId: string,
      audit: AuditEntry,
    ): Promise<TicketRow> => {
      departmentChanges.push({ id, expectedUpdatedAt, data, actorId });
      audits.push(audit);
      const current = tickets.find((t) => t.id === id) as TicketRow;
      const destino = departamentos.find((d) => d.id === data.departamentoId) as ReferenceRow;
      return {
        ...current,
        departamento: { id: destino.id, nombre: destino.nombre },
        ...(data.moduloId === null ? { modulo: null } : {}),
        updatedAt: "2026-10-06T11:00:00.000Z",
      };
    },
    softDelete: async (id: string, actorId: string, audit: AuditEntry) => {
      deletions.push({ id, actorId });
      audits.push(audit);
    },
  } as unknown as TicketsRepository;

  return {
    service: new TicketsService(repository, { history } as unknown as AuditService),
    history,
    departmentChanges,
    deletions,
    audits,
    created,
    updates,
    statusChanges,
    pageCalls,
  };
}

describe("TicketsService.create", () => {
  it("el ticket nace en el primer estado activo, con el resto sin asignar", async () => {
    const { service, created } = buildService();

    const ticket = await service.create(input(), agenteTecnico);

    expect(created[0]?.data.estadoId).toBe("pend");
    expect(ticket).toMatchObject({
      numero: 13,
      departamento: { id: "tec", nombre: "Técnico" },
      prioridad: { id: "alta", nombre: "Alta" },
      estado: { id: "pend", nombre: "Pendiente" },
      area: null,
      edificio: null,
      tipo: null,
      modulo: null,
      proveedor: null,
      notificado: false,
      fechaCierre: null,
      fechaReabierto: null,
      solucionDescripcion: null,
    });
  });

  it("si el primer estado está desactivado, nace en el siguiente activo (Q18)", async () => {
    const { service, created } = buildService({
      estados: [estado("pend", "Pendiente", false), estado("prog", "En progreso")],
    });

    await service.create(input(), admin);

    expect(created[0]?.data.estadoId).toBe("prog");
  });

  it("sin ningún estado activo responde 409 y no crea nada", async () => {
    const { service, created } = buildService({ estados: [estado("pend", "Pendiente", false)] });

    await expect(service.create(input(), admin)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(created).toHaveLength(0);
  });

  it("el creador sale de la sesión, y queda un `create` con la foto completa del ticket", async () => {
    const { service, audits, created } = buildService();

    const ticket = await service.create(input({ titulo: "Sin tinta" }), agenteTecnico);

    expect(created[0]?.actorId).toBe("ana");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      entityType: "Ticket",
      entityId: ticket.id,
      action: "create",
      actorId: "ana",
    });
    expect(audits[0]?.payload).toEqual({
      after: {
        numero: 13,
        titulo: "Sin tinta",
        descripcion: null,
        actuacionSimple: null,
        referenciaExterna: null,
        numeroFactura: null,
        solucionDescripcion: null,
        notificado: false,
        fechaRecepcion: "2026-10-01",
        fechaCierre: null,
        fechaReabierto: null,
        departamento: { id: "tec", nombre: "Técnico" },
        area: null,
        edificio: null,
        tipo: null,
        prioridad: { id: "alta", nombre: "Alta" },
        modulo: null,
        estado: { id: "pend", nombre: "Pendiente" },
        proveedor: null,
      },
    });
  });

  it("el admin crea en cualquier departamento activo", async () => {
    const { service } = buildService();

    const ticket = await service.create(input({ departamentoId: "red" }), admin);

    expect(ticket.departamento).toEqual({ id: "red", nombre: "Redes" });
  });

  it("un agente no crea en otro departamento aunque el guard no lo haya frenado: 403", async () => {
    const { service, created, audits } = buildService();

    await expect(
      service.create(input({ departamentoId: "red" }), agenteTecnico),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(created).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  describe("departamento", () => {
    it("inexistente: 400", async () => {
      const { service, created } = buildService();

      await expect(service.create(input({ departamentoId: "nada" }), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
      });
      expect(created).toHaveLength(0);
    });

    it("desactivado: 409, también para un agente de ese mismo departamento", async () => {
      const { service, created } = buildService({
        departamentos: [ref("tec", "Técnico", false), ref("red", "Redes")],
      });

      await expect(service.create(input(), admin)).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "El departamento está desactivado: no admite tickets nuevos",
      });
      await expect(service.create(input(), agenteTecnico)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(created).toHaveLength(0);
    });
  });

  describe("prioridad y proveedor", () => {
    it.each([
      ["inexistente", "nada"],
      ["inactiva", "baja"],
    ])("prioridad %s: 400", async (_caso, prioridadId) => {
      const { service, created } = buildService();

      await expect(service.create(input({ prioridadId }), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "La prioridad no existe o está desactivada",
      });
      expect(created).toHaveLength(0);
    });

    it.each([
      ["inexistente", "nada"],
      ["inactivo", "viejo"],
    ])("proveedor %s: 400", async (_caso, proveedorId) => {
      const { service, created } = buildService();

      await expect(service.create(input({ proveedorId }), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "El proveedor no existe o está desactivado",
      });
      expect(created).toHaveLength(0);
    });

    it("con un proveedor activo y su referencia, los guarda", async () => {
      const { service } = buildService();

      const ticket = await service.create(
        input({ proveedorId: "acme", referenciaExterna: "19092/2026" }),
        admin,
      );

      expect(ticket.proveedor).toEqual({ id: "acme", nombre: "Acme" });
      expect(ticket.referenciaExterna).toBe("19092/2026");
    });
  });

  describe("número de factura (SPEC 10)", () => {
    it("guarda la factura de un proveedor aunque no tenga referencia externa", async () => {
      const { service, created, audits } = buildService();

      const ticket = await service.create(
        input({ proveedorId: "acme", numeroFactura: "0003-00004567" }),
        agenteTecnico,
      );

      expect(created[0]?.data).toMatchObject({
        referenciaExterna: null,
        numeroFactura: "0003-00004567",
      });
      expect(ticket.numeroFactura).toBe("0003-00004567");
      expect(audits[0]?.payload).toMatchObject({
        after: { numeroFactura: "0003-00004567" },
      });
    });

    it("acepta la misma factura en dos tickets del mismo proveedor", async () => {
      const { service, created } = buildService();
      const conFactura = input({ proveedorId: "acme", numeroFactura: "0003-00004567" });

      const primero = await service.create(conFactura, admin);
      const segundo = await service.create(conFactura, admin);

      expect(created).toHaveLength(2);
      expect(primero.numeroFactura).toBe(segundo.numeroFactura);
    });
  });

  describe("referencia externa duplicada (Feature 5.5)", () => {
    const existente = {
      id: "t-1",
      numero: 13,
      departamentoId: "tec",
      proveedorId: "acme",
      referenciaExterna: "19092/2026",
    };

    it("responde 409 y nombra el ticket cuando quien guarda puede verlo", async () => {
      const { service, created } = buildService({ referencias: [existente] });
      const duplicada = input({ proveedorId: "acme", referenciaExterna: "19092/2026" });

      await expect(service.create(duplicada, agenteTecnico)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Esa referencia ya está cargada en el ticket TE-000013",
      });
      await expect(service.create(duplicada, admin)).rejects.toMatchObject({
        message: "Esa referencia ya está cargada en el ticket TE-000013",
      });
      expect(created).toHaveLength(0);
    });

    it("no nombra el ticket si es de otro departamento y quien guarda es un agente", async () => {
      const { service } = buildService({
        referencias: [{ ...existente, departamentoId: "red" }],
      });

      await expect(
        service.create(
          input({ proveedorId: "acme", referenciaExterna: "19092/2026" }),
          agenteTecnico,
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Esa referencia ya está cargada en otro ticket de ese proveedor",
      });
    });

    it("el mismo número con otro proveedor está permitido", async () => {
      const { service } = buildService({
        referencias: [existente],
        catalogos: { proveedor: [ref("acme", "Acme"), ref("otro", "Otro")] },
      });

      const ticket = await service.create(
        input({ proveedorId: "otro", referenciaExterna: "19092/2026" }),
        admin,
      );

      expect(ticket.proveedor?.id).toBe("otro");
    });
  });
});

describe("TicketsService.create: tipo (SPEC 12)", () => {
  const catalogos = {
    tipoTicket: [ref("inc", "Incidente"), ref("viejo", "Viejo", false)],
  };

  it("con un tipo activo: lo guarda, lo devuelve y lo audita", async () => {
    const { service, created, audits } = buildService({ catalogos });

    const ticket = await service.create(input({ tipoId: "inc" }), agenteTecnico);

    expect(created[0]?.data.tipoId).toBe("inc");
    expect(ticket.tipo).toEqual({ id: "inc", nombre: "Incidente" });
    expect(audits[0]?.payload).toMatchObject({
      after: { tipo: { id: "inc", nombre: "Incidente" } },
    });
  });

  it("sin tipo sigue funcionando: queda en null y la auditoría lo muestra vacío", async () => {
    const { service, created, audits } = buildService({ catalogos });

    const ticket = await service.create(input(), agenteTecnico);

    expect(created[0]?.data.tipoId).toBeNull();
    expect(ticket.tipo).toBeNull();
    expect(audits[0]?.payload).toMatchObject({ after: { tipo: null } });
  });

  it("un tipo inexistente (o eliminado, que el repository no devuelve) o desactivado: 400 y no crea nada", async () => {
    const { service, created, audits } = buildService({ catalogos });

    for (const tipoId of ["nada", "viejo"]) {
      await expect(service.create(input({ tipoId }), agenteTecnico)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "El tipo de ticket no existe o está desactivado",
      });
    }
    expect(created).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe("TicketsService.create: módulo (SPEC 11)", () => {
  const modulos = [
    modulo("serv", "Servidores", ["tec", "red"]),
    modulo("mesa", "Mesa de entradas", ["red"]),
    modulo("viejo", "Viejo", ["tec"], false),
  ];

  it("con un módulo del departamento del ticket: lo guarda y lo audita", async () => {
    const { service, created, audits } = buildService({ modulos });

    const ticket = await service.create(input({ moduloId: "serv" }), agenteTecnico);

    expect(created[0]?.data.moduloId).toBe("serv");
    expect(ticket.modulo).toEqual({ id: "serv", nombre: "Servidores" });
    expect(audits[0]?.payload).toMatchObject({
      after: { modulo: { id: "serv", nombre: "Servidores" } },
    });
  });

  it("sin módulo sigue funcionando: queda en null", async () => {
    const { service, created } = buildService({ modulos });

    const ticket = await service.create(input(), agenteTecnico);

    expect(created[0]?.data.moduloId).toBeNull();
    expect(ticket.modulo).toBeNull();
  });

  it("un módulo de otro departamento: 400 y no crea nada", async () => {
    const { service, created, audits } = buildService({ modulos });

    await expect(service.create(input({ moduloId: "mesa" }), agenteTecnico)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
      message: "El módulo no es del departamento del ticket",
    });
    expect(created).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("un módulo inexistente, eliminado o desactivado: 400 «no existe o está desactivado»", async () => {
    const { service, created } = buildService({ modulos });

    for (const moduloId of ["nada", "viejo"]) {
      await expect(service.create(input({ moduloId }), agenteTecnico)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "El módulo no existe o está desactivado",
      });
    }
    expect(created).toHaveLength(0);
  });

  it("el admin crea en otro departamento: el módulo se valida contra el del ticket", async () => {
    const { service } = buildService({ modulos });

    await expect(
      service.create(input({ departamentoId: "red", moduloId: "mesa" }), admin),
    ).resolves.toMatchObject({ modulo: { id: "mesa" } });
    await expect(
      service.create(input({ departamentoId: "red", moduloId: "viejo" }), admin),
    ).rejects.toMatchObject({ message: "El módulo no existe o está desactivado" });
  });
});

describe("TicketsService.update", () => {
  const ticket = unTicket();
  const finalizado = { id: "fin", nombre: "Finalizado", clave: "FINALIZADO" as const };

  it("sin cambios responde 200 con el ticket y no escribe ni audita", async () => {
    const { service, updates, audits } = buildService({ tickets: [ticket] });

    await expect(service.update(edit(ticket), agenteTecnico)).resolves.toEqual(ticket);
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("con la versión desactualizada responde 409, aun sin cambios, y no guarda nada", async () => {
    const { service, updates, audits } = buildService({ tickets: [ticket] });
    const vieja = edit(ticket, { updatedAt: "2026-10-06T09:00:00.000Z", titulo: "Otro título" });

    await expect(service.update(vieja, agenteTecnico)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "Otro usuario modificó este ticket. Recargá para ver los cambios.",
    });
    await expect(
      service.update(edit(ticket, { updatedAt: "2026-10-06T09:00:00.000Z" }), agenteTecnico),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("compara instantes: el mismo `updatedAt` en otro formato no es una versión vieja", async () => {
    const { service, updates } = buildService({ tickets: [ticket] });

    await service.update(
      edit(ticket, { updatedAt: "2026-10-06T10:00:00Z", titulo: "Otro título" }),
      agenteTecnico,
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]?.expectedUpdatedAt).toBe("2026-10-06T10:00:00Z");
  });

  it("un ticket inexistente o eliminado responde 404", async () => {
    const { service } = buildService();

    await expect(service.update(edit(ticket), admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("un agente de otro departamento recibe 404 y no se escribe ni audita nada", async () => {
    const { service, updates, audits } = buildService({ tickets: [ticket] });

    await expect(
      service.update(edit(ticket, { titulo: "Pisado" }), agenteRedes),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("guarda el cambio con todos los campos editables y audita solo el diff, con el actor", async () => {
    const { service, updates, audits } = buildService({ tickets: [ticket] });

    const result = await service.update(
      edit(ticket, { titulo: "Impresora sin tinta", descripcion: "Piso 2" }),
      agenteTecnico,
    );

    expect(result).toMatchObject({ titulo: "Impresora sin tinta", descripcion: "Piso 2" });
    expect(updates[0]).toMatchObject({
      id: "t-1",
      actorId: "ana",
      data: {
        titulo: "Impresora sin tinta",
        descripcion: "Piso 2",
        prioridadId: "alta",
        areaId: null,
        proveedorId: null,
        fechaRecepcion: "2026-10-01",
        notificado: false,
      },
    });
    expect(audits).toEqual([
      {
        entityType: "Ticket",
        entityId: "t-1",
        action: "update",
        actorId: "ana",
        payload: {
          before: { titulo: "Impresora rota", descripcion: null },
          after: { titulo: "Impresora sin tinta", descripcion: "Piso 2" },
        },
      },
    ]);
  });

  describe("área, edificio, tipo y módulo", () => {
    const areas = [area("sist", "Sistemas"), area("arch", "Archivo", false)];
    const catalogos = {
      edificio: [ref("ed1", "Edificio 1")],
      tipoTicket: [ref("inc", "Incidente")],
    };
    const modulos = [modulo("mesa", "Mesa de entradas", ["tec"])];

    it("se completan después del alta, con su nombre en la auditoría", async () => {
      const { service, updates, audits } = buildService({
        tickets: [ticket],
        catalogos,
        areas,
        modulos,
      });

      await service.update(
        edit(ticket, { areaId: "sist", edificioId: "ed1", tipoId: "inc", moduloId: "mesa" }),
        admin,
      );

      expect(updates[0]?.data).toMatchObject({
        areaId: "sist",
        edificioId: "ed1",
        tipoId: "inc",
        moduloId: "mesa",
      });
      expect(audits[0]?.payload).toEqual({
        before: { area: null, edificio: null, tipo: null, modulo: null },
        after: {
          area: { id: "sist", nombre: "Diputado · Sistemas" },
          edificio: { id: "ed1", nombre: "Edificio 1" },
          tipo: { id: "inc", nombre: "Incidente" },
          modulo: { id: "mesa", nombre: "Mesa de entradas" },
        },
      });
    });

    it("cambiar de área deja «Tipo · Nombre» antes y después en el historial", async () => {
      const bloque = { id: "blo", nombre: "Bloque" };
      const conArea = unTicket({ area: { id: "sist", nombre: "Sistemas", tipo: diputado } });
      const { service, audits } = buildService({
        tickets: [conArea],
        areas: [area("sist", "Sistemas"), { ...area("uce", "UCR"), tipo: bloque }],
      });

      const updated = await service.update(edit(conArea, { areaId: "uce" }), admin);

      expect(updated.area).toEqual({ id: "uce", nombre: "UCR", tipo: bloque });
      expect(audits[0]?.payload).toEqual({
        before: { area: { id: "sist", nombre: "Diputado · Sistemas" } },
        after: { area: { id: "uce", nombre: "Bloque · UCR" } },
      });
    });

    it("null borra el valor y el historial conserva el anterior", async () => {
      const conArea = unTicket({ area: { id: "sist", nombre: "Sistemas", tipo: diputado } });
      const { service, updates, audits } = buildService({ tickets: [conArea], catalogos, areas });

      await service.update(edit(conArea, { areaId: null }), admin);

      expect(updates[0]?.data.areaId).toBeNull();
      expect(audits[0]?.payload).toEqual({
        before: { area: { id: "sist", nombre: "Diputado · Sistemas" } },
        after: { area: null },
      });
    });

    it.each([
      ["desactivada", "arch"],
      ["inexistente o eliminada", "nada"],
    ])("un área nueva %s: 400 y no guarda", async (_caso, areaId) => {
      const { service, updates } = buildService({ tickets: [ticket], catalogos, areas });

      await expect(service.update(edit(ticket, { areaId }), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "El área no existe o está desactivada",
      });
      expect(updates).toHaveLength(0);
    });

    it("un área que ya tenía se acepta aunque hoy esté desactivada o eliminada", async () => {
      const conArea = unTicket({ area: { id: "arch", nombre: "Archivo", tipo: diputado } });
      const { service, updates } = buildService({ tickets: [conArea], catalogos, areas });
      const eliminada = unTicket({ area: { id: "borrada", nombre: "Vieja", tipo: diputado } });
      const { service: otro, updates: otrosUpdates } = buildService({
        tickets: [eliminada],
        catalogos,
        areas,
      });

      await service.update(edit(conArea, { titulo: "Otro título" }), admin);
      await otro.update(edit(eliminada, { titulo: "Otro título" }), admin);

      expect(updates[0]?.data.areaId).toBe("arch");
      expect(otrosUpdates[0]?.data.areaId).toBe("borrada");
    });
  });

  describe("prioridad y proveedor", () => {
    it("una prioridad nueva desactivada: 400", async () => {
      const { service, updates } = buildService({ tickets: [ticket] });

      await expect(
        service.update(edit(ticket, { prioridadId: "baja" }), admin),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "La prioridad no existe o está desactivada",
      });
      expect(updates).toHaveLength(0);
    });

    it("un proveedor nuevo desactivado o inexistente: 400", async () => {
      const { service } = buildService({ tickets: [ticket] });

      for (const proveedorId of ["viejo", "nada"]) {
        await expect(service.update(edit(ticket, { proveedorId }), admin)).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "El proveedor no existe o está desactivado",
        });
      }
    });

    it("un proveedor que ya tenía se acepta aunque hoy esté desactivado", async () => {
      const conViejo = unTicket({ proveedor: { id: "viejo", nombre: "Viejo" } });
      const { service, updates } = buildService({ tickets: [conViejo] });

      await service.update(edit(conViejo, { titulo: "Otro título" }), admin);

      expect(updates[0]?.data.proveedorId).toBe("viejo");
    });
  });

  describe("fechas y solución en un ticket cerrado", () => {
    const cerrado = unTicket({
      estado: finalizado,
      fechaCierre: "2026-10-03",
      solucionDescripcion: "Se cambió el toner",
    });

    it("se edita con el ticket en un estado de cierre (Q23)", async () => {
      const { service, updates } = buildService({ tickets: [cerrado] });

      await service.update(edit(cerrado, { titulo: "Impresora reparada" }), agenteTecnico);

      expect(updates).toHaveLength(1);
    });

    it("corrige la fecha de cierre y la solución, y deja el diff", async () => {
      const { service, updates, audits } = buildService({ tickets: [cerrado] });

      await service.update(
        edit(cerrado, { fechaCierre: "2026-10-02", solucionDescripcion: "Cambio de toner" }),
        agenteTecnico,
      );

      expect(updates[0]?.data).toMatchObject({
        fechaCierre: "2026-10-02",
        solucionDescripcion: "Cambio de toner",
      });
      expect(audits[0]?.payload).toEqual({
        before: { fechaCierre: "2026-10-03", solucionDescripcion: "Se cambió el toner" },
        after: { fechaCierre: "2026-10-02", solucionDescripcion: "Cambio de toner" },
      });
    });

    it("la solución se carga y se borra en cualquier momento", async () => {
      const sinSolucion = unTicket({ id: "t-2" });
      const { service, updates } = buildService({ tickets: [sinSolucion, cerrado] });

      await service.update(edit(sinSolucion, { solucionDescripcion: "Reinicio" }), admin);
      await service.update(edit(cerrado, { solucionDescripcion: null }), admin);

      expect(updates.map((u) => u.data.solucionDescripcion)).toEqual(["Reinicio", null]);
    });

    it("no se puede borrar la fecha de cierre por esta vía: 400", async () => {
      const { service, updates } = buildService({ tickets: [cerrado] });

      await expect(
        service.update(edit(cerrado, { fechaCierre: null }), admin),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
      expect(updates).toHaveLength(0);
    });

    it("no se puede cargar una fecha de cierre ni de reapertura donde no hay: 400", async () => {
      const { service, updates } = buildService({ tickets: [ticket] });

      await expect(
        service.update(edit(ticket, { fechaCierre: "2026-10-03" }), admin),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        service.update(edit(ticket, { fechaReabierto: "2026-10-03" }), admin),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(updates).toHaveLength(0);
    });

    it("corrige la fecha de reapertura si ya existe, pero no la borra", async () => {
      const reabierto = unTicket({ fechaReabierto: "2026-10-04" });
      const { service, updates } = buildService({ tickets: [reabierto] });

      await service.update(edit(reabierto, { fechaReabierto: "2026-10-05" }), admin);
      await expect(
        service.update(edit(reabierto, { fechaReabierto: null }), admin),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(updates.map((u) => u.data.fechaReabierto)).toEqual(["2026-10-05"]);
    });

    it("se marca y desmarca `notificado` con el ticket cerrado", async () => {
      const { service, updates } = buildService({ tickets: [cerrado] });

      await service.update(edit(cerrado, { notificado: true }), agenteTecnico);

      expect(updates[0]?.data.notificado).toBe(true);
    });
  });

  it("corrige la fecha de recepción", async () => {
    const { service, updates, audits } = buildService({ tickets: [ticket] });

    await service.update(edit(ticket, { fechaRecepcion: "2026-09-30" }), agenteTecnico);

    expect(updates[0]?.data.fechaRecepcion).toBe("2026-09-30");
    expect(audits[0]?.payload).toEqual({
      before: { fechaRecepcion: "2026-10-01" },
      after: { fechaRecepcion: "2026-09-30" },
    });
  });

  describe("referencia externa (Feature 5.5)", () => {
    const conProveedor = unTicket({
      proveedor: { id: "acme", nombre: "Acme" },
      referenciaExterna: "19092/2026",
    });
    const ajeno = {
      id: "t-9",
      numero: 20,
      departamentoId: "tec",
      proveedorId: "acme",
      referenciaExterna: "555/2026",
    };

    it("agrega proveedor y referencia", async () => {
      const { service, updates, audits } = buildService({ tickets: [ticket] });

      await service.update(
        edit(ticket, { proveedorId: "acme", referenciaExterna: "19092/2026" }),
        agenteTecnico,
      );

      expect(updates[0]?.data).toMatchObject({
        proveedorId: "acme",
        referenciaExterna: "19092/2026",
      });
      expect(audits[0]?.payload).toEqual({
        before: { proveedor: null, referenciaExterna: null },
        after: { proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" },
      });
    });

    it("asociar un proveedor no toca el estado ni el departamento (Q28)", async () => {
      const { service, updates } = buildService({ tickets: [ticket] });

      await service.update(edit(ticket, { proveedorId: "acme" }), agenteTecnico);

      expect(updates[0]?.data).not.toHaveProperty("estadoId");
      expect(updates[0]?.data).not.toHaveProperty("departamentoId");
    });

    it("la referencia que el propio ticket ya tiene no cuenta como duplicada", async () => {
      const propia = { ...ajeno, id: "t-1", numero: 13, referenciaExterna: "19092/2026" };
      const { service, updates } = buildService({
        tickets: [conProveedor],
        referencias: [propia],
      });

      await service.update(edit(conProveedor, { titulo: "Otro título" }), agenteTecnico);

      expect(updates).toHaveLength(1);
    });

    it("la de otro ticket del mismo proveedor: 409 con su número", async () => {
      const { service, updates } = buildService({ tickets: [ticket], referencias: [ajeno] });

      await expect(
        service.update(edit(ticket, { proveedorId: "acme", referenciaExterna: "555/2026" }), admin),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "Esa referencia ya está cargada en el ticket TE-000020",
      });
      expect(updates).toHaveLength(0);
    });

    it("un agente no se entera de qué ticket es si es de otro departamento", async () => {
      const { service } = buildService({
        tickets: [ticket],
        referencias: [{ ...ajeno, departamentoId: "red" }],
      });

      await expect(
        service.update(
          edit(ticket, { proveedorId: "acme", referenciaExterna: "555/2026" }),
          agenteTecnico,
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Esa referencia ya está cargada en otro ticket de ese proveedor",
      });
    });

    it("el mismo número con otro proveedor está permitido", async () => {
      const { service, updates } = buildService({
        tickets: [ticket],
        referencias: [ajeno],
        catalogos: { proveedor: [ref("acme", "Acme"), ref("otro", "Otro")] },
      });

      await service.update(
        edit(ticket, { proveedorId: "otro", referenciaExterna: "555/2026" }),
        admin,
      );

      expect(updates[0]?.data.proveedorId).toBe("otro");
    });

    it("quitar el proveedor borra la referencia en la misma operación, y el historial la conserva", async () => {
      const { service, updates, audits } = buildService({ tickets: [conProveedor] });

      await service.update(
        edit(conProveedor, { proveedorId: null, referenciaExterna: null }),
        admin,
      );

      expect(updates[0]?.data).toMatchObject({ proveedorId: null, referenciaExterna: null });
      expect(audits[0]?.payload).toEqual({
        before: { proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" },
        after: { proveedor: null, referenciaExterna: null },
      });
    });

    it("al cambiar de proveedor, la referencia anterior no se conserva si no se manda otra", async () => {
      const { service, updates } = buildService({
        tickets: [conProveedor],
        catalogos: { proveedor: [ref("acme", "Acme"), ref("otro", "Otro")] },
      });

      await service.update(
        edit(conProveedor, { proveedorId: "otro", referenciaExterna: null }),
        admin,
      );

      expect(updates[0]?.data).toMatchObject({ proveedorId: "otro", referenciaExterna: null });
    });
  });

  describe("número de factura (SPEC 10)", () => {
    const conFactura = unTicket({
      proveedor: { id: "acme", nombre: "Acme" },
      numeroFactura: "0003-00004567",
    });

    it("la cambia y deja el diff con el valor anterior y el nuevo", async () => {
      const { service, updates, audits } = buildService({ tickets: [conFactura] });

      const updated = await service.update(
        edit(conFactura, { numeroFactura: "0003-00004568" }),
        agenteTecnico,
      );

      expect(updates[0]?.data.numeroFactura).toBe("0003-00004568");
      expect(updated.numeroFactura).toBe("0003-00004568");
      expect(audits[0]).toMatchObject({ action: "update", entityId: "t-1" });
      expect(audits[0]?.payload).toEqual({
        before: { numeroFactura: "0003-00004567" },
        after: { numeroFactura: "0003-00004568" },
      });
    });

    it("la agrega a un ticket con proveedor y sin factura", async () => {
      const sinFactura = unTicket({ proveedor: { id: "acme", nombre: "Acme" } });
      const { service, audits } = buildService({ tickets: [sinFactura] });

      await service.update(edit(sinFactura, { numeroFactura: "A-12" }), agenteTecnico);

      expect(audits[0]?.payload).toEqual({
        before: { numeroFactura: null },
        after: { numeroFactura: "A-12" },
      });
    });

    it("al vaciarla (cambiando de proveedor), el historial conserva la anterior", async () => {
      const { service, updates, audits } = buildService({
        tickets: [conFactura],
        catalogos: { proveedor: [ref("acme", "Acme"), ref("otro", "Otro")] },
      });

      await service.update(edit(conFactura, { proveedorId: "otro", numeroFactura: null }), admin);

      expect(updates[0]?.data).toMatchObject({ proveedorId: "otro", numeroFactura: null });
      expect(audits[0]?.payload).toEqual({
        before: { proveedor: { id: "acme", nombre: "Acme" }, numeroFactura: "0003-00004567" },
        after: { proveedor: { id: "otro", nombre: "Otro" }, numeroFactura: null },
      });
    });

    it("una edición sin cambios no escribe ni audita", async () => {
      const { service, updates, audits } = buildService({ tickets: [conFactura] });

      const result = await service.update(edit(conFactura), agenteTecnico);

      expect(result).toEqual(conFactura);
      expect(updates).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("una edición que solo cambia los espacios de los extremos no cambia nada", async () => {
      const { service, updates, audits } = buildService({ tickets: [conFactura] });
      // El contrato recorta antes de llegar al service: se parsea igual que lo hace oRPC.
      const entrada = updateTicketInputSchema.parse({
        ...edit(conFactura),
        numeroFactura: "  0003-00004567  ",
      });

      await service.update(entrada, agenteTecnico);

      expect(updates).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("se edita con el ticket cerrado como cualquier otro campo", async () => {
      const cerrada = unTicket({
        proveedor: { id: "acme", nombre: "Acme" },
        fechaCierre: "2026-10-05",
      });
      const { service, updates } = buildService({ tickets: [cerrada] });

      await service.update(edit(cerrada, { numeroFactura: "A-12" }), agenteTecnico);

      expect(updates[0]?.data.numeroFactura).toBe("A-12");
    });
  });
});

// Estados con `clave` como los del seed, pero con un nombre cambiado ("Resuelto") y otro sin clave
// que se llama "Finalizado": la regla es por `clave`, nunca por nombre (D1).
const ESTADOS: EstadoRow[] = [
  { id: "pend", nombre: "Pendiente", activo: true, clave: null },
  { id: "prog", nombre: "En progreso", activo: true, clave: null },
  { id: "fin", nombre: "Resuelto", activo: true, clave: "FINALIZADO" },
  { id: "cer", nombre: "Cerrado", activo: true, clave: "CERRADO" },
  { id: "can", nombre: "Cancelado", activo: true, clave: "CANCELADO" },
  { id: "rea", nombre: "Reabierto", activo: true, clave: "REABIERTO" },
  { id: "falso", nombre: "Finalizado", activo: true, clave: null },
  { id: "arch", nombre: "Archivado", activo: false, clave: null },
];

const cambio = (
  t: TicketRow,
  estadoId: string,
  extra: Partial<ChangeTicketStatusInput> = {},
): ChangeTicketStatusInput => ({ ticketId: t.id, updatedAt: t.updatedAt, estadoId, ...extra });

describe("TicketsService.update: módulo (SPEC 11)", () => {
  const modulos = [
    modulo("serv", "Servidores", ["tec", "red"]),
    modulo("mesa", "Mesa de entradas", ["red"]),
    modulo("correo", "Correo", ["tec"]),
  ];

  it("elegir un módulo nuevo de otro departamento: 400", async () => {
    const ticket = unTicket();
    const { service, updates } = buildService({ tickets: [ticket], modulos });

    await expect(
      service.update(edit(ticket, { moduloId: "mesa" }), agenteTecnico),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El módulo no es del departamento del ticket",
    });
    expect(updates).toHaveLength(0);
  });

  it("elegir un módulo nuevo del departamento actual del ticket: 200", async () => {
    const ticket = unTicket();
    const { service, updates } = buildService({ tickets: [ticket], modulos });

    await service.update(edit(ticket, { moduloId: "correo" }), agenteTecnico);

    expect(updates[0]?.data.moduloId).toBe("correo");
  });

  it("se valida contra el departamento actual del ticket, no contra el del agente que edita", async () => {
    const ticket = unTicket({ departamento: { id: "red", nombre: "Redes" } });
    const { service } = buildService({ tickets: [ticket], modulos });

    await expect(service.update(edit(ticket, { moduloId: "mesa" }), admin)).resolves.toMatchObject({
      modulo: { id: "mesa" },
    });
    await expect(service.update(edit(ticket, { moduloId: "correo" }), admin)).rejects.toMatchObject(
      { message: "El módulo no es del departamento del ticket" },
    );
  });

  it("conservar un módulo al que le quitaron el departamento: 200, sin tocar el módulo", async () => {
    // «Mesa» ya no es de Técnico, pero el ticket de Técnico lo tenía: se acepta el que ya tenía.
    const ticket = unTicket({ modulo: { id: "mesa", nombre: "Mesa de entradas" } });
    const { service, updates } = buildService({ tickets: [ticket], modulos });

    const result = await service.update(
      edit(ticket, { titulo: "Impresora sin tinta" }),
      agenteTecnico,
    );

    expect(result.modulo).toEqual({ id: "mesa", nombre: "Mesa de entradas" });
    expect(updates[0]?.data.moduloId).toBe("mesa");
  });

  it("conservar un módulo desactivado o eliminado también se acepta", async () => {
    // «borrado» no figura en el catálogo (eliminado) y «apagado» está desactivado.
    const apagado = modulo("apagado", "Apagado", ["tec"], false);
    for (const actual of [
      { id: "borrado", nombre: "Borrado" },
      { id: "apagado", nombre: "Apagado" },
    ]) {
      const ticket = unTicket({ modulo: actual });
      const { service, updates } = buildService({
        tickets: [ticket],
        modulos: [...modulos, apagado],
      });

      await service.update(edit(ticket, { titulo: "Otro título" }), agenteTecnico);

      expect(updates[0]?.data.moduloId).toBe(actual.id);
    }
  });

  it("update no vacía el módulo por su cuenta: solo lo cambia si la web manda otro valor", async () => {
    const ticket = unTicket({ modulo: { id: "mesa", nombre: "Mesa de entradas" } });
    const { service, updates } = buildService({ tickets: [ticket], modulos });

    await service.update(edit(ticket, { moduloId: null }), agenteTecnico);

    expect(updates[0]?.data.moduloId).toBeNull();
  });
});

describe("TicketsService.changeStatus", () => {
  const ticket = unTicket();
  const cerrado = unTicket({
    estado: { id: "fin", nombre: "Resuelto", clave: "FINALIZADO" },
    fechaCierre: "2026-10-03",
    solucionDescripcion: "Se cambió el toner",
  });

  describe("estados de cierre", () => {
    it.each([
      ["fin", "FINALIZADO"],
      ["cer", "CERRADO"],
      ["can", "CANCELADO"],
    ])("pasar a %s (%s) sin fecha de cierre: 400 y el estado no cambia", async (estadoId) => {
      const { service, statusChanges, audits } = buildService({
        tickets: [ticket],
        estados: ESTADOS,
      });

      await expect(
        service.changeStatus(cambio(ticket, estadoId), agenteTecnico),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "Para pasar a un estado de cierre hay que indicar la fecha de cierre",
      });
      expect(statusChanges).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("con la fecha de cierre y sin solución funciona, y deja el diff con el estado", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [ticket],
        estados: ESTADOS,
      });

      const result = await service.changeStatus(
        cambio(ticket, "fin", { fechaCierre: "2026-10-05" }),
        agenteTecnico,
      );

      expect(result).toMatchObject({
        estado: { id: "fin", nombre: "Resuelto", clave: "FINALIZADO" },
        fechaCierre: "2026-10-05",
        solucionDescripcion: null,
      });
      // La solución no viene: no se toca (ni siquiera se escribe).
      expect(statusChanges[0]?.data).toEqual({ estadoId: "fin", fechaCierre: "2026-10-05" });
      expect(statusChanges[0]).toMatchObject({ id: "t-1", actorId: "ana" });
      expect(audits).toEqual([
        {
          entityType: "Ticket",
          entityId: "t-1",
          action: "update",
          actorId: "ana",
          payload: {
            before: { estado: { id: "pend", nombre: "Pendiente" }, fechaCierre: null },
            after: { estado: { id: "fin", nombre: "Resuelto" }, fechaCierre: "2026-10-05" },
          },
        },
      ]);
    });

    it("la solución es opcional: si viene reemplaza la actual, y en blanco la borra", async () => {
      const { service, statusChanges } = buildService({
        tickets: [ticket, cerrado],
        estados: ESTADOS,
      });
      const otro = unTicket({ id: "t-2" });
      const { service: s2, statusChanges: c2 } = buildService({
        tickets: [otro],
        estados: ESTADOS,
      });

      await s2.changeStatus(
        cambio(otro, "cer", { fechaCierre: "2026-10-05", solucionDescripcion: "Se reinició" }),
        admin,
      );
      await service.changeStatus(
        cambio(cerrado, "cer", { fechaCierre: "2026-10-03", solucionDescripcion: null }),
        admin,
      );

      expect(c2[0]?.data).toEqual({
        estadoId: "cer",
        fechaCierre: "2026-10-05",
        solucionDescripcion: "Se reinició",
      });
      expect(statusChanges[0]?.data).toEqual({
        estadoId: "cer",
        fechaCierre: "2026-10-03",
        solucionDescripcion: null,
      });
    });

    it("de un estado de cierre a otro: la fecha llega igual, se puede corregir y no se recalcula sola", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [cerrado],
        estados: ESTADOS,
      });

      await service.changeStatus(cambio(cerrado, "cer", { fechaCierre: "2026-10-03" }), admin);
      expect(audits[0]?.payload).toEqual({
        before: { estado: { id: "fin", nombre: "Resuelto" } },
        after: { estado: { id: "cer", nombre: "Cerrado" } },
      });

      await service.changeStatus(cambio(cerrado, "can", { fechaCierre: "2026-10-02" }), admin);
      expect(audits[1]?.payload).toMatchObject({
        before: { fechaCierre: "2026-10-03" },
        after: { fechaCierre: "2026-10-02" },
      });
      expect(statusChanges).toHaveLength(2);
    });

    it("un estado de cierre no admite fecha de reapertura: 400", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await expect(
        service.changeStatus(
          cambio(ticket, "fin", { fechaCierre: "2026-10-05", fechaReabierto: "2026-10-05" }),
          admin,
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Este estado no admite fecha de reapertura",
      });
      expect(statusChanges).toHaveLength(0);
    });
  });

  describe("la regla es por clave, no por nombre (D1)", () => {
    it("un estado de cierre renombrado ('Resuelto') sigue exigiendo la fecha", async () => {
      const { service } = buildService({ tickets: [ticket], estados: ESTADOS });

      await expect(service.changeStatus(cambio(ticket, "fin"), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("un estado sin clave que se llama 'Finalizado' no exige fecha ni la admite", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await service.changeStatus(cambio(ticket, "falso"), admin);
      await expect(
        service.changeStatus(cambio(ticket, "falso", { fechaCierre: "2026-10-05" }), admin),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Este estado no admite fecha de cierre",
      });

      expect(statusChanges).toHaveLength(1);
      expect(statusChanges[0]?.data).toEqual({ estadoId: "falso" });
    });
  });

  describe("reapertura", () => {
    it("sin fecha de reapertura: 400 y el estado no cambia", async () => {
      const { service, statusChanges } = buildService({ tickets: [cerrado], estados: ESTADOS });

      await expect(service.changeStatus(cambio(cerrado, "rea"), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Para reabrir el ticket hay que indicar la fecha de reapertura",
      });
      expect(statusChanges).toHaveLength(0);
    });

    it("con la fecha funciona y conserva la fecha de cierre y la solución", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [cerrado],
        estados: ESTADOS,
      });

      const result = await service.changeStatus(
        cambio(cerrado, "rea", { fechaReabierto: "2026-10-05" }),
        agenteTecnico,
      );

      expect(statusChanges[0]?.data).toEqual({ estadoId: "rea", fechaReabierto: "2026-10-05" });
      expect(result).toMatchObject({
        estado: { id: "rea", clave: "REABIERTO" },
        fechaReabierto: "2026-10-05",
        fechaCierre: "2026-10-03",
        solucionDescripcion: "Se cambió el toner",
      });
      expect(audits[0]?.payload).toEqual({
        before: { estado: { id: "fin", nombre: "Resuelto" }, fechaReabierto: null },
        after: { estado: { id: "rea", nombre: "Reabierto" }, fechaReabierto: "2026-10-05" },
      });
    });

    it("no admite fecha de cierre ni solución: 400", async () => {
      const { service, statusChanges } = buildService({ tickets: [cerrado], estados: ESTADOS });

      await expect(
        service.changeStatus(
          cambio(cerrado, "rea", { fechaReabierto: "2026-10-05", fechaCierre: "2026-10-05" }),
          admin,
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Este estado no admite fecha de cierre",
      });
      await expect(
        service.changeStatus(
          cambio(cerrado, "rea", { fechaReabierto: "2026-10-05", solucionDescripcion: "x" }),
          admin,
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Este estado no admite una solución",
      });
      expect(statusChanges).toHaveLength(0);
    });
  });

  describe("estados sin clave de cierre ni reapertura", () => {
    it("pasar de un ticket cerrado a 'En progreso' no pide ni modifica ninguna fecha (Q26)", async () => {
      const { service, statusChanges } = buildService({ tickets: [cerrado], estados: ESTADOS });

      const result = await service.changeStatus(cambio(cerrado, "prog"), agenteTecnico);

      expect(statusChanges[0]?.data).toEqual({ estadoId: "prog" });
      expect(result).toMatchObject({
        estado: { id: "prog" },
        fechaCierre: "2026-10-03",
        solucionDescripcion: "Se cambió el toner",
      });
    });

    it.each([
      ["fecha de cierre", { fechaCierre: "2026-10-05" }, "Este estado no admite fecha de cierre"],
      [
        "fecha de reapertura",
        { fechaReabierto: "2026-10-05" },
        "Este estado no admite fecha de reapertura",
      ],
      ["solución", { solucionDescripcion: "x" }, "Este estado no admite una solución"],
    ])("mandar una %s: 400", async (_campo, extra, message) => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await expect(
        service.changeStatus(cambio(ticket, "prog", extra), admin),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message,
      });
      expect(statusChanges).toHaveLength(0);
    });
  });

  describe("estado destino", () => {
    it("cualquier estado activo es válido: no hay máquina de transiciones (Q25)", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await service.changeStatus(cambio(ticket, "rea", { fechaReabierto: "2026-10-05" }), admin);
      await service.changeStatus(cambio(ticket, "can", { fechaCierre: "2026-10-05" }), admin);
      await service.changeStatus(cambio(ticket, "prog"), admin);

      expect(statusChanges.map((c) => c.data.estadoId)).toEqual(["rea", "can", "prog"]);
    });

    it("inexistente: 400", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await expect(service.changeStatus(cambio(ticket, "nada"), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "El estado no existe",
      });
      expect(statusChanges).toHaveLength(0);
    });

    it("desactivado: 400", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await expect(service.changeStatus(cambio(ticket, "arch"), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "El estado está desactivado",
      });
      expect(statusChanges).toHaveLength(0);
    });

    it("el estado que el ticket ya tiene se acepta aunque se haya desactivado después", async () => {
      const enArchivado = unTicket({ estado: { id: "arch", nombre: "Archivado", clave: null } });
      const { service, statusChanges } = buildService({ tickets: [enArchivado], estados: ESTADOS });

      await service.changeStatus(cambio(enArchivado, "arch"), admin);

      expect(statusChanges).toHaveLength(0); // sin cambios efectivos
    });
  });

  describe("sin cambios efectivos y concurrencia", () => {
    it("elegir el estado actual sin tocar fechas responde 200 y no escribe ni audita", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [ticket],
        estados: ESTADOS,
      });

      await expect(service.changeStatus(cambio(ticket, "pend"), admin)).resolves.toEqual(ticket);
      expect(statusChanges).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("elegir el estado de cierre actual con la misma fecha tampoco audita", async () => {
      const { service, statusChanges } = buildService({ tickets: [cerrado], estados: ESTADOS });

      await service.changeStatus(cambio(cerrado, "fin", { fechaCierre: "2026-10-03" }), admin);

      expect(statusChanges).toHaveLength(0);
    });

    it("elegir el estado de cierre actual con otra fecha la corrige y audita", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [cerrado],
        estados: ESTADOS,
      });

      await service.changeStatus(cambio(cerrado, "fin", { fechaCierre: "2026-10-01" }), admin);

      expect(statusChanges).toHaveLength(1);
      expect(audits[0]?.payload).toEqual({
        before: { fechaCierre: "2026-10-03" },
        after: { fechaCierre: "2026-10-01" },
      });
    });

    it("con la versión desactualizada responde 409 y no guarda nada", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [ticket],
        estados: ESTADOS,
      });

      await expect(
        service.changeStatus(
          cambio(ticket, "prog", { updatedAt: "2026-10-06T09:00:00.000Z" }),
          admin,
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "Otro usuario modificó este ticket. Recargá para ver los cambios.",
      });
      expect(statusChanges).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("pasa la versión leída al repository para el bloqueo optimista", async () => {
      const { service, statusChanges } = buildService({ tickets: [ticket], estados: ESTADOS });

      await service.changeStatus(cambio(ticket, "prog"), admin);

      expect(statusChanges[0]?.expectedUpdatedAt).toBe(ticket.updatedAt);
    });

    it("un agente de otro departamento recibe 404 y el estado no cambia", async () => {
      const { service, statusChanges, audits } = buildService({
        tickets: [ticket],
        estados: ESTADOS,
      });

      await expect(service.changeStatus(cambio(ticket, "prog"), agenteRedes)).rejects.toMatchObject(
        {
          code: "NOT_FOUND",
          status: 404,
        },
      );
      expect(statusChanges).toHaveLength(0);
      expect(audits).toHaveLength(0);
    });

    it("un ticket inexistente o eliminado: 404", async () => {
      const { service } = buildService({ estados: ESTADOS });

      await expect(service.changeStatus(cambio(ticket, "prog"), admin)).rejects.toMatchObject({
        code: "NOT_FOUND",
        status: 404,
      });
    });
  });
});

describe("TicketsService.changeDepartment", () => {
  const ticket = unTicket();
  const mover = (
    t: TicketRow,
    departamentoId: string,
    extra: Partial<ChangeTicketDepartmentInput> = {},
  ): ChangeTicketDepartmentInput => ({
    ticketId: t.id,
    updatedAt: t.updatedAt,
    departamentoId,
    ...extra,
  });

  it("cambia el departamento, conserva el número y audita solo el departamento", async () => {
    const { service, departmentChanges, audits } = buildService({ tickets: [ticket] });

    const result = await service.changeDepartment(mover(ticket, "red"), admin);

    expect(result).toMatchObject({
      numero: 13,
      departamento: { id: "red", nombre: "Redes" },
      titulo: "Impresora rota",
    });
    expect(departmentChanges).toEqual([
      {
        id: "t-1",
        expectedUpdatedAt: ticket.updatedAt,
        data: { departamentoId: "red" },
        actorId: "admin-1",
      },
    ]);
    expect(audits).toEqual([
      {
        entityType: "Ticket",
        entityId: "t-1",
        action: "update",
        actorId: "admin-1",
        payload: {
          before: { departamento: { id: "tec", nombre: "Técnico" } },
          after: { departamento: { id: "red", nombre: "Redes" } },
        },
      },
    ]);
  });

  it("el departamento nuevo desactivado: 409 y no cambia nada", async () => {
    const { service, departmentChanges, audits } = buildService({
      tickets: [ticket],
      departamentos: [ref("tec", "Técnico"), ref("red", "Redes", false)],
    });

    await expect(service.changeDepartment(mover(ticket, "red"), admin)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "El departamento está desactivado: no puede recibir tickets",
    });
    expect(departmentChanges).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("el departamento nuevo inexistente: 400", async () => {
    const { service, departmentChanges } = buildService({ tickets: [ticket] });

    await expect(service.changeDepartment(mover(ticket, "nada"), admin)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      status: 400,
      message: "El departamento no existe",
    });
    expect(departmentChanges).toHaveLength(0);
  });

  it("el mismo departamento responde 200, sin escribir ni auditar, aunque hoy esté desactivado", async () => {
    const { service, departmentChanges, audits } = buildService({
      tickets: [ticket],
      departamentos: [ref("tec", "Técnico", false), ref("red", "Redes")],
    });

    await expect(service.changeDepartment(mover(ticket, "tec"), admin)).resolves.toEqual(ticket);
    expect(departmentChanges).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("con la versión desactualizada responde 409 y no guarda nada", async () => {
    const { service, departmentChanges } = buildService({ tickets: [ticket] });

    await expect(
      service.changeDepartment(
        mover(ticket, "red", { updatedAt: "2026-10-06T09:00:00.000Z" }),
        admin,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Otro usuario modificó este ticket. Recargá para ver los cambios.",
    });
    expect(departmentChanges).toHaveLength(0);
  });

  it("pasa la versión leída al repository para el bloqueo optimista", async () => {
    const { service, departmentChanges } = buildService({ tickets: [ticket] });

    await service.changeDepartment(mover(ticket, "red"), admin);

    expect(departmentChanges[0]?.expectedUpdatedAt).toBe(ticket.updatedAt);
  });

  it("un ticket inexistente o eliminado: 404", async () => {
    const { service } = buildService();

    await expect(service.changeDepartment(mover(ticket, "red"), admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });
});

describe("TicketsService.changeDepartment: módulo (SPEC 11)", () => {
  const modulos = [
    modulo("solo-tec", "Correo", ["tec"]),
    modulo("ambos", "Servidores", ["tec", "red"]),
  ];
  const mover = (t: TicketRow, departamentoId: string): ChangeTicketDepartmentInput => ({
    ticketId: t.id,
    updatedAt: t.updatedAt,
    departamentoId,
  });

  it("un módulo sin el departamento nuevo se vacía, y el diff trae departamento y modulo", async () => {
    const ticket = unTicket({ modulo: { id: "solo-tec", nombre: "Correo" } });
    const { service, departmentChanges, audits } = buildService({ tickets: [ticket], modulos });

    const result = await service.changeDepartment(mover(ticket, "red"), admin);

    expect(result).toMatchObject({ departamento: { id: "red" }, modulo: null });
    expect(departmentChanges[0]?.data).toEqual({ departamentoId: "red", moduloId: null });
    expect(audits).toEqual([
      {
        entityType: "Ticket",
        entityId: "t-1",
        action: "update",
        actorId: "admin-1",
        payload: {
          before: {
            departamento: { id: "tec", nombre: "Técnico" },
            modulo: { id: "solo-tec", nombre: "Correo" },
          },
          after: { departamento: { id: "red", nombre: "Redes" }, modulo: null },
        },
      },
    ]);
  });

  it("un módulo que tiene los dos departamentos se conserva y no se toca", async () => {
    const ticket = unTicket({ modulo: { id: "ambos", nombre: "Servidores" } });
    const { service, departmentChanges, audits } = buildService({ tickets: [ticket], modulos });

    const result = await service.changeDepartment(mover(ticket, "red"), admin);

    expect(result.modulo).toEqual({ id: "ambos", nombre: "Servidores" });
    expect(departmentChanges[0]?.data).toEqual({ departamentoId: "red" });
    expect(audits[0]?.payload).toEqual({
      before: { departamento: { id: "tec", nombre: "Técnico" } },
      after: { departamento: { id: "red", nombre: "Redes" } },
    });
  });

  it("un ticket sin módulo no cambia nada más", async () => {
    const ticket = unTicket();
    const { service, departmentChanges } = buildService({ tickets: [ticket], modulos });

    await service.changeDepartment(mover(ticket, "red"), admin);

    expect(departmentChanges[0]?.data).toEqual({ departamentoId: "red" });
  });

  it("un módulo eliminado se vacía igual: no tiene departamentos", async () => {
    const ticket = unTicket({ modulo: { id: "borrado", nombre: "Borrado" } });
    const { service, departmentChanges } = buildService({ tickets: [ticket], modulos });

    const result = await service.changeDepartment(mover(ticket, "red"), admin);

    expect(result.modulo).toBeNull();
    expect(departmentChanges[0]?.data).toEqual({ departamentoId: "red", moduloId: null });
  });

  it("el mismo departamento no vacía el módulo ni escribe", async () => {
    const ticket = unTicket({ modulo: { id: "solo-tec", nombre: "Correo" } });
    const { service, departmentChanges } = buildService({ tickets: [ticket], modulos });

    await service.changeDepartment(mover(ticket, "tec"), admin);

    expect(departmentChanges).toHaveLength(0);
  });
});

describe("TicketsService.remove", () => {
  const ticket = unTicket();

  it("elimina de forma lógica y audita `delete` con payload vacío", async () => {
    const { service, deletions, audits } = buildService({ tickets: [ticket] });

    await expect(service.remove("t-1", admin)).resolves.toBeUndefined();

    expect(deletions).toEqual([{ id: "t-1", actorId: "admin-1" }]);
    expect(audits).toEqual([
      { entityType: "Ticket", entityId: "t-1", action: "delete", actorId: "admin-1", payload: {} },
    ]);
  });

  it("un ticket inexistente o ya eliminado: 404 y no escribe", async () => {
    const { service, deletions, audits } = buildService();

    await expect(service.remove("t-1", admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "El ticket no existe",
    });
    expect(deletions).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });
});

describe("TicketsService.history", () => {
  it("lee el AuditLog de la entidad Ticket, sin tabla de historial propia", async () => {
    const { service, history } = buildService();

    await expect(service.history("t-1", admin)).resolves.toEqual([]);

    expect(history).toHaveBeenCalledWith("Ticket", "t-1");
  });

  it("no chequea que el ticket exista: el historial de uno eliminado se sigue leyendo", async () => {
    const { service, history } = buildService({ tickets: [] });

    await service.history("t-eliminado", admin);

    expect(history).toHaveBeenCalledWith("Ticket", "t-eliminado");
  });

  it("un agente lee el historial de un ticket de su departamento", async () => {
    const { service, history } = buildService({ tickets: [unTicket()] });

    await service.history("t-1", agenteTecnico);

    expect(history).toHaveBeenCalledWith("Ticket", "t-1");
  });

  it("a un agente le responde 404 si el ticket es de otro departamento, eliminado o inexistente", async () => {
    const { service, history } = buildService({ tickets: [unTicket()] });

    for (const id of ["t-1", "t-eliminado"]) {
      await expect(service.history(id, agenteRedes)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(history).not.toHaveBeenCalled();
  });
});

describe("TicketsService.get", () => {
  it("devuelve el ticket", async () => {
    const { service } = buildService();
    const creado = await service.create(input(), admin);
    const { service: conTicket } = buildService({ tickets: [creado] });

    await expect(conTicket.get(creado.id, admin)).resolves.toEqual(creado);
    await expect(conTicket.get(creado.id, agenteTecnico)).resolves.toEqual(creado);
  });

  it("a un agente de otro departamento le responde 404, igual que por un id inexistente", async () => {
    const { service } = buildService({ tickets: [unTicket()] });

    await expect(service.get("t-1", agenteRedes)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "El ticket no existe",
    });
  });

  it("un id inexistente o eliminado responde 404", async () => {
    const { service } = buildService();

    await expect(service.get("nada", admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "El ticket no existe",
    });
  });
});

describe("TicketsService.list", () => {
  // Lo que deja el esquema del contrato: todas las claves, sin valor si no se pidió el filtro.
  const filters = (extra: Partial<ListTicketsInput> = {}): ListTicketsInput =>
    listTicketsInputSchema.parse(extra);

  it("un agente solo pide los de su departamento, y el admin todos", async () => {
    const { service, pageCalls } = buildService();

    await service.list(agenteTecnico, filters());
    await service.list(admin, filters());

    expect(pageCalls.map((call) => call.departmentId)).toEqual(["tec", null]);
  });

  it("un agente que manda el departamentoId de otro recibe su propio alcance", async () => {
    const { service, pageCalls } = buildService();

    await service.list(agenteTecnico, filters({ departamentoId: "red" }));

    expect(pageCalls).toHaveLength(1);
    expect(pageCalls[0]?.departmentId).toBe("tec");
  });

  it("el admin aplica el departamentoId", async () => {
    const { service, pageCalls } = buildService();

    await service.list(admin, filters({ departamentoId: "red" }));

    expect(pageCalls[0]?.departmentId).toBe("red");
  });

  it("devuelve la página con el total, la página pedida y el tamaño fijo", async () => {
    const { service } = buildService({
      tickets: [unTicket(), unTicket({ id: "t-2", numero: 14 })],
    });

    const result = await service.list(admin, filters({ page: 3 }));

    expect(result).toMatchObject({ total: 2, page: 3, pageSize: 20 });
    expect(result.items).toHaveLength(2);
  });

  it("pasa los filtros y la búsqueda tal cual al repository", async () => {
    const { service, pageCalls } = buildService();
    const pedido = filters({
      q: "tecnico",
      estadoId: "pend",
      tipoAreaId: "dip",
      fechaRecepcionDesde: "2026-10-01",
    });

    await service.list(admin, pedido);

    expect(pageCalls[0]?.filters).toEqual(pedido);
  });

  it("sin scope en la request falla en vez de listar sin filtro", async () => {
    const { service, pageCalls } = buildService();
    const { scope: _scope, ...sinScope } = agenteTecnico;

    await expect(service.list(sinScope, filters())).rejects.toThrow("Falta el scope");
    expect(pageCalls).toHaveLength(0);
  });
});
