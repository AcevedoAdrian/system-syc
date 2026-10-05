import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequestHeaders } from "../../common/decorators/request-headers.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { UsersService } from "./users.service";

// Router de gestión de usuarios (solo admin). Se implementa completo para que el compilador marque
// cualquier procedimiento faltante; `me` va aparte, en `UsersMeController`.
const { me: _me, ...management } = contract.users;

@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @RequirePermission(PERMISSIONS.MANAGE)
  @Implement(management)
  users(@CurrentUser() actor: AuthenticatedUser, @RequestHeaders() headers: Headers) {
    return {
      list: implement(management.list).handler(() => this.service.list()),
      create: implement(management.create).handler(({ input }) =>
        this.service.create(input, actor, headers),
      ),
      update: implement(management.update).handler(({ input }) =>
        this.service.update(input, actor, headers),
      ),
      setActive: implement(management.setActive).handler(({ input }) =>
        this.service.setActive(input, actor, headers),
      ),
      resetPassword: implement(management.resetPassword).handler(({ input }) =>
        this.service.resetPassword(input, actor, headers),
      ),
    };
  }
}
