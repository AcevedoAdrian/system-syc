import type { IncomingHttpHeaders } from "node:http";

export type UserRole = "admin" | "agente";

// Filtro obligatorio para los listados: `departmentId` para un agente, `null` (sin filtro) para un admin.
export interface UserScope {
  departmentId: string | null;
}

// Usuario de la sesión tal como lo ven los guards y los handlers.
export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  // Lo deja `PermissionsGuard`: solo está en endpoints con `@RequirePermission()`.
  scope?: UserScope;
}

export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  currentUser?: AuthenticatedUser;
}
