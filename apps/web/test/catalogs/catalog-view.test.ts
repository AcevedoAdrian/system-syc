import { describe, expect, it } from "vitest";
import {
  CATALOG_PAGE_SIZE,
  filterCatalog,
  paginate,
  statusCounts,
} from "@/features/catalogs/catalog-view";
import type { CatalogEntry } from "@/features/catalogs/hooks/catalog-api";

const item = (id: string, nombre: string, activo = true, extra: Partial<CatalogEntry> = {}) =>
  ({ id, nombre, orden: Number(id.replace(/\D/g, "")) || 0, activo, ...extra }) as CatalogEntry;

const items = [
  item("a1", "Sistemas", true, { tipo: { id: "t1", nombre: "Diputado" } }),
  item("a2", "Redes", true, { tipo: { id: "t1", nombre: "Diputado" } }),
  item("a3", "Archivo histórico", false, { tipo: { id: "t2", nombre: "Dirección" } }),
  item("a4", "Mesa de entradas", true),
];

describe("filterCatalog", () => {
  it("sin búsqueda ni filtro devuelve todo, en el mismo orden", () => {
    expect(filterCatalog(items, "", "todos").map((i) => i.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });

  it("busca sin distinguir mayúsculas ni acentos", () => {
    expect(filterCatalog(items, "HISTORICO", "todos").map((i) => i.id)).toEqual(["a3"]);
    expect(filterCatalog(items, "direccion", "todos").map((i) => i.id)).toEqual(["a3"]);
    expect(filterCatalog(items, "  redes  ", "todos").map((i) => i.id)).toEqual(["a2"]);
  });

  it("busca en una parte del nombre", () => {
    expect(filterCatalog(items, "entr", "todos").map((i) => i.id)).toEqual(["a4"]);
  });

  it("en las áreas también busca por el tipo, que se muestra junto al nombre", () => {
    expect(filterCatalog(items, "diputado", "todos").map((i) => i.id)).toEqual(["a1", "a2"]);
  });

  it("filtra por estado", () => {
    expect(filterCatalog(items, "", "activos").map((i) => i.id)).toEqual(["a1", "a2", "a4"]);
    expect(filterCatalog(items, "", "desactivados").map((i) => i.id)).toEqual(["a3"]);
  });

  it("combina la búsqueda con el filtro de estado", () => {
    expect(filterCatalog(items, "diputado", "desactivados")).toEqual([]);
    expect(filterCatalog(items, "a", "desactivados").map((i) => i.id)).toEqual(["a3"]);
  });

  it("sin coincidencias devuelve una lista vacía", () => {
    expect(filterCatalog(items, "zzz", "todos")).toEqual([]);
  });
});

describe("statusCounts", () => {
  it("cuenta cada filtro sobre la lista completa", () => {
    expect(statusCounts(items)).toEqual({ todos: 4, activos: 3, desactivados: 1 });
  });

  it("con una lista vacía, todo es cero", () => {
    expect(statusCounts([])).toEqual({ todos: 0, activos: 0, desactivados: 0 });
  });
});

describe("paginate", () => {
  const many = Array.from({ length: 25 }, (_, i) => item(`n${i + 1}`, `Ítem ${i + 1}`));

  it("pagina de a 10", () => {
    expect(CATALOG_PAGE_SIZE).toBe(10);
    const page = paginate(many, 1);

    expect(page.rows.map((i) => i.id)).toEqual(many.slice(0, 10).map((i) => i.id));
    expect(page).toMatchObject({ page: 1, pages: 3, from: 1, to: 10, total: 25 });
  });

  it("la última página trae el resto", () => {
    const page = paginate(many, 3);

    expect(page.rows).toHaveLength(5);
    expect(page).toMatchObject({ page: 3, from: 21, to: 25 });
  });

  it("una página fuera de rango se corrige a la más cercana", () => {
    expect(paginate(many, 9).page).toBe(3);
    expect(paginate(many, 0).page).toBe(1);
    expect(paginate(many, -4).page).toBe(1);
  });

  it("sin filas hay una página y el tramo es 0–0", () => {
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pages: 1, from: 0, to: 0, total: 0 });
  });

  it("con exactamente una página llena no inventa otra", () => {
    const diez = many.slice(0, 10);

    expect(paginate(diez, 1)).toMatchObject({ pages: 1, from: 1, to: 10 });
    expect(paginate(diez, 2).page).toBe(1);
  });

  it("acepta otro tamaño de página", () => {
    expect(paginate(many, 2, 5)).toMatchObject({ page: 2, pages: 5, from: 6, to: 10 });
  });
});
