import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import { RequestHeaders } from "../../common/decorators/request-headers.decorator";
import { UsersService } from "./users.service";

// Router de gestión de usuarios (solo admin). Se implementa completo para que el compilador marque
// cualquier procedimiento faltante. `setActive` y `resetPassword` se suman en el paso 9; mientras
// tanto quedan fuera de este router para que `typecheck` siga en verde.
const {
  me: _me,
  setActive: _setActive,
  resetPassword: _resetPassword,
  ...management
} = contract.users;

@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Implement(management)
  users(@RequestHeaders() headers: Headers) {
    return {
      list: implement(management.list).handler(() => this.service.list()),
      create: implement(management.create).handler(({ input }) =>
        this.service.create(input, headers),
      ),
      update: implement(management.update).handler(({ input }) =>
        this.service.update(input, headers),
      ),
    };
  }
}
