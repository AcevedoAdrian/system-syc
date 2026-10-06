import { createORPCClient, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { contract, STALE_TICKET_MESSAGE } from "@syc/contracts";
import { describe, expect, it } from "vitest";
import { getErrorMessage, isConflict, isNotFound, isStaleTicket, isUnauthorized } from "./errors";

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

describe("isNotFound e isConflict", () => {
  it("detectan el status, sin mirar el mensaje", () => {
    expect(isNotFound(new ORPCError("NOT_FOUND", { status: 404 }))).toBe(true);
    expect(isNotFound(new ORPCError("CONFLICT", { status: 409 }))).toBe(false);
    expect(isNotFound(new Error("404"))).toBe(false);
    expect(isConflict(new ORPCError("CONFLICT", { status: 409 }))).toBe(true);
    expect(isConflict(new ORPCError("NOT_FOUND", { status: 404 }))).toBe(false);
  });

  // El guard de la API responde el 404 de un ticket ajeno con el cuerpo de una excepción de Nest, no
  // con el formato de oRPC. Se prueba con el cliente real que el status llega igual, porque la
  // pantalla del ticket decide "El ticket no existe" solo por el status.
  it("el 404 con el cuerpo de Nest llega al cliente real como ORPCError con status 404", async () => {
    const nestBody = { statusCode: 404, message: "El ticket no existe", error: "Not Found" };
    const fetch = async () =>
      new Response(JSON.stringify(nestBody), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    const client: ContractRouterClient<typeof contract> = createORPCClient(
      new OpenAPILink(contract, { url: "http://api.test", fetch }),
    );

    const error = await client.tickets.get({ ticketId: "t1" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ORPCError);
    expect(isNotFound(error)).toBe(true);
    expect(isConflict(error)).toBe(false);
  });
});

describe("isStaleTicket", () => {
  it("solo es la versión desactualizada, no cualquier 409", () => {
    const stale = new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE });
    const duplicate = new ORPCError("CONFLICT", {
      status: 409,
      message: "Esa referencia ya está cargada en el ticket TE-000013",
    });

    expect(isStaleTicket(stale)).toBe(true);
    expect(isStaleTicket(duplicate)).toBe(false);
    expect(isStaleTicket(new Error(STALE_TICKET_MESSAGE))).toBe(false);
    expect(
      isStaleTicket(new ORPCError("NOT_FOUND", { status: 404, message: STALE_TICKET_MESSAGE })),
    ).toBe(false);
  });
});
