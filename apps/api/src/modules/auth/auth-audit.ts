import { Logger } from "@nestjs/common";
import type { AuditService } from "../audit/audit.service";

const logger = new Logger("AuthAudit");

// Callback `onPasswordChanged` de `createAuth`: deja `change_password` con el propio usuario como
// actor y payload vacío (nunca la contraseña). Si falla, se loguea y el error sube: la request
// responde 500 aunque Better Auth ya cambió la contraseña (excepción de SPEC 03, Feature 3.1).
export function auditPasswordChanged(audit: AuditService): (userId: string) => Promise<void> {
  return async (userId) => {
    try {
      await audit.log({
        entityType: "User",
        entityId: userId,
        action: "change_password",
        actorId: userId,
        payload: {},
      });
    } catch (error) {
      logger.error(
        `No se pudo auditar change_password de User ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  };
}
