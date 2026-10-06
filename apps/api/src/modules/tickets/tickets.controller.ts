import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { ownTicket, TicketCreateDepartmentResolver } from "./ticket-department.resolver";
import { TicketsService } from "./tickets.service";

const c = contract.tickets;

// Un método por procedimiento, porque cada uno declara su propio permiso en el guard. El
// `ticketsProcedures` de abajo hace que el compilador marque un procedimiento del contrato sin método.
@Controller()
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  // El agente ve su departamento y el admin todos: el service filtra con `user.scope`.
  @RequirePermission(PERMISSIONS.TICKET_VIEW)
  @Implement(c.list)
  list(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.list).handler(() => this.service.list(actor));
  }

  @RequirePermission(PERMISSIONS.TICKET_VIEW, ownTicket)
  @Implement(c.get)
  get() {
    return implement(c.get).handler(({ input }) => this.service.get(input.ticketId));
  }

  // Un agente solo crea en su departamento: el resolver lee `departamentoId` del cuerpo y, si es
  // otro, el guard responde 403.
  @RequirePermission(PERMISSIONS.TICKET_CREATE, { departmentFrom: TicketCreateDepartmentResolver })
  @Implement(c.create)
  create(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.create).handler(({ input }) => this.service.create(input, actor));
  }

  @RequirePermission(PERMISSIONS.TICKET_EDIT, ownTicket)
  @Implement(c.update)
  update(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.update).handler(({ input }) => this.service.update(input, actor));
  }

  @RequirePermission(PERMISSIONS.TICKET_EDIT, ownTicket)
  @Implement(c.changeStatus)
  changeStatus(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.changeStatus).handler(({ input }) =>
      this.service.changeStatus(input, actor),
    );
  }

  // Solo el admin: un agente recibe 403, también sobre un ticket de su propio departamento.
  @RequirePermission(PERMISSIONS.TICKET_CHANGE_DEPARTMENT)
  @Implement(c.changeDepartment)
  changeDepartment(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.changeDepartment).handler(({ input }) =>
      this.service.changeDepartment(input, actor),
    );
  }

  // Solo el admin: un agente recibe 403, también sobre un ticket de su propio departamento.
  @RequirePermission(PERMISSIONS.TICKET_DELETE)
  @Implement(c.remove)
  remove(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.remove).handler(({ input }) => this.service.remove(input.ticketId, actor));
  }

  @RequirePermission(PERMISSIONS.TICKET_VIEW, ownTicket)
  @Implement(c.history)
  history() {
    return implement(c.history).handler(({ input }) => this.service.history(input.ticketId));
  }
}

// Cada procedimiento del contrato con el método que lo implementa. Si el contrato suma uno, o se
// renombra un método, el compilador lo marca acá.
export const ticketsProcedures = {
  list: "list",
  get: "get",
  create: "create",
  update: "update",
  changeStatus: "changeStatus",
  changeDepartment: "changeDepartment",
  remove: "remove",
  history: "history",
} satisfies Record<keyof typeof contract.tickets, keyof TicketsController>;
