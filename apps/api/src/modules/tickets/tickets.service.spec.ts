import type { CreateTicketInput, UpdateTicketInput } from "@syc/contracts";
import { describe, expect, it } from "vitest";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import type { AuditEntry } from "../audit/audit.repository";
import type {
  EstadoRow,
  ReferenceMatch,
  ReferenceRow,
  TicketCatalog,
  TicketCreateData,
  TicketRow,
  TicketSummaryRow,
  TicketsRepository,
  TicketUpdateData,
} from "./tickets.repository";
import { TicketsService } from "./tickets.service";

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

const input = (extra: Partial<CreateTicketInput> = {}): CreateTicketInput => ({
  departamentoId: "tec",
  titulo: "Impresora rota",
  descripcion: null,
  prioridadId: "alta",
  fechaRecepcion: "2026-10-01",
  actuacionSimple: null,
  proveedorId: null,
  referenciaExterna: null,
  ...extra,
});

const ref = (id: string, nombre: string, activo = true): ReferenceRow => ({ id, nombre, activo });
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
  estados?: EstadoRow[];
  tickets?: TicketRow[];
  referencias?: (ReferenceMatch & { proveedorId: string; referenciaExterna: string })[];
}

// Repository en memoria. `create` imita lo que hace el real: toma el número de la secuencia, resuelve
// las referencias por nombre y deja el `AuditLog` que en producción se escribe en la misma
// transacción (acá se arma con el callback `auditOf`, igual que en producción).
function buildService(world: World = {}) {
  const departamentos = world.departamentos ?? [ref("tec", "Técnico"), ref("red", "Redes")];
  const catalogos: Record<TicketCatalog, ReferenceRow[]> = {
    area: [],
    edificio: [],
    tipoTicket: [],
    prioridad: [ref("alta", "Alta"), ref("baja", "Baja", false)],
    modulo: [],
    proveedor: [ref("acme", "Acme"), ref("viejo", "Viejo", false)],
    ...world.catalogos,
  };
  const estados = world.estados ?? [estado("pend", "Pendiente"), estado("prog", "En progreso")];
  const tickets = world.tickets ?? [];
  const referencias = world.referencias ?? [];
  const audits: AuditEntry[] = [];
  const created: { data: TicketCreateData; actorId: string }[] = [];
  const updates: {
    id: string;
    expectedUpdatedAt: string;
    data: TicketUpdateData;
    actorId: string;
  }[] = [];
  const recentCalls: { departmentId: string | null; take: number }[] = [];
  let sequence = 12;

  const repository = {
    findDepartment: async (id: string) => departamentos.find((d) => d.id === id) ?? null,
    findCatalogItem: async (catalog: TicketCatalog, id: string) =>
      catalogos[catalog].find((item) => item.id === id) ?? null,
    findEstados: async () => estados,
    findByReferencia: async (proveedorId: string, referenciaExterna: string, exceptId?: string) =>
      referencias.find(
        (r) =>
          r.proveedorId === proveedorId &&
          r.referenciaExterna === referenciaExterna &&
          r.id !== exceptId,
      ) ?? null,
    findDetail: async (id: string) => tickets.find((t) => t.id === id) ?? null,
    findRecent: async (departmentId: string | null, take: number) => {
      recentCalls.push({ departmentId, take });
      return tickets as unknown as TicketSummaryRow[];
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
        tipo: null,
        modulo: null,
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
      const refOf = (items: ReferenceRow[], refId: string | null) => {
        const found = refId ? items.find((i) => i.id === refId) : null;
        return found ? { id: found.id, nombre: found.nombre } : null;
      };
      return {
        ...current,
        ...data,
        prioridad: refOf(catalogos.prioridad, data.prioridadId) ?? current.prioridad,
        area: refOf(catalogos.area, data.areaId),
        edificio: refOf(catalogos.edificio, data.edificioId),
        tipo: refOf(catalogos.tipoTicket, data.tipoId),
        modulo: refOf(catalogos.modulo, data.moduloId),
        proveedor: refOf(catalogos.proveedor, data.proveedorId),
        updatedAt: "2026-10-06T11:00:00.000Z",
      };
    },
  } as unknown as TicketsRepository;

  return {
    service: new TicketsService(repository),
    audits,
    created,
    updates,
    recentCalls,
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
    const catalogos = {
      area: [ref("sist", "Sistemas"), ref("arch", "Archivo", false)],
      edificio: [ref("ed1", "Edificio 1")],
      tipoTicket: [ref("inc", "Incidente")],
      modulo: [ref("mesa", "Mesa de entradas")],
    };

    it("se completan después del alta, con su nombre en la auditoría", async () => {
      const { service, updates, audits } = buildService({ tickets: [ticket], catalogos });

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
          area: { id: "sist", nombre: "Sistemas" },
          edificio: { id: "ed1", nombre: "Edificio 1" },
          tipo: { id: "inc", nombre: "Incidente" },
          modulo: { id: "mesa", nombre: "Mesa de entradas" },
        },
      });
    });

    it("null borra el valor y el historial conserva el anterior", async () => {
      const conArea = unTicket({ area: { id: "sist", nombre: "Sistemas" } });
      const { service, updates, audits } = buildService({ tickets: [conArea], catalogos });

      await service.update(edit(conArea, { areaId: null }), admin);

      expect(updates[0]?.data.areaId).toBeNull();
      expect(audits[0]?.payload).toEqual({
        before: { area: { id: "sist", nombre: "Sistemas" } },
        after: { area: null },
      });
    });

    it.each([
      ["desactivada", "arch"],
      ["inexistente o eliminada", "nada"],
    ])("un área nueva %s: 400 y no guarda", async (_caso, areaId) => {
      const { service, updates } = buildService({ tickets: [ticket], catalogos });

      await expect(service.update(edit(ticket, { areaId }), admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        status: 400,
        message: "El área no existe o está desactivada",
      });
      expect(updates).toHaveLength(0);
    });

    it("un área que ya tenía se acepta aunque hoy esté desactivada o eliminada", async () => {
      const conArea = unTicket({ area: { id: "arch", nombre: "Archivo" } });
      const { service, updates } = buildService({ tickets: [conArea], catalogos });
      const eliminada = unTicket({ area: { id: "borrada", nombre: "Vieja" } });
      const { service: otro, updates: otrosUpdates } = buildService({
        tickets: [eliminada],
        catalogos,
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
});

describe("TicketsService.get", () => {
  it("devuelve el ticket", async () => {
    const { service } = buildService();
    const creado = await service.create(input(), admin);
    const { service: conTicket } = buildService({ tickets: [creado] });

    await expect(conTicket.get(creado.id)).resolves.toEqual(creado);
  });

  it("un id inexistente o eliminado responde 404", async () => {
    const { service } = buildService();

    await expect(service.get("nada")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "El ticket no existe",
    });
  });
});

describe("TicketsService.list", () => {
  it("un agente solo pide los de su departamento, y el admin todos", async () => {
    const { service, recentCalls } = buildService();

    await service.list(agenteTecnico);
    await service.list(admin);

    expect(recentCalls).toEqual([
      { departmentId: "tec", take: 50 },
      { departmentId: null, take: 50 },
    ]);
  });

  it("sin scope en la request falla en vez de listar sin filtro", async () => {
    const { service, recentCalls } = buildService();
    const { scope: _scope, ...sinScope } = agenteTecnico;

    await expect(service.list(sinScope)).rejects.toThrow("Falta el scope");
    expect(recentCalls).toHaveLength(0);
  });
});
