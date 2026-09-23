import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly service: HealthService) {}

  @Implement(contract.health.check)
  check() {
    return implement(contract.health.check).handler(() => this.service.check());
  }
}
