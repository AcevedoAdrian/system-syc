import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("acepta rutas internas, con query", () => {
    expect(safeRedirectPath("/admin/usuarios")).toBe("/admin/usuarios");
    expect(safeRedirectPath("/tickets?estado=abierto")).toBe("/tickets?estado=abierto");
  });

  it("descarta destinos externos y el propio login", () => {
    expect(safeRedirectPath(undefined)).toBeUndefined();
    expect(safeRedirectPath("")).toBeUndefined();
    expect(safeRedirectPath("https://otro-sitio.com")).toBeUndefined();
    expect(safeRedirectPath("//otro-sitio.com")).toBeUndefined();
    expect(safeRedirectPath("/\\otro-sitio.com")).toBeUndefined();
    expect(safeRedirectPath("/login")).toBeUndefined();
    expect(safeRedirectPath("/login?redirect=/")).toBeUndefined();
  });
});
