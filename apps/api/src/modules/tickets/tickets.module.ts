import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import {
  TicketCreateDepartmentResolver,
  TicketDepartmentResolver,
} from "./ticket-department.resolver";
import { TicketsController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";
import { TicketsService } from "./tickets.service";

// Los resolvers son providers para que `PermissionsGuard` los obtenga por clase (`departmentFrom`).
@Module({
  imports: [AuditModule],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketsRepository,
    TicketDepartmentResolver,
    TicketCreateDepartmentResolver,
  ],
})
export class TicketsModule {}
