import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Comment } from "@syc/contracts";
import { CommentsRepository } from "./comments.repository";
import { TicketsRepository } from "./tickets.repository";

@Injectable()
export class CommentsService {
  constructor(
    private readonly repository: CommentsRepository,
    private readonly tickets: TicketsRepository,
  ) {}

  // El guard ya acota a un agente a su departamento (404 si es ajeno); acá solo falta el caso del
  // admin, para quien un ticket inexistente o eliminado también es 404.
  async list(ticketId: string): Promise<Comment[]> {
    await this.assertTicketExists(ticketId);
    return this.repository.findByTicket(ticketId);
  }

  async create(ticketId: string, texto: string, actorId: string): Promise<Comment> {
    await this.assertTicketExists(ticketId);
    return this.repository.create(ticketId, texto, actorId);
  }

  // Que el comentario sea de ese ticket, y que ninguno de los dos esté eliminado, lo exige el
  // repository en la propia escritura.
  async remove(ticketId: string, comentarioId: string, actorId: string): Promise<void> {
    await this.repository.softDelete(ticketId, comentarioId, actorId);
  }

  private async assertTicketExists(ticketId: string): Promise<void> {
    if ((await this.tickets.findDepartmentId(ticketId)) === null) {
      throw new ORPCError("NOT_FOUND", { message: "El ticket no existe" });
    }
  }
}
