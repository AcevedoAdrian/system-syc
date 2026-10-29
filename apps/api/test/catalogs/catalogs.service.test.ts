import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/common/authenticated-request";
import { normalizeName } from "@/common/text";
import type { TicketUsageReader } from "@/common/ticket-usage-reader";
import type { AuditEntry } from "@/modules/audit/audit.repository";
import type { AuditService } from "@/modules/audit/audit.service";
import { CATALOG_DEFINITIONS } from "@/modules/catalogs/catalog-definitions";
import type {
  CatalogRow,
  CatalogsRepository,
  CatalogWrite,
  OrdenChange,
} from "@/modules/catalogs/catalogs.repository";
import { CatalogsService } from "@/modules/catalogs/catalogs.service";

const areas = CATALOG_DEFINITIONS.areas;
const tiposArea = CATALOG_DEFINITIONS.tiposArea;
const edificios = CATALOG_DEFINITIONS.edificios;
const proveedores = CATALOG_DEFINITIONS.proveedores;
const estados = CATALOG_DEFINITIONS.estados;
const prioridades = CATALOG_DEFINITIONS.prioridades;
const modulos = CATALOG_DEFINITIONS.modulos;

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
// `inUse`: cuántos tickets no eliminados usan cada ítem, como "ruta:id" → cantidad. Lo que no figura,
// no lo usa ninguno.
function buildService(
  initial: Record<string, CatalogRow[]> = {},
  inUse: Record<string, number> = {},
) {
  const tables = new Map(
    Object.entries(initial).map(([ruta, rows]) => [ruta, rows.map((r) => ({ ...r }))]),
  );
  const deleted = new Set<string>();
  const audits: AuditEntry[] = [];
  const actors: string[] = [];
  const creates: CatalogWrite[] = []; // lo que el service le pasa al repository en cada alta
  const linkWrites: string[][] = []; // las listas de la unión que el service pide escribir
  const table = (ruta: string) => {
    if (!tables.has(ruta)) tables.set(ruta, []);
    return tables.get(ruta) as CatalogRow[];
  };
  const live = (ruta: string) =>
    table(ruta)
      .filter((r) => !deleted.has(r.id))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
  // Como la base: la relación `tipo` de un área sale del tipo al que apunta `tipoId`.
  const withRelation = (def: { ruta: string }, r: CatalogRow): CatalogRow => {
    const reference = Object.values(CATALOG_DEFINITIONS).find(
      (d) => d.ruta === def.ruta,
    )?.reference;
    if (!reference) return r;
    const target = Object.values(CATALOG_DEFINITIONS).find((d) => d.model === reference.model);
    const found = table(target?.ruta ?? "").find((t) => t.id === r[reference.field]);
    r[reference.as] = found ? { id: found.id, nombre: found.nombre } : null;
    return r;
  };
  const find = (ruta: string, id: string) => table(ruta).find((r) => r.id === id) as CatalogRow;
  // Como la base: la relación de un vínculo sale de los destinos (tabla "departamentos") a los que
  // apuntan los ids escritos, ordenada por nombre normalizado.
  const withLinks = (r: CatalogRow, ids: readonly string[]): CatalogRow => {
    linkWrites.push([...ids]);
    r.departamentos = ids
      .map((id) => find("departamentos", id))
      .map((d) => ({ id: d.id, nombre: d.nombre }))
      .sort((a, b) => normalizeName(a.nombre).localeCompare(normalizeName(b.nombre)));
    return r;
  };

  const repository = {
    // Regla `usedBy`: filas no eliminadas de otro catálogo cuya FK apunta al ítem.
    countReferencing: async (model: string, field: string, id: string) => {
      const def = Object.values(CATALOG_DEFINITIONS).find((d) => d.model === model);
      return live(def?.ruta ?? "").filter((r) => r[field] === id).length;
    },
    findReference: async (model: string, id: string) => {
      const def = Object.values(CATALOG_DEFINITIONS).find((d) => d.model === model);
      const found = live(def?.ruta ?? "").find((r) => r.id === id);
      return found ? { id: found.id, nombre: found.nombre, activo: found.activo } : null;
    },
    findLinkTargets: async (_links: unknown, ids: string[]) =>
      table("departamentos")
        .filter((d) => ids.includes(d.id))
        .map((d) => ({ id: d.id, nombre: d.nombre, activo: d.activo })),
    findAll: async (def: { ruta: string }) => live(def.ruta).map((r) => ({ ...r })),
    create: async (
      def: { ruta: string },
      data: CatalogWrite,
      actorId: string,
      audit: Omit<AuditEntry, "entityId">,
      linkIds: string[] = [],
    ) => {
      creates.push(data);
      const created = withRelation(def, {
        id: `${def.ruta}-${table(def.ruta).length + 1}`,
        ...data,
      } as CatalogRow);
      if (def.ruta === "modulos") withLinks(created, linkIds);
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
      linkIds?: string[],
    ) => {
      actors.push(actorId);
      audits.push(audit);
      const updated = withRelation(def, Object.assign(find(def.ruta, id), data));
      if (linkIds) withLinks(updated, linkIds);
      return { ...updated };
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
  const countByCatalogItem = vi.fn(async (ruta: string, id: string) => inUse[`${ruta}:${id}`] ?? 0);
  const tickets = { countByCatalogItem } as unknown as TicketUsageReader;
  return {
    service: new CatalogsService(repository, audit, tickets),
    countByCatalogItem,
    audits,
    actors,
    creates,
    linkWrites,
    history,
    ordenes: (ruta: string) => live(ruta).map((r) => [r.id, r.orden]),
  };
}

const threeAreas = () => ({
  areas: [row("a1", "Sistemas", 1), row("a2", "Redes", 2), row("a3", "Soporte", 3)],
});

const threeEdificios = () => ({
  edificios: [row("a1", "Sistemas", 1), row("a2", "Redes", 2), row("a3", "Soporte", 3)],
});

describe("CatalogsService.list", () => {
  it("devuelve solo id, nombre, orden y activo de un catálogo simple", async () => {
    const { service } = buildService(threeEdificios());

    expect(await service.list(edificios)).toEqual([
      { id: "a1", nombre: "Sistemas", orden: 1, activo: true },
      { id: "a2", nombre: "Redes", orden: 2, activo: true },
      { id: "a3", nombre: "Soporte", orden: 3, activo: true },
    ]);
  });

  it("devuelve cada área con su tipo { id, nombre }", async () => {
    const { service } = buildService({
      areas: [row("a1", "Acosta", 1, { tipoId: "t1", tipo: { id: "t1", nombre: "Diputado" } })],
    });

    expect(await service.list(areas)).toEqual([
      {
        id: "a1",
        nombre: "Acosta",
        orden: 1,
        activo: true,
        tipo: { id: "t1", nombre: "Diputado" },
      },
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
    const { service, audits, actors } = buildService(threeEdificios());

    const created = await service.create(edificios, { nombre: "Mesa de ayuda" }, admin);

    expect(created).toMatchObject({ nombre: "Mesa de ayuda", orden: 4, activo: true });
    expect(actors).toEqual(["admin-1"]);
    expect(audits).toEqual([
      {
        entityType: "Edificio",
        entityId: created.id,
        action: "create",
        actorId: "admin-1",
        payload: { after: { nombre: "Mesa de ayuda", orden: 4, activo: true } },
      },
    ]);
  });

  it("asigna orden 1 en un catálogo vacío", async () => {
    const { service } = buildService();

    expect(await service.create(edificios, { nombre: "Sistemas" }, admin)).toMatchObject({
      orden: 1,
    });
  });

  it("guarda nombreNormalizado a partir del nombre", async () => {
    const { service, creates } = buildService();

    await service.create(edificios, { nombre: "Área  Técnica" }, admin);

    expect(creates[0]).toMatchObject({
      nombre: "Área  Técnica",
      nombreNormalizado: "area tecnica",
    });
  });

  it("rechaza con 409 un nombre repetido sin importar mayúsculas, acentos ni espacios", async () => {
    const { service } = buildService();
    await service.create(edificios, { nombre: "Área Técnica" }, admin);

    await expect(
      service.create(edificios, { nombre: "area  tecnica" }, admin),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ya existe un edificio con ese nombre",
    });
  });

  it("cuenta los ítems inactivos para la unicidad", async () => {
    const { service } = buildService({ edificios: [row("a1", "Sistemas", 1, { activo: false })] });

    await expect(service.create(edificios, { nombre: "sistemas" }, admin)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("permite el mismo nombre en otro catálogo", async () => {
    const { service } = buildService();
    await service.create(edificios, { nombre: "Área Técnica" }, admin);

    await expect(
      service.create(CATALOG_DEFINITIONS.tipos, { nombre: "Área Técnica" }, admin),
    ).resolves.toMatchObject({ nombre: "Área Técnica", orden: 1 });
  });

  it("permite recrear un nombre después de eliminar el ítem", async () => {
    const { service } = buildService();
    const first = await service.create(edificios, { nombre: "Sistemas" }, admin);
    await service.remove(edificios, first.id, admin);

    const again = await service.create(edificios, { nombre: "Sistemas" }, admin);

    expect(again.id).not.toBe(first.id);
    expect(await service.list(edificios)).toHaveLength(1);
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
    const { service, audits } = buildService(threeEdificios());

    const updated = await service.update(edificios, "a1", { nombre: "Informática" }, admin);

    expect(updated).toMatchObject({ id: "a1", nombre: "Informática" });
    expect(audits).toEqual([
      {
        entityType: "Edificio",
        entityId: "a1",
        action: "update",
        actorId: "admin-1",
        payload: { before: { nombre: "Sistemas" }, after: { nombre: "Informática" } },
      },
    ]);
  });

  it("sin cambios efectivos responde el ítem y no audita ni escribe", async () => {
    const { service, audits, actors } = buildService(threeEdificios());

    const result = await service.update(edificios, "a1", { nombre: "Sistemas" }, admin);

    expect(result).toMatchObject({ id: "a1", nombre: "Sistemas" });
    expect(audits).toEqual([]);
    expect(actors).toEqual([]);
  });

  it("permite cambiar solo mayúsculas o acentos del propio nombre", async () => {
    const { service } = buildService({ edificios: [row("a1", "Area", 1)] });

    await expect(service.update(edificios, "a1", { nombre: "Área" }, admin)).resolves.toMatchObject(
      {
        nombre: "Área",
      },
    );
  });

  it("rechaza con 409 el nombre de otro ítem del mismo catálogo", async () => {
    const { service } = buildService(threeEdificios());

    await expect(service.update(edificios, "a1", { nombre: "REDES" }, admin)).rejects.toMatchObject(
      {
        code: "CONFLICT",
      },
    );
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

  describe("ítem en uso por un ticket (SPEC 05, Feature 5.9)", () => {
    it("un ítem que usa un ticket no eliminado: 409, no se elimina y no se audita", async () => {
      const { service, audits } = buildService(threeAreas(), { "areas:a2": 1 });

      await expect(service.remove(areas, "a2", admin)).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: "Lo usa al menos un ticket: desactivalo en lugar de eliminarlo",
      });

      expect((await service.list(areas)).map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
      expect(audits).toHaveLength(0);
    });

    it("un ítem que ningún ticket usa se elimina, aunque otro del catálogo esté en uso", async () => {
      const { service } = buildService(threeAreas(), { "areas:a1": 3 });

      await service.remove(areas, "a2", admin);

      expect((await service.list(areas)).map((i) => i.id)).toEqual(["a1", "a3"]);
    });

    it("lo que cuentan son los tickets no eliminados: uno usado solo por eliminados se elimina", async () => {
      // El reader ya descuenta los eliminados (devuelve 0): el service no vuelve a mirarlos.
      const { service } = buildService(threeAreas(), { "areas:a2": 0 });

      await service.remove(areas, "a2", admin);

      expect((await service.list(areas)).map((i) => i.id)).toEqual(["a1", "a3"]);
    });

    it("consulta el catálogo correcto: la misma id en otro catálogo no cuenta", async () => {
      const { service, countByCatalogItem } = buildService(threeAreas(), { "edificios:a2": 5 });

      await service.remove(areas, "a2", admin);

      expect(countByCatalogItem).toHaveBeenCalledWith("areas", "a2");
    });

    it("rige para los 7 catálogos: pregunta con la ruta de cada uno", async () => {
      const rutas = [
        "areas",
        "edificios",
        "tipos",
        "prioridades",
        "modulos",
        "proveedores",
      ] as const;
      for (const ruta of rutas) {
        const items = { [ruta]: [row("x1", "Uno", 1), row("x2", "Dos", 2)] };
        const { service } = buildService(items, { [`${ruta}:x1`]: 2 });

        await expect(service.remove(CATALOG_DEFINITIONS[ruta], "x1", admin)).rejects.toMatchObject({
          code: "CONFLICT",
        });
        await service.remove(CATALOG_DEFINITIONS[ruta], "x2", admin);
      }
    });

    it("rige para los 8 catálogos: Tipos de área también pregunta con su ruta", async () => {
      const { service, countByCatalogItem } = buildService({
        tiposArea: [row("t1", "Diputado", 1), row("t2", "Bloque", 2)],
      });

      await service.remove(tiposArea, "t2", admin);

      expect(countByCatalogItem).toHaveBeenCalledWith("tiposArea", "t2");
    });

    it("un estado de sistema sigue sin poder eliminarse: la regla de la clave va primero", async () => {
      const { service, countByCatalogItem } = buildService(
        {
          estados: [row("e1", "Pendiente", 1), row("e2", "Finalizado", 2, { clave: "FINALIZADO" })],
        },
        { "estados:e2": 4 },
      );

      await expect(service.remove(estados, "e2", admin)).rejects.toMatchObject({
        message: "Es un estado de sistema: se puede renombrar o desactivar, pero no eliminar",
      });
      expect(countByCatalogItem).not.toHaveBeenCalled();
    });

    it("un estado sin clave usado por un ticket: 409", async () => {
      const { service } = buildService(
        { estados: [row("e1", "Pendiente", 1), row("e3", "En espera", 3)] },
        { "estados:e3": 1 },
      );

      await expect(service.remove(estados, "e3", admin)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Lo usa al menos un ticket: desactivalo en lugar de eliminarlo",
      });
    });
  });
});

describe("CatalogsService: Áreas con tipo", () => {
  const diputado = { id: "t1", nombre: "Diputado" };
  const bloque = { id: "t2", nombre: "Bloque" };
  const tipos = () => [
    row("t1", "Diputado", 1),
    row("t2", "Bloque", 2),
    row("t3", "Comisión", 3, { activo: false }),
  ];
  const acosta = (extra: Partial<CatalogRow> = {}) =>
    row("a1", "Acosta", 1, { tipoId: "t1", tipo: diputado, ...extra });

  it("el alta guarda el tipo y lo audita como { id, nombre }", async () => {
    const { service, audits, creates } = buildService({ tiposArea: tipos() });

    const created = await service.create(areas, { nombre: "Acosta", tipoId: "t1" }, admin);

    expect(creates[0]).toMatchObject({ tipoId: "t1" });
    expect(created).toMatchObject({ nombre: "Acosta", tipo: diputado });
    expect(audits[0]?.payload).toEqual({
      after: { nombre: "Acosta", orden: 1, activo: true, tipo: diputado },
    });
  });

  it("el mismo nombre en dos tipos convive; en el mismo tipo, 409", async () => {
    const { service } = buildService({ tiposArea: tipos() });
    await service.create(areas, { nombre: "Gonzalez", tipoId: "t1" }, admin);

    await expect(
      service.create(areas, { nombre: "Gonzalez", tipoId: "t2" }, admin),
    ).resolves.toMatchObject({ tipo: bloque });
    await expect(
      service.create(areas, { nombre: "gonzález", tipoId: "t1" }, admin),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Ya existe un área con ese nombre en ese tipo",
    });
  });

  it("un tipo inexistente, eliminado o desactivado en el alta: 400", async () => {
    const { service } = buildService({ tiposArea: tipos() });

    for (const tipoId of ["nada", "t3"]) {
      await expect(
        service.create(areas, { nombre: "Acosta", tipoId }, admin),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "El tipo de área no existe o está desactivado",
      });
    }
  });

  it("renombrar un área cuyo tipo está desactivado, sin cambiarle el tipo, se permite", async () => {
    const { service, audits } = buildService({
      tiposArea: tipos(),
      areas: [acosta({ tipoId: "t3", tipo: { id: "t3", nombre: "Comisión" } })],
    });

    await expect(
      service.update(areas, "a1", { nombre: "Acosta M.", tipoId: "t3" }, admin),
    ).resolves.toMatchObject({ nombre: "Acosta M." });
    expect(audits[0]?.payload).toEqual({
      before: { nombre: "Acosta" },
      after: { nombre: "Acosta M." },
    });
  });

  it("pasar a un tipo desactivado en la edición: 400", async () => {
    const { service } = buildService({ tiposArea: tipos(), areas: [acosta()] });

    await expect(
      service.update(areas, "a1", { nombre: "Acosta", tipoId: "t3" }, admin),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("cambiar el tipo deja un update con tipo antes y después", async () => {
    const { service, audits } = buildService({ tiposArea: tipos(), areas: [acosta()] });

    const updated = await service.update(areas, "a1", { nombre: "Acosta", tipoId: "t2" }, admin);

    expect(updated).toMatchObject({ tipo: bloque });
    expect(audits).toEqual([
      {
        entityType: "Area",
        entityId: "a1",
        action: "update",
        actorId: "admin-1",
        payload: { before: { tipo: diputado }, after: { tipo: bloque } },
      },
    ]);
  });

  it("la unicidad en la edición se mide en el tipo de destino", async () => {
    const { service } = buildService({
      tiposArea: tipos(),
      areas: [acosta(), row("a2", "Acosta", 2, { tipoId: "t2", tipo: bloque })],
    });

    await expect(
      service.update(areas, "a1", { nombre: "Acosta", tipoId: "t2" }, admin),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("CatalogsService: Módulos con departamentos", () => {
  const desarrollo = { id: "d1", nombre: "Desarrollo" };
  const redes = { id: "d2", nombre: "Redes" };
  const tecnico = { id: "d3", nombre: "Técnico" };
  const departamentos = () => [
    row("d1", "Desarrollo", 1),
    row("d2", "Redes", 2),
    row("d3", "Técnico", 3),
    row("d4", "Archivo", 4, { activo: false }),
  ];
  const servidores = (deps = [desarrollo, redes]) =>
    row("m1", "Servidores", 1, { departamentos: deps });

  it("list devuelve cada módulo con sus departamentos", async () => {
    const { service } = buildService({ modulos: [servidores()] });

    expect(await service.list(modulos)).toEqual([
      {
        id: "m1",
        nombre: "Servidores",
        orden: 1,
        activo: true,
        departamentos: [desarrollo, redes],
      },
    ]);
  });

  it("el alta con dos departamentos devuelve los dos ordenados y los audita", async () => {
    const { service, audits, linkWrites } = buildService({ departamentos: departamentos() });

    const created = await service.create(
      modulos,
      { nombre: "Servidores", departamentoIds: ["d2", "d1"] },
      admin,
    );

    expect(created).toMatchObject({ departamentos: [desarrollo, redes] });
    expect(linkWrites).toEqual([["d2", "d1"]]);
    expect(audits[0]).toMatchObject({
      entityType: "Modulo",
      action: "create",
      payload: {
        after: { nombre: "Servidores", orden: 1, activo: true, departamentos: [desarrollo, redes] },
      },
    });
  });

  it("el mismo departamento dos veces cuenta una sola", async () => {
    const { service, linkWrites } = buildService({ departamentos: departamentos() });

    const created = await service.create(
      modulos,
      { nombre: "Servidores", departamentoIds: ["d1", "d1", "d1"] },
      admin,
    );

    expect(linkWrites).toEqual([["d1"]]);
    expect(created).toMatchObject({ departamentos: [desarrollo] });
  });

  it("sin departamentos, con lista vacía: 400 y no escribe", async () => {
    const { service, audits } = buildService({ departamentos: departamentos() });

    for (const input of [{ nombre: "Servidores" }, { nombre: "Servidores", departamentoIds: [] }]) {
      await expect(service.create(modulos, input, admin)).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Elegí al menos un departamento",
      });
    }
    expect(audits).toEqual([]);
  });

  it("un departamento inexistente o desactivado en el alta: 400", async () => {
    const { service, audits } = buildService({ departamentos: departamentos() });

    for (const departamentoIds of [["nada"], ["d1", "nada"], ["d4"]]) {
      await expect(
        service.create(modulos, { nombre: "Servidores", departamentoIds }, admin),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "El departamento no existe o está desactivado",
      });
    }
    expect(audits).toEqual([]);
  });

  it("editar conservando un departamento que se desactivó después: 200", async () => {
    const archivo = { id: "d4", nombre: "Archivo" };
    const { service, audits } = buildService({
      departamentos: departamentos(),
      modulos: [servidores([archivo, desarrollo])],
    });

    const updated = await service.update(
      modulos,
      "m1",
      { nombre: "Servidores", departamentoIds: ["d4", "d1", "d2"] },
      admin,
    );

    expect(updated).toMatchObject({ departamentos: [archivo, desarrollo, redes] });
    expect(audits[0]?.payload).toEqual({
      before: { departamentos: [archivo, desarrollo] },
      after: { departamentos: [archivo, desarrollo, redes] },
    });
  });

  it("agregar un departamento desactivado que el módulo no tenía: 400", async () => {
    const { service } = buildService({ departamentos: departamentos(), modulos: [servidores()] });

    await expect(
      service.update(modulos, "m1", { nombre: "Servidores", departamentoIds: ["d1", "d4"] }, admin),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("quitar un departamento deja un update con departamentos antes y después", async () => {
    const { service, audits, linkWrites } = buildService({
      departamentos: departamentos(),
      modulos: [servidores()],
    });

    const updated = await service.update(
      modulos,
      "m1",
      { nombre: "Servidores", departamentoIds: ["d1"] },
      admin,
    );

    expect(updated).toMatchObject({ departamentos: [desarrollo] });
    expect(linkWrites).toEqual([["d1"]]);
    expect(audits).toEqual([
      {
        entityType: "Modulo",
        entityId: "m1",
        action: "update",
        actorId: "admin-1",
        payload: {
          before: { departamentos: [desarrollo, redes] },
          after: { departamentos: [desarrollo] },
        },
      },
    ]);
  });

  it("reenviar los mismos departamentos en otro orden: 200, sin escribir ni auditar", async () => {
    const { service, audits, actors, linkWrites } = buildService({
      departamentos: departamentos(),
      modulos: [servidores()],
    });

    const updated = await service.update(
      modulos,
      "m1",
      { nombre: "Servidores", departamentoIds: ["d2", "d1"] },
      admin,
    );

    expect(updated).toMatchObject({ departamentos: [desarrollo, redes] });
    expect(audits).toEqual([]);
    expect(actors).toEqual([]);
    expect(linkWrites).toEqual([]);
  });

  it("renombrar sin tocar los departamentos no reescribe la unión", async () => {
    const { service, audits, linkWrites } = buildService({
      departamentos: departamentos(),
      modulos: [servidores()],
    });

    await service.update(
      modulos,
      "m1",
      { nombre: "Servidores web", departamentoIds: ["d1", "d2"] },
      admin,
    );

    expect(audits[0]?.payload).toEqual({
      before: { nombre: "Servidores" },
      after: { nombre: "Servidores web" },
    });
    expect(linkWrites).toEqual([]);
  });

  it("el nombre sigue siendo único en todo el catálogo, no por departamento", async () => {
    const { service } = buildService({ departamentos: departamentos(), modulos: [servidores()] });

    await expect(
      service.create(modulos, { nombre: "servidores", departamentoIds: ["d3"] }, admin),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Ya existe un módulo con ese nombre" });
  });

  it("desactivar y mover no cambian los departamentos", async () => {
    const { service, audits, linkWrites } = buildService({
      departamentos: departamentos(),
      modulos: [servidores(), row("m2", "Correo", 2, { departamentos: [tecnico] })],
    });

    const inactive = await service.setActive(modulos, "m1", false, admin);
    await service.move(modulos, "m1", "bajar", admin);

    expect(inactive).toMatchObject({ activo: false, departamentos: [desarrollo, redes] });
    expect(audits[0]?.payload).toEqual({ before: { activo: true }, after: { activo: false } });
    expect(JSON.stringify(audits.slice(1))).not.toContain("departamentos");
    expect(linkWrites).toEqual([]);
  });

  it("un módulo con un ticket no eliminado sigue dando 409; sin tickets se elimina", async () => {
    const { service, audits } = buildService(
      { modulos: [servidores(), row("m2", "Correo", 2, { departamentos: [tecnico] })] },
      { "modulos:m1": 1 },
    );

    await expect(service.remove(modulos, "m1", admin)).rejects.toMatchObject({ code: "CONFLICT" });
    await service.remove(modulos, "m2", admin);

    expect(audits.map((a) => [a.entityId, a.action])).toEqual([["m2", "delete"]]);
  });

  it("un catálogo simple ignora departamentoIds: no valida ni escribe nada", async () => {
    const { service, creates, linkWrites } = buildService();

    await service.create(edificios, { nombre: "Anexo", departamentoIds: [] }, admin);

    expect(creates[0]).not.toHaveProperty("departamentoIds");
    expect(linkWrites).toEqual([]);
  });
});

describe("CatalogsService.remove: Tipos de área", () => {
  const unTipoConArea = () => ({
    tiposArea: [row("t1", "Diputado", 1), row("t2", "Bloque", 2)],
    areas: [row("a1", "Acosta", 1, { tipoId: "t1" })],
  });

  it("un tipo con un área no eliminada: 409 y no se elimina", async () => {
    const { service, audits } = buildService(unTipoConArea());

    await expect(service.remove(tiposArea, "t1", admin)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Lo usa al menos un área: desactivalo en lugar de eliminarlo",
    });
    expect((await service.list(tiposArea)).map((i) => i.id)).toEqual(["t1", "t2"]);
    expect(audits).toEqual([]);
  });

  it("un tipo sin áreas se elimina", async () => {
    const { service } = buildService(unTipoConArea());

    await service.remove(tiposArea, "t2", admin);

    expect((await service.list(tiposArea)).map((i) => i.id)).toEqual(["t1"]);
  });

  it("con su única área eliminada, el tipo se elimina", async () => {
    const { service } = buildService(unTipoConArea());

    await service.remove(areas, "a1", admin);
    await service.remove(tiposArea, "t1", admin);

    expect((await service.list(tiposArea)).map((i) => i.id)).toEqual(["t2"]);
  });

  it("las áreas de otro tipo no cuentan", async () => {
    const { service } = buildService({
      tiposArea: [row("t1", "Diputado", 1), row("t2", "Bloque", 2)],
      areas: [row("a1", "Acosta", 1, { tipoId: "t2" })],
    });

    await service.remove(tiposArea, "t1", admin);

    expect((await service.list(tiposArea)).map((i) => i.id)).toEqual(["t2"]);
  });

  it("desactivar un tipo con áreas está permitido", async () => {
    const { service } = buildService(unTipoConArea());

    const item = await service.setActive(tiposArea, "t1", false, admin);

    expect(item).toMatchObject({ id: "t1", activo: false });
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
    const service = new CatalogsService(
      repository,
      {} as unknown as AuditService,
      {} as unknown as TicketUsageReader,
    );
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
