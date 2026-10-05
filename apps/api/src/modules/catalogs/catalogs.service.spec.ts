import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { normalizeName } from "../../common/text";
import type { AuditEntry } from "../audit/audit.repository";
import type { AuditService } from "../audit/audit.service";
import { CATALOG_DEFINITIONS } from "./catalog-definitions";
import type {
  CatalogRow,
  CatalogsRepository,
  CatalogWrite,
  OrdenChange,
} from "./catalogs.repository";
import { CatalogsService } from "./catalogs.service";

const areas = CATALOG_DEFINITIONS.areas;
const edificios = CATALOG_DEFINITIONS.edificios;
const proveedores = CATALOG_DEFINITIONS.proveedores;
const estados = CATALOG_DEFINITIONS.estados;

const admin: AuthenticatedUser = {
  id: "admin-1",
  username: "admin",
  name: "Admin",
  email: "admin@example.com",
  role: "admin",
};

function row(id: string, nombre: string, orden: number, extra: Partial<CatalogRow> = {}) {
  return {
    id,
    nombre,
    nombreNormalizado: normalizeName(nombre),
    orden,
    activo: true,
    ...extra,
  } as CatalogRow;
}

// Repository en memoria con una tabla por catálogo. Imita lo que hace el real: `findAll` devuelve
// los no eliminados en el orden de `list`, y cada mutación anota la auditoría que en producción se
// escribe en la misma transacción.
function buildService(initial: Record<string, CatalogRow[]> = {}) {
  const tables = new Map(
    Object.entries(initial).map(([ruta, rows]) => [ruta, rows.map((r) => ({ ...r }))]),
  );
  const deleted = new Set<string>();
  const audits: AuditEntry[] = [];
  const actors: string[] = [];
  const creates: CatalogWrite[] = []; // lo que el service le pasa al repository en cada alta
  const table = (ruta: string) => {
    if (!tables.has(ruta)) tables.set(ruta, []);
    return tables.get(ruta) as CatalogRow[];
  };
  const live = (ruta: string) =>
    table(ruta)
      .filter((r) => !deleted.has(r.id))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  const find = (ruta: string, id: string) => table(ruta).find((r) => r.id === id) as CatalogRow;

  const repository = {
    findAll: async (def: { ruta: string }) => live(def.ruta).map((r) => ({ ...r })),
    create: async (
      def: { ruta: string },
      data: CatalogWrite,
      actorId: string,
      audit: Omit<AuditEntry, "entityId">,
    ) => {
      creates.push(data);
      const created = { id: `${def.ruta}-${table(def.ruta).length + 1}`, ...data } as CatalogRow;
      table(def.ruta).push(created);
      actors.push(actorId);
      audits.push({ ...audit, entityId: created.id });
      return { ...created };
    },
    update: async (
      def: { ruta: string },
      id: string,
      data: CatalogWrite,
      actorId: string,
      audit: AuditEntry,
    ) => {
      actors.push(actorId);
      audits.push(audit);
      return { ...Object.assign(find(def.ruta, id), data) };
    },
    setActive: async (
      def: { ruta: string },
      id: string,
      activo: boolean,
      actorId: string,
      audit: AuditEntry,
    ) => {
      actors.push(actorId);
      audits.push(audit);
      return { ...Object.assign(find(def.ruta, id), { activo }) };
    },
    swapOrden: async (def: { ruta: string }, changes: OrdenChange[], actorId: string) => {
      for (const change of changes) {
        actors.push(actorId);
        audits.push(change.audit);
        find(def.ruta, change.id).orden = change.orden;
      }
    },
    softDelete: async (def: { ruta: string }, id: string, actorId: string, audit: AuditEntry) => {
      actors.push(actorId);
      audits.push(audit);
      deleted.add(find(def.ruta, id).id);
    },
  } as unknown as CatalogsRepository;

  const history = vi.fn(async () => []);
  const audit = { history } as unknown as AuditService;
  return {
    service: new CatalogsService(repository, audit),
    audits,
    actors,
    creates,
    history,
    ordenes: (ruta: string) => live(ruta).map((r) => [r.id, r.orden]),
  };
}

const threeAreas = () => ({
  areas: [row("a1", "Sistemas", 1), row("a2", "Redes", 2), row("a3", "Soporte", 3)],
});

