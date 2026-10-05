import type { User } from "@syc/contracts";
import type { AuditSnapshot } from "../audit/audit-diff";

// Foto auditable de un usuario (SPEC 03): solo estos campos entran en el payload. Nunca hay
// contraseñas ni hashes. El email es el visible (`null` si es el interno `<username>@syc.local`).
export function userAuditSnapshot(user: User): AuditSnapshot {
  return {
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    activo: user.activo,
    departamento: user.department,
  };
}
