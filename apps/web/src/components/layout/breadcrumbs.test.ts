import { describe, expect, it } from "vitest";
import { breadcrumbsFor } from "./breadcrumbs";

describe("breadcrumbsFor", () => {
  it.each([
    ["/tickets", ["Módulos", "Tickets"]],
    ["/tickets/", ["Módulos", "Tickets"]],
    ["/tickets/nuevo", ["Módulos", "Tickets", "Nuevo ticket"]],
    ["/tickets/abc-123", ["Módulos", "Tickets", "Detalle"]],
    ["/admin/departamentos", ["Administración", "Departamentos"]],
    ["/admin/catalogos", ["Administración", "Catálogos"]],
    ["/admin/usuarios", ["Administración", "Usuarios"]],
    ["/estilos", ["Desarrollo", "Galería de estilos"]],
  ])("%s → %j", (pathname, trail) => {
    expect(breadcrumbsFor(pathname)).toEqual(trail);
  });

  it("una ruta que no conoce no muestra migas", () => {
    expect(breadcrumbsFor("/")).toEqual([]);
    expect(breadcrumbsFor("/otra-cosa")).toEqual([]);
  });
});
