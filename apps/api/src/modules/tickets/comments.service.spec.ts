import { ORPCError } from "@orpc/server";
import type { Comment } from "@syc/contracts";
import { describe, expect, it, vi } from "vitest";
import type { CommentsRepository } from "./comments.repository";
import { CommentsService } from "./comments.service";
import type { TicketsRepository } from "./tickets.repository";

interface StoredComment {
  id: string;
  ticketId: string;
  texto: string;
  deleted: boolean;
}

// Repositories en memoria. El de comentarios imita lo que hace el real: eliminar exige que el
// comentario sea de ese ticket y no esté eliminado, y si no, 404. El de tickets solo deja leer el
// departamento (`findDepartmentId`); las escrituras son espías para comprobar que comentar no las usa.
function buildService({ tickets = ["t-1"] }: { tickets?: string[] } = {}) {
  const comments: StoredComment[] = [];
  let seq = 0;

  const commentsRepository = {
    findByTicket: vi.fn(
      async (ticketId: string): Promise<Comment[]> =>
        comments
          .filter((c) => c.ticketId === ticketId && !c.deleted)
          .map((c) => ({
            id: c.id,
            texto: c.texto,
            autor: { id: "ana", nombre: "Ana" },
            createdAt: "2026-10-06T10:00:00.000Z",
          })),
    ),
    create: vi.fn(async (ticketId: string, texto: string): Promise<Comment> => {
      const stored = { id: `c-${++seq}`, ticketId, texto, deleted: false };
      comments.push(stored);
      return {
        id: stored.id,
        texto,
        autor: { id: "ana", nombre: "Ana" },
        createdAt: "2026-10-06T10:00:00.000Z",
      };
    }),
    softDelete: vi.fn(async (ticketId: string, comentarioId: string): Promise<void> => {
      const found = comments.find(
        (c) => c.id === comentarioId && c.ticketId === ticketId && !c.deleted,
      );
      if (!found) throw new ORPCError("NOT_FOUND", { message: "El comentario no existe" });
      found.deleted = true;
    }),
  };

  const ticketWrites = {
    create: vi.fn(),
    update: vi.fn(),
    changeStatus: vi.fn(),
    changeDepartment: vi.fn(),
    softDelete: vi.fn(),
  };
  const ticketsRepository = {
    ...ticketWrites,
    findDepartmentId: vi.fn(async (id: string) => (tickets.includes(id) ? "tec" : null)),
  };

  const service = new CommentsService(
    commentsRepository as unknown as CommentsRepository,
    ticketsRepository as unknown as TicketsRepository,
  );
  return { service, comments, commentsRepository, ticketWrites };
}

const notFound = (message: string) =>
  expect.objectContaining({ code: "NOT_FOUND", message }) as unknown;

describe("CommentsService", () => {
  describe("list y create", () => {
    it("comenta y devuelve el comentario en la lista", async () => {
      const { service } = buildService();

      const created = await service.create("t-1", "Llamé al proveedor", "ana");

      expect(created.texto).toBe("Llamé al proveedor");
      expect(await service.list("t-1")).toEqual([created]);
    });

    it("responde 404 si el ticket no existe o está eliminado", async () => {
      const { service, commentsRepository } = buildService({ tickets: [] });

      await expect(service.list("t-1")).rejects.toEqual(notFound("El ticket no existe"));
      await expect(service.create("t-1", "hola", "ana")).rejects.toEqual(
        notFound("El ticket no existe"),
      );
      expect(commentsRepository.create).not.toHaveBeenCalled();
    });

    it("no llama a ninguna escritura de Ticket al comentar", async () => {
      const { service, ticketWrites } = buildService();

      await service.create("t-1", "hola", "ana");

      for (const write of Object.values(ticketWrites)) expect(write).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("elimina el comentario y deja de salir en la lista", async () => {
      const { service } = buildService();
      const { id } = await service.create("t-1", "hola", "ana");

      await service.remove("t-1", id, "admin-1");

      expect(await service.list("t-1")).toEqual([]);
    });

    it("responde 404 al eliminar dos veces", async () => {
      const { service } = buildService();
      const { id } = await service.create("t-1", "hola", "ana");
      await service.remove("t-1", id, "admin-1");

      await expect(service.remove("t-1", id, "admin-1")).rejects.toEqual(
        notFound("El comentario no existe"),
      );
    });

    it("responde 404 si el comentario es de otro ticket", async () => {
      const { service } = buildService({ tickets: ["t-1", "t-2"] });
      const { id } = await service.create("t-1", "hola", "ana");

      await expect(service.remove("t-2", id, "admin-1")).rejects.toEqual(
        notFound("El comentario no existe"),
      );
      expect(await service.list("t-1")).toHaveLength(1);
    });

    it("responde 404 con un comentario inexistente", async () => {
      const { service } = buildService();

      await expect(service.remove("t-1", "no-existe", "admin-1")).rejects.toEqual(
        notFound("El comentario no existe"),
      );
    });
  });
});
