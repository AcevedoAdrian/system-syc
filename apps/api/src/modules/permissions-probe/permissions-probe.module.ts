import { Module } from "@nestjs/common";
import {
  PermissionsProbeController,
  ProbeDepartmentResolver,
} from "./permissions-probe.controller";

// TEMPORAL (SPEC 02): ver `permissions-probe.controller.ts`.
@Module({
  controllers: [PermissionsProbeController],
  providers: [ProbeDepartmentResolver],
})
export class PermissionsProbeModule {}
