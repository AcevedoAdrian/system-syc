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
const prioridades = CATALOG_DEFINITIONS.prioridades;

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

// Los 7 estados del seed (Feature 4.5), con la clave de los 4 de sistema.
const sevenEstados = () => ({
  estados: [
    row("e1", "Pendiente", 1, { clave: null }),
    row("e2", "En progreso", 2, { clave: null }),
    row("e3", "En espera", 3, { clave: null }),
    row("e4", "Finalizado", 4, { clave: "FINALIZADO" }),
    row("e5", "Cerrado", 5, { clave: "CERRADO" }),
    row("e6", "Cancelado", 6, { clave: "CANCELADO" }),
    row("e7", "Reabierto", 7, { clave: "REABIERTO" }),
  ],
});

describe("Estados: los de sistema (con clave)", () => {
  it.each(["e4", "e5", "e6", "e7"])("%s no se elimina nunca: 409 y no audita", async (id) => {
    const { service, audits, actors } = buildService(sevenEstados());

    await expect(service.remove(estados, id, admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("estado de sistema"),
    });

    expect(audits).toEqual([]);
    expect(actors).toEqual([]);
    expect(await service.list(estados)).toHaveLength(7);
  });

  it("tampoco se elimina si es el único: gana la regla de la clave", async () => {
    const { service } = buildService({
      estados: [row("e5", "Cerrado", 1, { clave: "CERRADO" })],
    });

    await expect(service.remove(estados, "e5", admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("estado de sistema"),
    });
  });

  it("se pueden renombrar, desactivar, reactivar y mover, y la clave no cambia", async () => {
    const { service } = buildService(sevenEstados());

    await service.update(estados, "e4", { nombre: "Resuelto" }, admin);
    await service.setActive(estados, "e5", false, admin);
    await service.setActive(estados, "e5", true, admin);
    await service.move(estados, "e6", "subir", admin);

    const byId = Object.fromEntries((await service.list(estados)).map((i) => [i.id, i]));
    expect(byId.e4).toMatchObject({ nombre: "Resuelto", clave: "FINALIZADO" });
    expect(byId.e5).toMatchObject({ activo: true, clave: "CERRADO" });
    expect(byId.e6).toMatchObject({ orden: 5, clave: "CANCELADO" });
  });

  it("un estado sin clave sí se elimina", async () => {
    const { service, audits } = buildService(sevenEstados());

    await service.remove(estados, "e3", admin);

    expect(await service.list(estados)).toHaveLength(6);
    expect(audits.map((a) => a.action)).toEqual(["delete"]);
  });
});

