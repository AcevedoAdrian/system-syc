import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { OrganizationsService } from "./organizations.service";

@Controller()
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  // Se implementa el router completo para que el compilador marque cualquier procedimiento faltante.
  @RequirePermission(PERMISSIONS.MANAGE)
  @Implement(contract.organizations)
  organizations() {
    const c = contract.organizations;
    return {
      list: implement(c.list).handler(() => this.service.list()),
      create: implement(c.create).handler(({ input }) => this.service.create(input)),
      rename: implement(c.rename).handler(({ input }) => this.service.rename(input)),
      setActive: implement(c.setActive).handler(({ input }) => this.service.setActive(input)),
      remove: implement(c.remove).handler(({ input }) => this.service.remove(input.organizationId)),
    };
  }
}
