import type { UserRole } from "./authenticated-request";

// Matriz de permisos del PRD §4.2. Los permisos se declaran en el decorador de cada endpoint
// (`@RequirePermission`) y los evalúa `PermissionsGuard`; nunca se resuelven dentro de un service.
export const PERMISSIONS = {
  TICKET_VIEW: "ticket:view",
  TICKET_CREATE: "ticket:create",
  TICKET_EDIT: "ticket:edit", // editar, cambiar estado y comentar
  TICKET_DELETE: "ticket:delete",
  COMMENT_DELETE: "comment:delete",
  TICKET_CHANGE_DEPARTMENT: "ticket:change-department",
  MANAGE: "manage", // usuarios, departamentos y catálogos
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  // Un agente solo ve, crea, edita y comenta tickets, y únicamente en su propio departamento.
  agente: new Set([PERMISSIONS.TICKET_VIEW, PERMISSIONS.TICKET_CREATE, PERMISSIONS.TICKET_EDIT]),
  admin: new Set(ALL_PERMISSIONS),
};
