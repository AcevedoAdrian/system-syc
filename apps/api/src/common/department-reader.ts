import type { AuthenticatedRequest } from "./authenticated-request";

// Lee el departamento del usuario de `Member` en cada request (no de la sesión). Lo implementa el
// módulo `auth`; el guard solo conoce este contrato.
export const DEPARTMENT_READER = Symbol("DEPARTMENT_READER");

export interface DepartmentReader {
  findDepartmentIdOf(userId: string): Promise<string | null>;
}

// Dice a qué departamento pertenece el recurso que toca la request (id en la URL, campo del payload).
// `null` si no existe. Lo provee el módulo dueño del recurso.
export interface DepartmentResolver {
  resolve(request: AuthenticatedRequest): Promise<string | null> | string | null;
}
