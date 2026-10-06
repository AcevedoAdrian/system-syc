import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { CommentsService } from "./comments.service";
import { ownTicket } from "./ticket-department.resolver";

const c = contract.comments;

// Un método por procedimiento, porque cada uno declara su propio permiso en el guard. El
// `commentsProcedures` de abajo hace que el compilador marque un procedimiento del contrato sin método.
@Controller()
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @RequirePermission(PERMISSIONS.TICKET_VIEW, ownTicket)
  @Implement(c.list)
  list() {
    return implement(c.list).handler(({ input }) => this.service.list(input.ticketId));
  }

  // Comentar es editar el ticket para el PRD §4.2, aunque no lo modifique: también con el ticket en
  // un estado de cierre (Q23).
  @RequirePermission(PERMISSIONS.TICKET_EDIT, ownTicket)
  @Implement(c.create)
  create(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.create).handler(({ input }) =>
      this.service.create(input.ticketId, input.texto, actor.id),
    );
  }

  // Solo el admin: un agente recibe 403, también sobre su propio comentario (Q32).
  @RequirePermission(PERMISSIONS.COMMENT_DELETE)
  @Implement(c.remove)
  remove(@CurrentUser() actor: AuthenticatedUser) {
    return implement(c.remove).handler(({ input }) =>
      this.service.remove(input.ticketId, input.comentarioId, actor.id),
    );
  }
}

// Cada procedimiento del contrato con el método que lo implementa. Si el contrato suma uno, o se
// renombra un método, el compilador lo marca acá.
export const commentsProcedures = {
  list: "list",
  create: "create",
  remove: "remove",
} satisfies Record<keyof typeof contract.comments, keyof CommentsController>;
