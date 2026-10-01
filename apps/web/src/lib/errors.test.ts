import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";
import { getErrorMessage, isUnauthorized } from "./errors";

describe("isUnauthorized", () => {
  it("detecta el 401 de la API, venga o no con el formato de oRPC", () => {
    expect(isUnauthorized(new ORPCError("UNAUTHORIZED", { status: 401 }))).toBe(true);
    expect(isUnauthorized(new ORPCError("FORBIDDEN"))).toBe(false);
    expect(isUnauthorized(new Error("boom"))).toBe(false);
  });
});

describe("getErrorMessage", () => {
  it("muestra el mensaje de la API en los 400, 404 y 409", () => {
    const conflict = new ORPCError("CONFLICT", {
      message: "Ya existe un departamento con ese nombre",
    });
    expect(getErrorMessage(conflict)).toBe("Ya existe un departamento con ese nombre");
    expect(getErrorMessage(new ORPCError("NOT_FOUND", { message: "El usuario no existe" }))).toBe(
      "El usuario no existe",
    );
  });

  it("no muestra el mensaje técnico de validación", () => {
    const validation = new ORPCError("BAD_REQUEST", { message: "Input validation failed" });
    expect(getErrorMessage(validation)).toBe(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
  });

  it("explica el 403 y cae en un mensaje genérico para lo demás", () => {
    expect(getErrorMessage(new ORPCError("FORBIDDEN"))).toBe(
      "No tenés permiso para realizar esta acción.",
    );
    expect(getErrorMessage(new Error("boom"))).toBe(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
  });
});
