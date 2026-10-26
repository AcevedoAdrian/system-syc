import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Comment } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CommentsRepository } from "./comments.repository";
import { TicketsRepository } from "./tickets.repository";
import { scopeOf } from "./tickets.service";

@Injectable()
export class CommentsService {
  constructor(
    private readonly repository: CommentsRepository,
    private readonly tickets: TicketsRepository,
  ) {}

  // La barrera que manda: el guard ya acota a un agente a su departamento, pero el service lo vuelve a
  // exigir con el id que de verdad va a usar.
  async list(ticketId: string, actor: AuthenticatedUser): Promise<Comment[]> {
    await this.assertTicketInScope(ticketId, actor);
    return this.repository.findByTicket(ticketId);
  }

  async create(ticketId: string, texto: string, actor: AuthenticatedUser): Promise<Comment> {
    await this.assertTicketInScope(ticketId, actor);
    return this.repository.create(ticketId, texto, actor.id);
  }

  // Que el comentario sea de ese ticket, y que ninguno de los dos esté eliminado, lo exige el
  // repository en la propia escritura.
  async remove(ticketId: string, comentarioId: string, actorId: string): Promise<void> {
    await this.repository.softDelete(ticketId, comentarioId, actorId);
  }

  // Inexistente, eliminado o de otro departamento (si quien pide es un agente): el mismo 404.
  private async assertTicketInScope(ticketId: string, actor: AuthenticatedUser): Promise<void> {
    const { departmentId } = scopeOf(actor);
    const ticketDepartmentId = await this.tickets.findDepartmentId(ticketId);
    if (
      ticketDepartmentId === null ||
      (departmentId !== null && ticketDepartmentId !== departmentId)
    ) {
      throw new ORPCError("NOT_FOUND", { message: "El ticket no existe" });
    }
  }
}
