import type { CreateTicketInput } from "@syc/contracts";
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
  const recentCalls: { departmentId: string | null; take: number }[] = [];
  let sequence = 12;

  const repository = {
    findDepartment: async (id: string) => departamentos.find((d) => d.id === id) ?? null,
    findCatalogItem: async (catalog: TicketCatalog, id: string) =>
      catalogos[catalog].find((item) => item.id === id) ?? null,
    findEstados: async () => estados,
    findByReferencia: async (proveedorId: string, referenciaExterna: string) =>
      referencias.find(
        (r) => r.proveedorId === proveedorId && r.referenciaExterna === referenciaExterna,
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
  } as unknown as TicketsRepository;

  return {
    service: new TicketsService(repository),
    audits,
    created,
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
