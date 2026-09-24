import { describe, expect, it, vi } from "vitest";
import type { HealthRepository } from "./health.repository";
import { HealthService } from "./health.service";

function buildService(pingDatabase: () => Promise<void>) {
  const repository = { pingDatabase: vi.fn(pingDatabase) } as unknown as HealthRepository;
  return new HealthService(repository);
}

describe("HealthService", () => {
  it("responde ok/up cuando la base de datos contesta", async () => {
    const result = await buildService(async () => undefined).check();

    expect(result.status).toBe("ok");
    expect(result.database).toBe("up");
  });

  it("responde degraded/down sin lanzar error cuando la base de datos falla", async () => {
    const result = await buildService(async () => {
      throw new Error("connection refused");
    }).check();

    expect(result.status).toBe("degraded");
    expect(result.database).toBe("down");
  });
});
