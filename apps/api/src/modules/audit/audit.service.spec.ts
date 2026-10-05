import { describe, expect, it, vi } from "vitest";
import type { AuditEntry, AuditRepository, AuditRow } from "./audit.repository";
import { AuditService } from "./audit.service";

function buildService(overrides: Partial<Record<"insert" | "findHistory", unknown>> = {}) {
  const repository = {
    insert: vi.fn(async () => undefined),
    findHistory: vi.fn(async (): Promise<AuditRow[]> => []),
    ...overrides,
  };
  return { service: new AuditService(repository as unknown as AuditRepository), repository };
}

describe("AuditService", () => {
  it("log escribe el registro con el actor explícito", async () => {
    const { service, repository } = buildService();
    const entry: AuditEntry = {
      entityType: "Organization",
      entityId: "o1",
      action: "create",
      actorId: "admin-1",
      payload: { after: { nombre: "Soporte", activo: true } },
    };

    await service.log(entry);

    expect(repository.insert).toHaveBeenCalledWith(entry);
  });

  it("log acepta actorId null (sistema, seed)", async () => {
    const { service, repository } = buildService();

    await service.log({
      entityType: "User",
      entityId: "u1",
      action: "create",
      actorId: null,
      payload: {},
    });

    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({ actorId: null }));
  });

  it("history conserva el orden del repository y serializa la fecha ISO", async () => {
    const rows: AuditRow[] = [
      {
        id: "b",
        action: "update",
        actor: { id: "admin-1", name: "Admin" },
        payload: { before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } },
        createdAt: new Date("2026-10-05T12:00:00.000Z"),
      },
      {
        id: "a",
        action: "create",
        actor: null,
        payload: {},
        createdAt: new Date("2026-10-05T11:00:00.000Z"),
      },
    ];
    const { service, repository } = buildService({ findHistory: vi.fn(async () => rows) });

    const history = await service.history("Organization", "o1");

    expect(repository.findHistory).toHaveBeenCalledWith("Organization", "o1");
    expect(history.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(history[0]?.createdAt).toBe("2026-10-05T12:00:00.000Z");
    expect(history[1]?.actor).toBeNull();
  });

  it("history de un id sin registros devuelve []", async () => {
    const { service } = buildService();

    expect(await service.history("Organization", "nada")).toEqual([]);
  });
});
