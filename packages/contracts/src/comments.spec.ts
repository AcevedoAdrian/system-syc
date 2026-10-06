import { describe, expect, it } from "vitest";
import { comentarioTextoSchema, createCommentInputSchema } from "./comments.js";

describe("comentarioTextoSchema", () => {
  it("recorta los espacios de los extremos", () => {
    expect(comentarioTextoSchema.parse("  Llamé al proveedor \n")).toBe("Llamé al proveedor");
  });

  it.each(["", "   ", "\n\t "])("rechaza un texto vacío o solo de espacios: %j", (texto) => {
    expect(comentarioTextoSchema.safeParse(texto).success).toBe(false);
  });

  it("acepta 2000 caracteres y rechaza 2001", () => {
    expect(comentarioTextoSchema.safeParse("a".repeat(2000)).success).toBe(true);
    expect(comentarioTextoSchema.safeParse("a".repeat(2001)).success).toBe(false);
  });

  it("cuenta el largo después de recortar", () => {
    expect(comentarioTextoSchema.safeParse(` ${"a".repeat(2000)} `).success).toBe(true);
  });
});

describe("createCommentInputSchema", () => {
  it("recorta el texto y conserva el ticket", () => {
    expect(createCommentInputSchema.parse({ ticketId: "t1", texto: " hola " })).toEqual({
      ticketId: "t1",
      texto: "hola",
    });
  });

  it("rechaza un comentario de solo espacios", () => {
    expect(createCommentInputSchema.safeParse({ ticketId: "t1", texto: "  " }).success).toBe(false);
  });
});
