import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import type { TicketUsageReader } from "../../common/ticket-usage-reader";
import type { AuditEntry } from "../audit/audit.repository";
import type { AuditService } from "../audit/audit.service";
import type { OrganizationRow, OrganizationsRepository } from "./organizations.repository";
import { OrganizationsService } from "./organizations.service";

function row(id: string, name: string, extra: Partial<OrganizationRow> = {}): OrganizationRow {
  return { id, name, slug: name.toLowerCase(), activo: true, agentes: 0, ...extra };
}

const admin: AuthenticatedUser = {
  id: "admin-1",
  username: "admin",
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
};

// Repository en memoria: el service solo lee la lista y escribe de a una fila. Cada mutación
// recibe la entrada de auditoría (en producción se escribe en la misma transacción) y la anota.
// `ticketsByDepartment`: cuántos tickets tiene cada departamento, eliminados incluidos. Lo que no
// figura, no tiene ninguno.
function buildService(
  initial: OrganizationRow[],
  ticketsByDepartment: Record<string, number> = {},
) {
  const rows = initial.map((r) => ({ ...r }));
  const audits: AuditEntry[] = [];
  const find = (id: string) => rows.find((r) => r.id === id) as OrganizationRow;
  const repository = {
    findAll: async () => rows.map((r) => ({ ...r })),
    create: async (data: { name: string; slug: string }, audit: Omit<AuditEntry, "entityId">) => {
      const created = { id: `id-${rows.length + 1}`, activo: true, agentes: 0, ...data };
      rows.push(created);
      audits.push({ ...audit, entityId: created.id });
      return created;
    },
    rename: async (id: string, name: string, audit: AuditEntry) => {
      audits.push(audit);
      return Object.assign(find(id), { name });
    },
    setActive: async (id: string, activo: boolean, audit: AuditEntry) => {
      audits.push(audit);
      return Object.assign(find(id), { activo });
    },
    remove: async (id: string, audit: AuditEntry) => {
      audits.push(audit);
      rows.splice(rows.indexOf(find(id)), 1);
    },
  } as unknown as OrganizationsRepository;
  const history = vi.fn(async () => []);
  const audit = { history } as unknown as AuditService;
  const countByDepartment = vi.fn(async (id: string) => ticketsByDepartment[id] ?? 0);
  const tickets = { countByDepartment } as unknown as TicketUsageReader;
  return {
    service: new OrganizationsService(repository, audit, tickets),
    rows,
    audits,
    history,
    countByDepartment,
  };
}

const seed = () => [
  row("adm", "Administrativo"),
  row("tec", "Técnico"),
  row("red", "Redes", { agentes: 2 }),
];