describe("Estados y Prioridades: siempre queda un ítem activo", () => {
  it("desactivar el primer estado con otros activos funciona", async () => {
    const { service } = buildService(sevenEstados());

    await expect(service.setActive(estados, "e1", false, admin)).resolves.toMatchObject({
      activo: false,
    });
  });

  it("desactivar el único estado activo da 409 y no audita", async () => {
    const { service, audits } = buildService({
      estados: [
        row("e1", "Pendiente", 1),
        row("e2", "En progreso", 2, { activo: false }),
        row("e5", "Cerrado", 3, { clave: "CERRADO", activo: false }),
      ],
    });

    await expect(service.setActive(estados, "e1", false, admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "No se puede desactivar el último estado activo",
    });
    expect(audits).toEqual([]);
  });

  it("eliminar el único estado activo da 409", async () => {
    const { service } = buildService({
      estados: [row("e1", "Pendiente", 1), row("e2", "En progreso", 2, { activo: false })],
    });

    await expect(service.remove(estados, "e1", admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "No se puede eliminar el último estado activo",
    });
  });

  it("eliminar un estado inactivo cuando queda un solo activo se permite", async () => {
    const { service } = buildService({
      estados: [row("e1", "Pendiente", 1), row("e2", "En progreso", 2, { activo: false })],
    });

    await service.remove(estados, "e2", admin);

    expect((await service.list(estados)).map((i) => i.id)).toEqual(["e1"]);
  });

  it("desactivar la única prioridad activa da 409", async () => {
    const { service } = buildService({
      prioridades: [row("p1", "Baja", 1, { activo: false }), row("p2", "Media", 2)],
    });

    await expect(service.setActive(prioridades, "p2", false, admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "No se puede desactivar la última prioridad activa",
    });
  });

  it("eliminar la única prioridad activa da 409", async () => {
    const { service } = buildService({ prioridades: [row("p1", "Media", 1)] });

    await expect(service.remove(prioridades, "p1", admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "No se puede eliminar la última prioridad activa",
    });
  });

  it("con otra prioridad activa se puede desactivar y eliminar", async () => {
    const { service } = buildService({
      prioridades: [row("p1", "Baja", 1), row("p2", "Media", 2)],
    });

    await service.setActive(prioridades, "p1", false, admin);
    await expect(service.setActive(prioridades, "p1", true, admin)).resolves.toMatchObject({
      activo: true,
    });
    await service.remove(prioridades, "p1", admin);

    expect((await service.list(prioridades)).map((i) => i.id)).toEqual(["p2"]);
  });

  it("los otros catálogos no tienen la regla: Edificios elimina su último activo", async () => {
    const { service } = buildService({ edificios: [row("b1", "Central", 1)] });

    await service.remove(edificios, "b1", admin);

    expect(await service.list(edificios)).toEqual([]);
  });
});

describe("CatalogsService.seedIfEmpty", () => {
  function buildSeedService(created: number) {
    const seedIfEmpty = vi.fn(async () => created);
    const repository = { seedIfEmpty } as unknown as CatalogsRepository;
    const service = new CatalogsService(repository, {} as unknown as AuditService);
    return { service, seedIfEmpty };
  }

  it("arma las filas con orden 1..N, clave solo en los de sistema y auditoría del sistema", async () => {
    const { service, seedIfEmpty } = buildSeedService(2);

    const created = await service.seedIfEmpty(
      estados,
      [{ nombre: "Pendiente" }, { nombre: "Cerrado", clave: "CERRADO" }],
      "admin-1",
    );

    expect(created).toBe(2);
    expect(seedIfEmpty).toHaveBeenCalledWith(
      estados,
      [
        {
          data: { nombre: "Pendiente", nombreNormalizado: "pendiente", orden: 1, activo: true },
          audit: {
            entityType: "EstadoTicket",
            action: "create",
            actorId: null,
            payload: {
              after: { nombre: "Pendiente", orden: 1, activo: true, clave: null },
            },
          },
        },
        {
          data: {
            nombre: "Cerrado",
            nombreNormalizado: "cerrado",
            orden: 2,
            activo: true,
            clave: "CERRADO",
          },
          audit: {
            entityType: "EstadoTicket",
            action: "create",
            actorId: null,
            payload: {
              after: { nombre: "Cerrado", orden: 2, activo: true, clave: "CERRADO" },
            },
          },
        },
      ],
      "admin-1",
    );
  });

  it("no manda `clave` a un catálogo que no la tiene", async () => {
    const { service, seedIfEmpty } = buildSeedService(1);

    await service.seedIfEmpty(prioridades, [{ nombre: "Baja" }], "admin-1");

    const [, entries] = seedIfEmpty.mock.calls[0] as unknown as [unknown, { data: object }[]];
    expect(Object.keys(entries[0]?.data ?? {}).sort()).toEqual([
      "activo",
      "nombre",
      "nombreNormalizado",
      "orden",
    ]);
  });

  it("devuelve 0 cuando el repository encuentra la tabla con datos", async () => {
    const { service } = buildSeedService(0);

    expect(await service.seedIfEmpty(prioridades, [{ nombre: "Baja" }], "admin-1")).toBe(0);
  });
});
