import { SetMetadata, type Type } from "@nestjs/common";
import type { DepartmentResolver } from "../department-reader";
import type { Permission } from "../permissions";

export const REQUIRE_PERMISSION_KEY = "requirePermission";

export interface RequirePermissionOptions {
  // Clase (provista por el módulo del recurso) que resuelve el departamento del recurso. Si el
  // recurso pertenece a un departamento, un agente solo pasa si es el suyo.
  departmentFrom?: Type<DepartmentResolver>;
  // Qué responde el guard cuando el recurso es de otro departamento o no existe. Por omisión, 403.
  // Con "not-found" responde 404 (SPEC 05, Feature 5.8): un agente no puede descubrir qué recursos
  // existen en otros departamentos, porque "ajeno" e "inexistente" son indistinguibles.
  outOfScope?: "not-found";
  // Mensaje del 404 de `outOfScope`. El guard no conoce el dominio, así que lo pone el endpoint.
  notFoundMessage?: string;
}

export interface RequirePermissionMetadata extends RequirePermissionOptions {
  permission: Permission;
}

export const RequirePermission = (permission: Permission, options: RequirePermissionOptions = {}) =>
  SetMetadata<string, RequirePermissionMetadata>(REQUIRE_PERMISSION_KEY, {
    permission,
    ...options,
  });
