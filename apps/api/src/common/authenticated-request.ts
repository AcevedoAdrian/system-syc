import type { IncomingHttpHeaders } from "node:http";

export type UserRole = "admin" | "agente";

// Usuario de la sesión tal como lo ven los guards y los handlers.
export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest {
  headers: IncomingHttpHeaders;
  currentUser?: AuthenticatedUser;
}
