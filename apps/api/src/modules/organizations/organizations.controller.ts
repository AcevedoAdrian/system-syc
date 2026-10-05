import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { OrganizationsService } from "./organizations.service";

@Controller()
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  // Se implementa el router completo para que el compilador marque cualquier procedimiento faltante.
  @RequirePermission(PERMISSIONS.MANAGE)
  @Implement(contract.organizations)
  organizations(@CurrentUser() actor: AuthenticatedUser) {
    const c = contract.organizations;
    return {
      list: implement(c.list).handler(() => this.service.list()),
      create: implement(c.create).handler(({ input }) => this.service.create(input, actor)),
      rename: implement(c.rename).handler(({ input }) => this.service.rename(input, actor)),
      setActive: implement(c.setActive).handler(({ input }) =>
        this.service.setActive(input, actor),
      ),
      history: implement(c.history).handler(({ input }) =>
        this.service.history(input.organizationId),
      ),
      remove: implement(c.remove).handler(({ input }) =>
        this.service.remove(input.organizationId, actor),
      ),
    };
  }
}
