import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@syc/db";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";

export interface DepartmentRow {
  id: string;
  nombre: string;
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  // El departamento se lee de `Member` en cada request, no de la sesión.
  async findDepartmentOf(userId: string): Promise<DepartmentRow | null> {
    const member = await getPrismaClient(this.env.DATABASE_URL).member.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { id: true, name: true } } },
    });
    return member ? { id: member.organization.id, nombre: member.organization.name } : null;
  }
}
