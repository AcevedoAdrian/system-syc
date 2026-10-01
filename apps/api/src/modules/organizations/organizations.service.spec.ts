import { describe, expect, it } from "vitest";
import type { OrganizationRow, OrganizationsRepository } from "./organizations.repository";
import { OrganizationsService } from "./organizations.service";

function row(id: string, name: string, extra: Partial<OrganizationRow> = {}): OrganizationRow {
  return { id, name, slug: name.toLowerCase(), activo: true, agentes: 0, ...extra };
}

// Repository en memoria: el service solo lee la lista y escribe de a una fila.
function buildService(initial: OrganizationRow[]) {
  const rows = initial.map((r) => ({ ...r }));
  const find = (id: string) => rows.find((r) => r.id === id) as OrganizationRow;
  const repository = {
    findAll: async () => rows.map((r) => ({ ...r })),
    create: async (data: { name: string; slug: string }) => {
      const created = { id: `id-${rows.length + 1}`, activo: true, agentes: 0, ...data };
      rows.push(created);
      return created;
    },
    rename: async (id: string, name: string) => Object.assign(find(id), { name }),
    setActive: async (id: string, activo: boolean) => Object.assign(find(id), { activo }),
    remove: async (id: string) => {
      rows.splice(rows.indexOf(find(id)), 1);
    },
  } as unknown as OrganizationsRepository;
  return { service: new OrganizationsService(repository), rows };
}

const seed = () => [
  row("adm", "Administrativo"),
  row("tec", "Técnico"),
  row("red", "Redes", { agentes: 2 }),
];

describe("OrganizationsService.create", () => {
  it("crea el departamento activo y sin agentes, con slug en kebab-case sin acentos", async () => {
    const { service, rows } = buildService(seed());

    const created = await service.create({ nombre: "Atención al Público" });

    expect(created).toMatchObject({ nombre: "Atención al Público", activo: true, agentes: 0 });
    expect(rows.at(-1)?.slug).toBe("atencion-al-publico");
  });

  it("rechaza con 409 un nombre repetido sin importar mayúsculas, acentos ni espacios", async () => {
    const { service } = buildService(seed());

    await expect(service.create({ nombre: "tecnico" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.create({ nombre: "  TÉCNICO " })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("suma un sufijo al slug cuando colisiona aunque el nombre sea distinto", async () => {
    const { service, rows } = buildService([row("tec", "Técnico", { slug: "tecnico" })]);

    await service.create({ nombre: "Técnico!" });

    expect(rows.at(-1)?.slug).toBe("tecnico-2");
  });
});

describe("OrganizationsService.rename", () => {
  it("permite renombrar a su propio nombre con otra capitalización y no cambia el slug", async () => {
    const { service, rows } = buildService(seed());

    const renamed = await service.rename({ organizationId: "tec", nombre: "TÉCNICO" });

    expect(renamed.nombre).toBe("TÉCNICO");
    expect(rows.find((r) => r.id === "tec")?.slug).toBe("técnico");
  });

  it("rechaza con 409 el nombre de otro departamento", async () => {
    const { service } = buildService(seed());

    await expect(service.rename({ organizationId: "tec", nombre: "redes" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("responde 404 si el departamento no existe", async () => {
    const { service } = buildService(seed());

    await expect(service.rename({ organizationId: "nope", nombre: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("OrganizationsService.setActive", () => {
  it("desactiva y reactiva", async () => {
    const { service } = buildService(seed());

    expect((await service.setActive({ organizationId: "adm", activo: false })).activo).toBe(false);
    expect((await service.setActive({ organizationId: "adm", activo: true })).activo).toBe(true);
  });

  it("no deja desactivar el último departamento activo", async () => {
    const { service } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await expect(service.setActive({ organizationId: "tec", activo: false })).rejects.toMatchObject(
      {
        code: "CONFLICT",
      },
    );
  });
});

describe("OrganizationsService.remove", () => {
  it("elimina un departamento sin agentes", async () => {
    const { service, rows } = buildService(seed());

    await service.remove("adm");

    expect(rows.map((r) => r.id)).toEqual(["tec", "red"]);
  });

  it("rechaza con 409 si tiene agentes, activos o desactivados", async () => {
    const { service, rows } = buildService(seed());

    await expect(service.remove("red")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rows).toHaveLength(3);
  });

  it("rechaza con 409 eliminar el último departamento activo", async () => {
    const { service } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await expect(service.remove("tec")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deja eliminar uno desactivado y vacío aunque quede un solo activo", async () => {
    const { service, rows } = buildService([
      row("tec", "Técnico"),
      row("red", "Redes", { activo: false }),
    ]);

    await service.remove("red");

    expect(rows.map((r) => r.id)).toEqual(["tec"]);
  });

  it("responde 404 si no existe", async () => {
    const { service } = buildService(seed());

    await expect(service.remove("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
