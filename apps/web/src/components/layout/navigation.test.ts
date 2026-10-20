import { catalogRutas } from "@syc/contracts";
import { describe, expect, it } from "vitest";
import { CATALOG_KINDS } from "@/features/catalogs/catalog-kinds";
import { breadcrumbFor, catalogoFromSearch, initialsOf } from "./navigation";

describe("breadcrumbFor", () => {
  it.each([
    ["/tickets", { parent: "Módulos", current: "Tickets" }],
    ["/tickets/", { parent: "Módulos", current: "Tickets" }],
    ["/tickets/nuevo", { parent: "Tickets", current: "Nuevo ticket" }],
    ["/tickets/abc-123", { parent: "Tickets", current: "Detalle del ticket" }],
    ["/admin/departamentos", { parent: "Administración", current: "Departamentos" }],
    ["/admin/usuarios", { parent: "Administración", current: "Usuarios" }],
  ])("%s", (pathname, expected) => {
    expect(breadcrumbFor(pathname, "areas")).toEqual(expected);
  });

  it("en catálogos, la miga es el catálogo abierto", () => {
    for (const ruta of catalogRutas) {
      expect(breadcrumbFor("/admin/catalogos", ruta)).toEqual({
        parent: "Catálogos",
        current: CATALOG_KINDS[ruta].title,
      });
    }
  });

  it("no hay migas en una ruta desconocida ni en la raíz", () => {
    expect(breadcrumbFor("/", "areas")).toBeNull();
    expect(breadcrumbFor("/login", "areas")).toBeNull();
  });
});

describe("catalogoFromSearch", () => {
  it("lee un catálogo válido", () => {
    expect(catalogoFromSearch({ catalogo: "edificios" })).toBe("edificios");
  });

  it("cae en el primero si falta, es desconocido o la búsqueda no es un objeto", () => {
    expect(catalogoFromSearch({})).toBe("areas");
    expect(catalogoFromSearch({ catalogo: "otro" })).toBe("areas");
    expect(catalogoFromSearch({ catalogo: 3 })).toBe("areas");
    expect(catalogoFromSearch(undefined)).toBe("areas");
    expect(catalogoFromSearch(null)).toBe("areas");
    expect(catalogoFromSearch("catalogo=edificios")).toBe("areas");
  });
});

describe("initialsOf", () => {
  it("toma la inicial de las dos primeras palabras, en mayúscula", () => {
    expect(initialsOf("ana pérez")).toBe("AP");
    expect(initialsOf("Ana María Pérez Gómez")).toBe("AM");
  });

  it("con una sola palabra, una inicial", () => {
    expect(initialsOf("admin")).toBe("A");
  });

  it("ignora los espacios de más", () => {
    expect(initialsOf("  luis   gómez ")).toBe("LG");
  });

  it("sin nombre, un signo de pregunta", () => {
    expect(initialsOf(undefined)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
