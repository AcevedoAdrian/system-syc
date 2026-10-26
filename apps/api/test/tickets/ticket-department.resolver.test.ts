import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "@/common/authenticated-request";
import { TicketDepartmentResolver } from "@/modules/tickets/ticket-department.resolver";
import type { TicketsRepository } from "@/modules/tickets/tickets.repository";

function buildResolver() {
  const findDepartmentId = vi.fn(async (id: string) => (id === "t-1" ? "tec" : "red"));
  const resolver = new TicketDepartmentResolver({
    findDepartmentId,
  } as unknown as TicketsRepository);
  return { resolver, findDepartmentId };
}

const request = (extra: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest => ({
  headers: {},
  params: { ticketId: "t-1" },
  ...extra,
});

describe("TicketDepartmentResolver", () => {
  it("resuelve el departamento del ticket de la URL", async () => {
    const { resolver } = buildResolver();

    await expect(resolver.resolve(request())).resolves.toBe("tec");
  });

  it("sin ticketId en la URL no resuelve nada", () => {
    const { resolver, findDepartmentId } = buildResolver();

    expect(resolver.resolve(request({ params: {} }))).toBeNull();
    expect(findDepartmentId).not.toHaveBeenCalled();
  });

  it("acepta el mismo ticketId repetido en el cuerpo o en la query", async () => {
    const { resolver } = buildResolver();

    await expect(resolver.resolve(request({ body: { ticketId: "t-1" } }))).resolves.toBe("tec");
    await expect(resolver.resolve(request({ query: { ticketId: "t-1" } }))).resolves.toBe("tec");
  });

  it.each([
    ["en el cuerpo", { body: { ticketId: "t-2" } }],
    ["en la query", { query: { ticketId: "t-2" } }],
    ["repetido en la query", { query: { ticketId: ["t-1", "t-2"] } }],
    ["con otro tipo", { body: { ticketId: 2 } }],
    ["vacío", { body: { ticketId: "" } }],
  ])("rechaza un ticketId distinto %s, sin consultar la base", (_caso, extra) => {
    const { resolver, findDepartmentId } = buildResolver();

    expect(resolver.resolve(request(extra))).toBeNull();
    expect(findDepartmentId).not.toHaveBeenCalled();
  });

  it("ignora un cuerpo sin ticketId o que no es un objeto", async () => {
    const { resolver } = buildResolver();

    await expect(resolver.resolve(request({ body: { titulo: "x" } }))).resolves.toBe("tec");
    await expect(resolver.resolve(request({ body: "texto" }))).resolves.toBe("tec");
    await expect(resolver.resolve(request({ body: null }))).resolves.toBe("tec");
  });
});