describe("CatalogsService.list", () => {
  it("devuelve solo id, nombre, orden y activo de un catálogo simple", async () => {
    const { service } = buildService(threeAreas());

    expect(await service.list(areas)).toEqual([
      { id: "a1", nombre: "Sistemas", orden: 1, activo: true },
      { id: "a2", nombre: "Redes", orden: 2, activo: true },
      { id: "a3", nombre: "Soporte", orden: 3, activo: true },
    ]);
  });

  it("devuelve la clave de un estado y los datos de contacto de un proveedor", async () => {
    const { service } = buildService({
      estados: [row("e1", "Cerrado", 1, { clave: "CERRADO" })],
      proveedores: [row("p1", "Acme", 1, { contacto: "Ana", telefono: null })],
    });

    expect(await service.list(estados)).toEqual([
      { id: "e1", nombre: "Cerrado", orden: 1, activo: true, clave: "CERRADO" },
    ]);
    expect(await service.list(proveedores)).toEqual([
      { id: "p1", nombre: "Acme", orden: 1, activo: true, contacto: "Ana", telefono: null },
    ]);
  });
});

describe("CatalogsService.create", () => {
  it("crea el ítem activo con orden máximo + 1 y audita el alta", async () => {
    const { service, audits, actors } = buildService(threeAreas());

    const created = await service.create(areas, { nombre: "Mesa de ayuda" }, admin);

    expect(created).toMatchObject({ nombre: "Mesa de ayuda", orden: 4, activo: true });
    expect(actors).toEqual(["admin-1"]);
    expect(audits).toEqual([
      {
        entityType: "Area",
        entityId: created.id,
        action: "create",
        actorId: "admin-1",
        payload: { after: { nombre: "Mesa de ayuda", orden: 4, activo: true } },
      },
    ]);
  });

  it("asigna orden 1 en un catálogo vacío", async () => {
    const { service } = buildService();

    expect(await service.create(areas, { nombre: "Sistemas" }, admin)).toMatchObject({ orden: 1 });
  });

  it("guarda nombreNormalizado a partir del nombre", async () => {
    const { service, creates } = buildService();

    await service.create(areas, { nombre: "Área  Técnica" }, admin);

    expect(creates[0]).toMatchObject({
      nombre: "Área  Técnica",
      nombreNormalizado: "area tecnica",
    });
  });

  it("rechaza con 409 un nombre repetido sin importar mayúsculas, acentos ni espacios", async () => {
    const { service } = buildService();
    await service.create(areas, { nombre: "Área Técnica" }, admin);

    await expect(service.create(areas, { nombre: "area  tecnica" }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ya existe un área con ese nombre",
    });
  });

  it("cuenta los ítems inactivos para la unicidad", async () => {
    const { service } = buildService({ areas: [row("a1", "Sistemas", 1, { activo: false })] });

    await expect(service.create(areas, { nombre: "sistemas" }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("permite el mismo nombre en otro catálogo", async () => {
    const { service } = buildService();
    await service.create(areas, { nombre: "Área Técnica" }, admin);

    await expect(
      service.create(edificios, { nombre: "Área Técnica" }, admin),
    ).resolves.toMatchObject({ nombre: "Área Técnica", orden: 1 });
  });

  it("permite recrear un nombre después de eliminar el ítem", async () => {
    const { service } = buildService();
    const first = await service.create(areas, { nombre: "Sistemas" }, admin);
    await service.remove(areas, first.id, admin);

    const again = await service.create(areas, { nombre: "Sistemas" }, admin);

    expect(again.id).not.toBe(first.id);
    expect(await service.list(areas)).toHaveLength(1);
  });

  it("en Proveedores guarda los campos de contacto y los audita", async () => {
    const { service, audits } = buildService();

    const created = await service.create(
      proveedores,
      { nombre: "Acme", contacto: "Ana", telefono: null, correo: "a@acme.com", sitioWeb: null },
      admin,
    );

    expect(created).toMatchObject({ contacto: "Ana", telefono: null, correo: "a@acme.com" });
    expect(audits[0]?.payload).toEqual({
      after: {
        nombre: "Acme",
        orden: 1,
        activo: true,
        contacto: "Ana",
        telefono: null,
        correo: "a@acme.com",
        sitioWeb: null,
      },
    });
  });

  it("ignora los campos que la definición no acepta, como la clave de un estado", async () => {
    const { service, creates } = buildService();

    await service.create(estados, { nombre: "Nuevo", clave: "CERRADO" }, admin);

    expect(Object.keys(creates[0] ?? {}).sort()).toEqual([
      "activo",
      "nombre",
      "nombreNormalizado",
      "orden",
    ]);
  });
});

describe("CatalogsService.update", () => {
  it("cambia el nombre y audita solo lo que cambió", async () => {
    const { service, audits } = buildService(threeAreas());

    const updated = await service.update(areas, "a1", { nombre: "Informática" }, admin);

    expect(updated).toMatchObject({ id: "a1", nombre: "Informática" });
    expect(audits).toEqual([
      {
        entityType: "Area",
        entityId: "a1",
        action: "update",
        actorId: "admin-1",
        payload: { before: { nombre: "Sistemas" }, after: { nombre: "Informática" } },
      },
    ]);
  });

  it("sin cambios efectivos responde el ítem y no audita ni escribe", async () => {
    const { service, audits, actors } = buildService(threeAreas());

    const result = await service.update(areas, "a1", { nombre: "Sistemas" }, admin);

    expect(result).toMatchObject({ id: "a1", nombre: "Sistemas" });
    expect(audits).toEqual([]);
    expect(actors).toEqual([]);
  });

  it("permite cambiar solo mayúsculas o acentos del propio nombre", async () => {
    const { service } = buildService({ areas: [row("a1", "Area", 1)] });

    await expect(service.update(areas, "a1", { nombre: "Área" }, admin)).resolves.toMatchObject({
      nombre: "Área",
    });
  });

  it("rechaza con 409 el nombre de otro ítem del mismo catálogo", async () => {
    const { service } = buildService(threeAreas());

    await expect(service.update(areas, "a1", { nombre: "REDES" }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("reemplaza los campos opcionales de un proveedor: en null borra el dato", async () => {
    const { service, audits } = buildService({
      proveedores: [row("p1", "Acme", 1, { contacto: "Ana", telefono: "123", correo: null })],
    });

    const updated = await service.update(
      proveedores,
      "p1",
      { nombre: "Acme", contacto: null, telefono: "123", correo: "a@acme.com", sitioWeb: null },
      admin,
    );

    expect(updated).toMatchObject({ contacto: null, telefono: "123", correo: "a@acme.com" });
    expect(audits[0]?.payload).toEqual({
      before: { contacto: "Ana", correo: null },
      after: { contacto: null, correo: "a@acme.com" },
    });
  });

  it("no cambia la clave de un estado al renombrarlo", async () => {
    const { service, audits } = buildService({
      estados: [row("e1", "Finalizado", 1, { clave: "FINALIZADO" })],
    });

    const updated = await service.update(estados, "e1", { nombre: "Resuelto" }, admin);

    expect(updated).toMatchObject({ nombre: "Resuelto", clave: "FINALIZADO" });
    expect(audits[0]?.payload).toEqual({
      before: { nombre: "Finalizado" },
      after: { nombre: "Resuelto" },
    });
  });

  it("responde 404 con un ítem inexistente o eliminado", async () => {
    const { service } = buildService(threeAreas());
    await service.remove(areas, "a2", admin);

    await expect(service.update(areas, "nada", { nombre: "X" }, admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "El área no existe",
    });
    await expect(service.update(areas, "a2", { nombre: "X" }, admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("CatalogsService.setActive", () => {
  it("desactiva y reactiva, y audita cada cambio como update", async () => {
    const { service, audits } = buildService(threeAreas());

    await service.setActive(areas, "a1", false, admin);
    const reactivated = await service.setActive(areas, "a1", true, admin);

    expect(reactivated).toMatchObject({ activo: true });
    expect(audits.map((a) => [a.action, a.payload])).toEqual([
      ["update", { before: { activo: true }, after: { activo: false } }],
      ["update", { before: { activo: false }, after: { activo: true } }],
    ]);
  });

  it("sin cambios efectivos no audita", async () => {
    const { service, audits } = buildService(threeAreas());

    await service.setActive(areas, "a1", true, admin);

    expect(audits).toEqual([]);
  });

  it("en Áreas permite desactivar el último ítem activo", async () => {
    const { service } = buildService({ areas: [row("a1", "Sistemas", 1)] });

    await expect(service.setActive(areas, "a1", false, admin)).resolves.toMatchObject({
      activo: false,
    });
  });

  it("responde 404 con un ítem inexistente", async () => {
    const { service } = buildService(threeAreas());

    await expect(service.setActive(areas, "nada", false, admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("CatalogsService.remove", () => {
  it("elimina lógicamente: sale de la lista y audita un delete vacío", async () => {
    const { service, audits } = buildService(threeAreas());

    await service.remove(areas, "a2", admin);

    expect((await service.list(areas)).map((i) => i.id)).toEqual(["a1", "a3"]);
    expect(audits).toEqual([
      { entityType: "Area", entityId: "a2", action: "delete", actorId: "admin-1", payload: {} },
    ]);
  });

  it("responde 404 con un ítem ya eliminado", async () => {
    const { service } = buildService(threeAreas());
    await service.remove(areas, "a2", admin);

    await expect(service.remove(areas, "a2", admin)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("CatalogsService.move", () => {
  it("intercambia el orden con el vecino y deja dos update con solo orden", async () => {
    const { service, audits, ordenes } = buildService(threeAreas());

    await service.move(areas, "a2", "subir", admin);

    expect(ordenes("areas")).toEqual([
      ["a2", 1],
      ["a1", 2],
      ["a3", 3],
    ]);
    expect(audits).toEqual([
      {
        entityType: "Area",
        entityId: "a1",
        action: "update",
        actorId: "admin-1",
        payload: { before: { orden: 1 }, after: { orden: 2 } },
      },
      {
        entityType: "Area",
        entityId: "a2",
        action: "update",
        actorId: "admin-1",
        payload: { before: { orden: 2 }, after: { orden: 1 } },
      },
    ]);
  });

  it("bajar intercambia con el siguiente", async () => {
    const { service, ordenes } = buildService(threeAreas());

    await service.move(areas, "a2", "bajar", admin);

    expect(ordenes("areas")).toEqual([
      ["a1", 1],
      ["a3", 2],
      ["a2", 3],
    ]);
  });

  it("intercambia con el vecino aunque haya huecos en el orden", async () => {
    const { service, ordenes } = buildService({
      areas: [row("a1", "A", 1), row("a2", "B", 5), row("a3", "C", 9)],
    });

    await service.move(areas, "a3", "subir", admin);

    expect(ordenes("areas")).toEqual([
      ["a1", 1],
      ["a3", 5],
      ["a2", 9],
    ]);
  });

  it("subir el primero o bajar el último no cambia nada ni audita", async () => {
    const { service, audits, actors, ordenes } = buildService(threeAreas());

    await service.move(areas, "a1", "subir", admin);
    await service.move(areas, "a3", "bajar", admin);

    expect(audits).toEqual([]);
    expect(actors).toEqual([]);
    expect(ordenes("areas")).toEqual([
      ["a1", 1],
      ["a2", 2],
      ["a3", 3],
    ]);
  });

  it("el vecino incluye a los ítems inactivos", async () => {
    const { service, ordenes } = buildService({
      areas: [row("a1", "A", 1), row("a2", "B", 2, { activo: false }), row("a3", "C", 3)],
    });

    await service.move(areas, "a3", "subir", admin);

    expect(ordenes("areas")).toEqual([
      ["a1", 1],
      ["a3", 2],
      ["a2", 3],
    ]);
  });

  it("con órdenes empatados renumera 1..N y audita solo los que cambiaron", async () => {
    const { service, audits, ordenes } = buildService({
      areas: [row("a1", "A", 1), row("a2", "B", 1), row("a3", "C", 1)],
    });

    await service.move(areas, "a3", "subir", admin);

    // Renumerado: A=1, B=2, C=3; luego C sube y queda A=1, C=2, B=3. A no cambió.
    expect(ordenes("areas")).toEqual([
      ["a1", 1],
      ["a3", 2],
      ["a2", 3],
    ]);
    expect(audits.map((a) => [a.entityId, a.payload])).toEqual([
      ["a2", { before: { orden: 1 }, after: { orden: 3 } }],
      ["a3", { before: { orden: 1 }, after: { orden: 2 } }],
    ]);
  });

  it("responde 404 con un ítem inexistente o eliminado", async () => {
    const { service } = buildService(threeAreas());
    await service.remove(areas, "a2", admin);

    await expect(service.move(areas, "nada", "subir", admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(service.move(areas, "a2", "subir", admin)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("CatalogsService.history", () => {
  it("lee el historial del entityType del catálogo sin chequear que el ítem exista", async () => {
    const { service, history } = buildService();

    await service.history(proveedores, "cualquiera");

    expect(history).toHaveBeenCalledWith("Proveedor", "cualquiera");
  });
});
