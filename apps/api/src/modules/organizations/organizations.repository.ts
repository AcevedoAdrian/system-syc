import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient } from "@syc/db";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  activo: boolean;
  agentes: number;
}

const withAgentCount = { _count: { select: { members: true } } } as const;

function toRow(row: {
  id: string;
  name: string;
  slug: string;
  activo: boolean;
  _count: { members: number };
}): OrganizationRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    activo: row.activo,
    agentes: row._count.members,
  };
}

// Better Auth no sirve para este ABM: sus rutas de `organization` exigen que quien llama sea
// `Member`, y el admin no tiene departamento. Por eso se escribe `Organization` directo.
@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  async findAll(): Promise<OrganizationRow[]> {
    const rows = await this.db.organization.findMany({
      include: withAgentCount,
      orderBy: { name: "asc" },
    });
    return rows.map(toRow);
  }

  async findById(id: string): Promise<OrganizationRow | null> {
    const row = await this.db.organization.findUnique({ where: { id }, include: withAgentCount });
    return row ? toRow(row) : null;
  }

  async create(data: { name: string; slug: string }): Promise<OrganizationRow> {
    const row = await this.db.organization.create({
      data: { id: randomUUID(), name: data.name, slug: data.slug, createdAt: new Date() },
      include: withAgentCount,
    });
    return toRow(row);
  }

  async rename(id: string, name: string): Promise<OrganizationRow> {
    const row = await this.db.organization.update({
      where: { id },
      data: { name },
      include: withAgentCount,
    });
    return toRow(row);
  }

  async setActive(id: string, activo: boolean): Promise<OrganizationRow> {
    const row = await this.db.organization.update({
      where: { id },
      data: { activo },
      include: withAgentCount,
    });
    return toRow(row);
  }

  async remove(id: string): Promise<void> {
    await this.db.organization.delete({ where: { id } });
  }
}
