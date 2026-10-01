import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@syc/db";
import type { DepartmentReader } from "../../common/department-reader";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";

@Injectable()
export class AuthRepository implements DepartmentReader {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async findDepartmentIdOf(userId: string): Promise<string | null> {
    const member = await getPrismaClient(this.env.DATABASE_URL).member.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    return member?.organizationId ?? null;
  }
}
