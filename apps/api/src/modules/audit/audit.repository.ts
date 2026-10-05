import { Inject, Injectable } from "@nestjs/common";
import { getPrismaClient, type PrismaClient } from "@syc/db";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import type { AuditValue } from "./audit-diff";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null; // null = sistema (seed)
  payload: { [key: string]: AuditValue };
}

export interface AuditRow {
  id: string;
  action: string;
  actor: { id: string; name: string } | null;
  payload: { [key: string]: AuditValue };
  createdAt: Date;
}

// Cliente de una transacción interactiva de Prisma (`$transaction(async (tx) => ...)`).
export type AuditTransaction = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// Escribe un `AuditLog` dentro de una transacción ajena: así la auditoría y la mutación del
// módulo que la llama se confirman o se revierten juntas. Es la forma de usarlo para todo lo que
// se escribe con Prisma propio (`Organization`, `Member` y los modelos de negocio).
export async function writeAuditEntry(tx: AuditTransaction, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: entry });
}

// Única capa que toca `AuditLog`. Es append-only: no hay `update` ni `delete`.
@Injectable()
export class AuditRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  async insert(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({ data: entry });
  }

  async findHistory(entityType: string, entityId: string): Promise<AuditRow[]> {
    const rows = await this.db.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { actor: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      payload: row.payload as AuditRow["payload"],
      createdAt: row.createdAt,
    }));
  }
}
