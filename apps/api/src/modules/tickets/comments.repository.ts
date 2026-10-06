import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { Comment } from "@syc/contracts";
import { getPrismaClient } from "@syc/db";
import { notDeleted, softDeleteData } from "../../common/soft-delete";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { writeAuditEntry } from "../audit/audit.repository";

// Se audita como entrada del ticket (así sale en su historial) y nunca con el texto (SPEC 06, 6.1).
const ENTITY_TYPE = "Ticket";

const commentSelect = {
  id: true,
  texto: true,
  autor: { select: { id: true, name: true } },
  createdAt: true,
} as const;

interface DbComment {
  id: string;
  texto: string;
  autor: { id: string; name: string };
  createdAt: Date;
}

const toComment = (row: DbComment): Comment => ({
  id: row.id,
  texto: row.texto,
  autor: { id: row.autor.id, nombre: row.autor.name },
  createdAt: row.createdAt.toISOString(),
});

// Única capa que toca `TicketComentario`. Nunca escribe en `Ticket`: comentar no cambia su `updatedAt`
// ni su `updatedBy`, para que quien edita el formulario no reciba un 409 por un comentario ajeno.
@Injectable()
export class CommentsRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  // No eliminados, del más antiguo al más reciente.
  async findByTicket(ticketId: string): Promise<Comment[]> {
    const rows = await this.db.ticketComentario.findMany({
      where: { ticketId, ...notDeleted },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: commentSelect,
    });
    return rows.map(toComment);
  }

  // El alta y su `AuditLog` van en la misma transacción.
  async create(ticketId: string, texto: string, actorId: string): Promise<Comment> {
    return this.db.$transaction(async (tx) => {
      const created = await tx.ticketComentario.create({
        data: { ticketId, texto, createdBy: actorId, updatedBy: actorId },
        select: commentSelect,
      });
      await writeAuditEntry(tx, {
        entityType: ENTITY_TYPE,
        entityId: ticketId,
        action: "comment_create",
        actorId,
        payload: { comentarioId: created.id },
      });
      return toComment(created);
    });
  }

  // Eliminación lógica. Un comentario inexistente, ya eliminado, de otro ticket o de un ticket
  // eliminado no se toca: 404, también si otro lo eliminó entre la lectura y esta escritura.
  async softDelete(ticketId: string, comentarioId: string, actorId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.ticketComentario.updateMany({
        where: { id: comentarioId, ticketId, ...notDeleted, ticket: notDeleted },
        data: softDeleteData(actorId),
      });
      if (count === 0) throw new ORPCError("NOT_FOUND", { message: "El comentario no existe" });
      await writeAuditEntry(tx, {
        entityType: ENTITY_TYPE,
        entityId: ticketId,
        action: "comment_delete",
        actorId,
        payload: { comentarioId },
      });
    });
  }
}
