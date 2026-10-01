import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";

@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Implement(contract.users.me)
  me(@CurrentUser() user: AuthenticatedUser) {
    return implement(contract.users.me).handler(() => this.service.me(user));
  }
}
