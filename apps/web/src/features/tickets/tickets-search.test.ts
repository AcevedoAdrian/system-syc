import { describe, expect, it } from "vitest";
import { hasActiveFilters, ticketsSearchSchema, withFilter } from "./tickets-search";

describe("ticketsSearchSchema", () => {
  it("conserva la búsqueda, los filtros y la página de la URL", () => {
    const search = {
      q: "impresora",
      estadoId: "e1",
      fechaRecepcionDesde: "2026-10-01",
      fechaRecepcionHasta: "2026-10-31",
      page: 2,
    };
    expect(ticketsSearchSchema.parse(search)).toEqual(search);
  });

  it("un número en la búsqueda (el router parsea ?q=123 como número) sigue siendo texto", () => {
    expect(ticketsSearchSchema.parse({ q: 123 }).q).toBe("123");
  });

  it("recorta y descarta lo vacío", () => {
    const parsed = ticketsSearchSchema.parse({ q: "  ", estadoId: "" });
    expect(parsed.q).toBeUndefined();
    expect(parsed.estadoId).toBeUndefined();
    expect(ticketsSearchSchema.parse({ q: " hola " }).q).toBe("hola");
  });

  it.each([0, -1, 1.5, "abc", null])("descarta una página inválida: %j", (page) => {
    expect(ticketsSearchSchema.parse({ page }).page).toBeUndefined();
  });

  it("acepta la página como texto", () => {
    expect(ticketsSearchSchema.parse({ page: "3" }).page).toBe(3);
  });

  it("descarta una fecha inválida o un texto demasiado largo, sin romper el resto", () => {
    const parsed = ticketsSearchSchema.parse({
      fechaRecepcionDesde: "01/10/2026",
      q: "a".repeat(201),
      areaId: "a1",
    });
    expect(parsed.fechaRecepcionDesde).toBeUndefined();
    expect(parsed.q).toBeUndefined();
    expect(parsed.areaId).toBe("a1");
  });

  it("sin nada es una búsqueda vacía", () => {
    expect(ticketsSearchSchema.parse({})).toEqual({});
  });
});

describe("hasActiveFilters", () => {
  it("la página sola no es un filtro", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ page: 3 })).toBe(false);
  });

  it("la búsqueda, un filtro o una fecha sí", () => {
    expect(hasActiveFilters({ q: "x" })).toBe(true);
    expect(hasActiveFilters({ areaId: "a1" })).toBe(true);
    expect(hasActiveFilters({ fechaRecepcionHasta: "2026-10-01" })).toBe(true);
  });
});

describe("withFilter", () => {
  it("cambia el filtro y vuelve a la página 1", () => {
    expect(withFilter({ q: "x", page: 4 }, "estadoId", "e1")).toEqual({
      q: "x",
      estadoId: "e1",
      page: undefined,
    });
  });

  it("un valor vacío quita el filtro", () => {
    expect(withFilter({ estadoId: "e1", page: 2 }, "estadoId", "")).toEqual({});
    expect(withFilter({ estadoId: "e1" }, "estadoId", undefined)).toEqual({});
  });
});
