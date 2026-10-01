import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";

// `users.me` es para cualquier usuario con sesión; el resto de `users.*` es solo del admin
// (SPEC 02 paso 10), por eso viven en controllers distintos.
@Controller()
export class UsersMeController {
  constructor(private readonly service: UsersService) {}

  @Implement(contract.users.me)
  me(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.users.me).handler(() => this.service.me(user));
  }
}
