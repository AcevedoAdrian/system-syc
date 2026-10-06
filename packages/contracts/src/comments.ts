import { oc } from "@orpc/contract";
import { z } from "zod";

// Un comentario es inmutable (Q32): no hay edición. Se recorta antes de validar, así que uno de solo
// espacios queda vacío y se rechaza.
export const comentarioTextoSchema = z.string().trim().min(1).max(2000);

export const ticketCommentsInputSchema = z.object({ ticketId: z.string() });
export const createCommentInputSchema = z.object({
  ticketId: z.string(),
  texto: comentarioTextoSchema,
});
export const removeCommentInputSchema = z.object({
  ticketId: z.string(),
  comentarioId: z.string(),
});

export const commentSchema = z.object({
  id: z.string(),
  texto: z.string(),
  autor: z.object({ id: z.string(), nombre: z.string() }), // `nombre` = name del usuario
  createdAt: z.iso.datetime(),
});

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;
export type Comment = z.infer<typeof commentSchema>;

export const commentsContract = {
  list: oc
    .route({ method: "GET", path: "/tickets/{ticketId}/comments" })
    .input(ticketCommentsInputSchema)
    .output(z.array(commentSchema)),
  create: oc
    .route({ method: "POST", path: "/tickets/{ticketId}/comments" })
    .input(createCommentInputSchema)
    .output(commentSchema),
  remove: oc
    .route({ method: "DELETE", path: "/tickets/{ticketId}/comments/{comentarioId}" })
    .input(removeCommentInputSchema)
    .output(z.void()),
};
