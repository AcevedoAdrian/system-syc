import { Global, Module } from "@nestjs/common";
import { TICKET_USAGE_READER } from "../../common/ticket-usage-reader";
import { AuditModule } from "../audit/audit.module";
import { CommentsController } from "./comments.controller";
import { CommentsRepository } from "./comments.repository";
import { CommentsService } from "./comments.service";
import {
  TicketCreateDepartmentResolver,
  TicketDepartmentResolver,
} from "./ticket-department.resolver";
import { TicketsController } from "./tickets.controller";
import { TicketsRepository } from "./tickets.repository";
import { TicketsService } from "./tickets.service";

// Los resolvers son providers para que `PermissionsGuard` los obtenga por clase (`departmentFrom`).
// Es global porque `catalogs` y `organizations` inyectan `TICKET_USAGE_READER` sin importar este
// módulo: ninguno de los dos conoce la tabla `ticket` (SPEC 05, Feature 5.9).
@Global()
@Module({
  imports: [AuditModule],
  controllers: [TicketsController, CommentsController],
  providers: [
    TicketsService,
    TicketsRepository,
    CommentsService,
    CommentsRepository,
    TicketDepartmentResolver,
    TicketCreateDepartmentResolver,
    { provide: TICKET_USAGE_READER, useExisting: TicketsRepository },
  ],
  exports: [TICKET_USAGE_READER],
})
export class TicketsModule {}
