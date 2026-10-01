import { describe, expect, it } from "vitest";
import { normalizeName, uniqueSlug } from "./text";

describe("normalizeName", () => {
  it("ignora mayúsculas, acentos y espacios sobrantes", () => {
    expect(normalizeName("  Técnico ")).toBe("tecnico");
    expect(normalizeName("TÉCNICO")).toBe(normalizeName("tecnico"));
    expect(normalizeName("Atención   al  Público")).toBe("atencion al publico");
  });

  it("distingue nombres realmente distintos", () => {
    expect(normalizeName("Redes")).not.toBe(normalizeName("Red"));
  });
});

describe("uniqueSlug", () => {
  it("genera kebab-case en minúsculas y sin acentos", () => {
    expect(uniqueSlug("Atención al Público", new Set())).toBe("atencion-al-publico");
    expect(uniqueSlug("  Redes & Telefonía! ", new Set())).toBe("redes-telefonia");
  });

  it("suma -2, -3 si colisiona", () => {
    expect(uniqueSlug("Redes", new Set(["redes"]))).toBe("redes-2");
    expect(uniqueSlug("Redes", new Set(["redes", "redes-2"]))).toBe("redes-3");
  });

  it("no queda vacío si el nombre no tiene letras ni números", () => {
    expect(uniqueSlug("???", new Set())).toBe("departamento");
  });
});
