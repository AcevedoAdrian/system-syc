import { tonos } from "@syc/contracts";
import { Tono } from "@syc/db";
import { describe, expect, it } from "vitest";

// SPEC 10: la lista de tonos del contrato y el enum de Prisma son dos copias de lo mismo. Un tono
// agregado en un lugar y no en el otro rompe acá, no en una escritura contra la base.
describe("tonos", () => {
  it("coinciden con los valores del enum Tono de Prisma", () => {
    expect([...tonos].sort()).toEqual(Object.values(Tono).sort());
  });
});
