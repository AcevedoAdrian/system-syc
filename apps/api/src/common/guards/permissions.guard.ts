import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../authenticated-request";
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMetadata,
} from "../decorators/require-permission.decorator";
import { DEPARTMENT_READER, type DepartmentReader } from "../department-reader";
import { ROLE_PERMISSIONS } from "../permissions";

// Portero central de permisos. Corre después de `AuthGuard`. Evalúa el permiso contra el rol y,
// cuando el recurso tiene departamento, contra el del recurso (nunca contra `createdBy`, PRD §4.1).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
    @Inject(DEPARTMENT_READER) private readonly departments: DepartmentReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequirePermissionMetadata | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.currentUser;
    if (!user) throw new UnauthorizedException();

    if (!ROLE_PERMISSIONS[user.role].has(required.permission)) throw new ForbiddenException();

    if (user.role === "admin") {
      user.scope = { departmentId: null };
      return true;
    }

    // Agente: su departamento se lee de `Member` en cada request. Sin `Member` (estado
    // inconsistente) no puede hacer nada que exija departamento.
    const departmentId = await this.departments.findDepartmentIdOf(user.id);
    if (!departmentId) throw new ForbiddenException();
    user.scope = { departmentId };

    if (required.departmentFrom) {
      const resolver = this.moduleRef.get(required.departmentFrom, { strict: false });
      // Recurso inexistente o de otro departamento: 403 igual, para no revelar si existe.
      if ((await resolver.resolve(request)) !== departmentId) throw new ForbiddenException();
    }
    return true;
  }
}