describe("OrganizationsService.create", () => {
  it("crea el departamento activo y sin agentes, con slug en kebab-case sin acentos", async () => {
    const { service, rows } = buildService(seed());

    const created = await service.create({ nombre: "Atención al Público" }, admin);

    expect(created).toMatchObject({ nombre: "Atención al Público", activo: true, agentes: 0 });
    expect(rows.at(-1)?.slug).toBe("atencion-al-publico");
  });

  it("rechaza con 409 un nombre repetido sin importar mayúsculas, acentos ni espacios", async () => {
    const { service } = buildService(seed());

    await expect(service.create({ nombre: "tecnico" }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(service.create({ nombre: "  TÉCNICO " }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("suma un sufijo al slug cuando colisiona aunque el nombre sea distinto", async () => {
    const { service, rows } = buildService([row("tec", "Técnico", { slug: "tecnico" })]);

    await service.create({ nombre: "Técnico!" }, admin);

    expect(rows.at(-1)?.slug).toBe("tecnico-2");
  });
});

describe("OrganizationsService.rename", () => {
  it("permite renombrar a su propio nombre con otra capitalización y no cambia el slug", async () => {
    const { service, rows } = buildService(seed());

    const renamed = await service.rename({ organizationId: "tec", nombre: "TÉCNICO" }, admin);

    expect(renamed.nombre).toBe("TÉCNICO");
    expect(rows.find((r) => r.id === "tec")?.slug).toBe("técnico");
  });

  it("rechaza con 409 el nombre de otro departamento", async () => {
    const { service } = buildService(seed());

    await expect(
      service.rename({ organizationId: "tec", nombre: "redes" }, admin),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("responde 404 si el departamento no existe", async () => {
    const { service } = buildService(seed());

    await expect(
      service.rename({ organizationId: "nope", nombre: "X" }, admin),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("OrganizationsService.setActive", () => {
  it("desactiva y reactiva", async () => {
    const { service } = buildService(seed());

    expect((await service.setActive({ organizationId: "adm", activo: false }, admin)).activo).toBe(
      false,
    );
    expect((await service.setActive({ organizationId: "adm", activo: true }, admin)).activo).toBe(
      true,
    );
  });

  it("no deja desactivar el último departamento activo", async () => {
    const { service } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await expect(
      service.setActive({ organizationId: "tec", activo: false }, admin),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("OrganizationsService.remove", () => {
  it("elimina un departamento sin agentes", async () => {
    const { service, rows } = buildService(seed());

    await service.remove("adm", admin);

    expect(rows.map((r) => r.id)).toEqual(["tec", "red"]);
  });

  it("rechaza con 409 si tiene agentes, activos o desactivados", async () => {
    const { service, rows } = buildService(seed());

    await expect(service.remove("red", admin)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rows).toHaveLength(3);
  });

  it("rechaza con 409 eliminar el último departamento activo", async () => {
    const { service } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await expect(service.remove("tec", admin)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deja eliminar uno desactivado y vacío aunque quede un solo activo", async () => {
    const { service, rows } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await service.remove("red", admin);

    expect(rows.map((r) => r.id)).toEqual(["tec"]);
  });

  it("responde 404 si no existe", async () => {
    const { service } = buildService(seed());

    await expect(service.remove("nope", admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  describe("con tickets (SPEC 05, Feature 5.9)", () => {
    it("rechaza con 409 si tiene tickets, aunque no tenga agentes", async () => {
      const { service, rows, audits } = buildService(seed(), { adm: 1 });

      await expect(service.remove("adm", admin)).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "El departamento tiene tickets: desactivalo en lugar de eliminarlo",
      });
      expect(rows).toHaveLength(3);
      expect(audits).toHaveLength(0);
    });

    it("cuenta también los tickets eliminados lógicamente: un solo ticket eliminado alcanza", async () => {
      // El reader cuenta todas las filas (`countByDepartment` incluye los eliminados): la FK es Restrict.
      const { service, countByDepartment } = buildService(seed(), { tec: 1 });

      await expect(service.remove("tec", admin)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(countByDepartment).toHaveBeenCalledWith("tec");
    });

    it("sin tickets ni agentes se elimina", async () => {
      const { service, rows } = buildService(seed(), { tec: 2 });

      await service.remove("adm", admin);

      expect(rows.map((r) => r.id)).toEqual(["tec", "red"]);
    });

    it("las demás reglas van primero: con agentes o último activo ni consulta los tickets", async () => {
      const { service, countByDepartment } = buildService(seed(), { red: 9 });

      await expect(service.remove("red", admin)).rejects.toMatchObject({
        message: "El departamento tiene agentes asignados: desactivalo en lugar de eliminarlo",
      });
      expect(countByDepartment).not.toHaveBeenCalled();
    });
  });
});

describe("OrganizationsService: auditoría", () => {
  it("el alta deja un create con los valores iniciales y el admin como actor", async () => {
    const { service, audits } = buildService(seed());

    const created = await service.create({ nombre: "Soporte" }, admin);

    expect(audits).toEqual([
      {
        entityType: "Organization",
        entityId: created.id,
        action: "create",
        actorId: "admin-1",
        payload: { after: { nombre: "Soporte", activo: true } },
      },
    ]);
  });

  it("renombrar deja un update solo con el nombre", async () => {
    const { service, audits } = buildService([row("sop", "Soporte")]);

    await service.rename({ organizationId: "sop", nombre: "Mesa de ayuda" }, admin);

    expect(audits).toEqual([
      {
        entityType: "Organization",
        entityId: "sop",
        action: "update",
        actorId: "admin-1",
        payload: { before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } },
      },
    ]);
  });

  it("renombrar al mismo nombre no audita ni escribe", async () => {
    const { service, audits } = buildService(seed());

    const result = await service.rename({ organizationId: "tec", nombre: "Técnico" }, admin);

    expect(result.nombre).toBe("Técnico");
    expect(audits).toEqual([]);
  });

  it("desactivar y reactivar dejan un update de activo cada uno", async () => {
    const { service, audits } = buildService(seed());

    await service.setActive({ organizationId: "adm", activo: false }, admin);
    await service.setActive({ organizationId: "adm", activo: true }, admin);

    expect(audits.map((a) => [a.action, a.payload])).toEqual([
      ["update", { before: { activo: true }, after: { activo: false } }],
      ["update", { before: { activo: false }, after: { activo: true } }],
    ]);
  });

  it("setActive con el estado actual no audita", async () => {
    const { service, audits } = buildService(seed());

    await service.setActive({ organizationId: "adm", activo: true }, admin);

    expect(audits).toEqual([]);
  });

  it("eliminar deja un delete con payload vacío", async () => {
    const { service, audits } = buildService(seed());

    await service.remove("adm", admin);

    expect(audits).toEqual([
      {
        entityType: "Organization",
        entityId: "adm",
        action: "delete",
        actorId: "admin-1",
        payload: {},
      },
    ]);
  });

  it("una operación rechazada no deja registro", async () => {
    const { service, audits } = buildService(seed());

    await expect(service.remove("red", admin)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      service.rename({ organizationId: "tec", nombre: "redes" }, admin),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(audits).toEqual([]);
  });
});

describe("OrganizationsService.history", () => {
  it("lee el historial de Organization por id, aunque el departamento ya no exista", async () => {
    const { service, history } = buildService(seed());

    expect(await service.history("eliminado")).toEqual([]);

    expect(history).toHaveBeenCalledWith("Organization", "eliminado");
  });
});
