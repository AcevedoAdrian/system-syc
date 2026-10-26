import { describe, expect, it } from "vitest";
import { randomPassword } from "@/common/random-password";

describe("randomPassword", () => {
  it("tiene 16 caracteres por defecto y acepta otro largo", () => {
    expect(randomPassword()).toHaveLength(16);
    expect(randomPassword(24)).toHaveLength(24);
  });

  it("usa solo letras y números sin ambigüedad (nada de 0, O, 1, l ni I)", () => {
    for (let i = 0; i < 200; i++) expect(randomPassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
  });

  it("no repite: 1000 contraseñas son todas distintas", () => {
    expect(new Set(Array.from({ length: 1000 }, () => randomPassword())).size).toBe(1000);
  });
});
