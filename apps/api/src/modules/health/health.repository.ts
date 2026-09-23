import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@syc/db";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";

@Injectable()
export class HealthRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async pingDatabase(): Promise<void> {
    await getPrismaClient(this.env.DATABASE_URL).$queryRaw`SELECT 1`;
  }
}
