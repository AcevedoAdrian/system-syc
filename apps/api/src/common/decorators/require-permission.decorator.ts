import { SetMetadata, type Type } from "@nestjs/common";
import type { DepartmentResolver } from "../department-reader";
import type { Permission } from "../permissions";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

export interface RequirePermissionOptions {
  // Clase (provista por el módulo del recurso) que resuelve el departamento del recurso. Si el
  // recurso pertenece a un departamento, un agente solo pasa si es el suyo.
  departmentFrom?: Type<DepartmentResolver>;
}

export interface RequirePermissionMetadata extends RequirePermissionOptions {
  permission: Permission;
}

export const RequirePermission = (permission: Permission, options: RequirePermissionOptions = {}) =>
  SetMetadata<string, RequirePermissionMetadata>(REQUIRE_PERMISSION_KEY, {
    permission,
    ...options,
  });
