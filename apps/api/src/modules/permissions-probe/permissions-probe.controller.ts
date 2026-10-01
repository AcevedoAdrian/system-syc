import { Controller, Delete, Get, Injectable, Post } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import type { DepartmentResolver } from "../../common/department-reader";
import { PERMISSIONS } from "../../common/permissions";

// TEMPORAL (SPEC 02): recurso ficticio que pertenece al departamento cuyo id va en la URL.
// SPEC 05 reutiliza esta mecánica con tickets reales y elimina este módulo.
@Injectable()
export class ProbeDepartmentResolver implements DepartmentResolver {
  resolve(request: AuthenticatedRequest): string | null {
    return request.params?.departmentId ?? null;
  }
}

@Controller("_probe/departments/:departmentId")
export class PermissionsProbeController {
  @Get()
  @RequirePermission(PERMISSIONS.TICKET_VIEW, { departmentFrom: ProbeDepartmentResolver })
  view(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, scope: user.scope };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TICKET_EDIT, { departmentFrom: ProbeDepartmentResolver })
  edit(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, scope: user.scope };
  }

  @Delete()
  @RequirePermission(PERMISSIONS.TICKET_DELETE, { departmentFrom: ProbeDepartmentResolver })
  remove(@CurrentUser() user: AuthenticatedUser) {
    return { ok: true, scope: user.scope };
  }
}
