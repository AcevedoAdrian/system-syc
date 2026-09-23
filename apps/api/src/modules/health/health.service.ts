import { Injectable } from "@nestjs/common";
import type { HealthStatus } from "@syc/contracts";
import { HealthRepository } from "./health.repository";

@Injectable()
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  async check(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    try {
      await this.repository.pingDatabase();
      return { status: "ok", database: "up", timestamp };
    } catch {
      return { status: "degraded", database: "down", timestamp };
    }
  }
}
