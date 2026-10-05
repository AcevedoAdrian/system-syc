import { Injectable } from "@nestjs/common";
import { type AuditEntry, AuditRepository } from "./audit.repository";

export interface AuditHistoryEntry {
  id: string;
  action: string;
  actor: { id: string; name: string } | null;
  payload: AuditEntry["payload"];
  createdAt: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  // El `actorId` llega explícito desde el controller (`@CurrentUser()`): los services no tienen
  // contexto de request. Para mutaciones con Prisma propio no se usa este método sino
  // `writeAuditEntry`, que escribe dentro de la transacción de la mutación.
  async log(entry: AuditEntry): Promise<void> {
    await this.repository.insert(entry);
  }

  // Del más reciente al más antiguo. Un id sin registros devuelve `[]`.
  async history(entityType: string, entityId: string): Promise<AuditHistoryEntry[]> {
    const rows = await this.repository.findHistory(entityType, entityId);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
}
