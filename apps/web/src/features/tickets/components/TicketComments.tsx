import { zodResolver } from "@hookform/resolvers/zod";
import { type Comment, comentarioTextoSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { getErrorMessage } from "@/lib/errors";
import { useCreateComment, useRemoveComment } from "../hooks/useCommentMutations";
import { useTicketComments } from "../hooks/useTicketComments";
import { formatTimestamp } from "../ticket-fields";

const commentFormSchema = z.object({ texto: comentarioTextoSchema });
type CommentForm = z.infer<typeof commentFormSchema>;

// Comentarios del ticket (SPEC 06, Feature 6.4): se leen como una conversación, del más antiguo al más
// reciente, con el formulario al final. Son inmutables: no hay editar, y solo el admin elimina (la API
// rechaza a un agente igual). Comentar no depende del formulario de datos: no toca el ticket.
export function TicketComments({ ticketId }: { ticketId: string }) {
  const { data: user } = useCurrentUser();
  const { data: comments, isPending, isError } = useTicketComments(ticketId);
  const create = useCreateComment();
  const remove = useRemoveComment();
  const [serverError, setServerError] = useState<string>();
  const [removing, setRemoving] = useState<Comment | null>(null);
  const [removeError, setRemoveError] = useState<string>();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CommentForm>({
    resolver: zodResolver(commentFormSchema),
    defaultValues: { texto: "" },
  });

  const submit = handleSubmit(async ({ texto }) => {
    setServerError(undefined);
    try {
      await create.mutateAsync({ ticketId, texto });
      reset();
    } catch (error) {
      // Lo escrito se conserva para poder reintentar.
      setServerError(getErrorMessage(error));
    }
  });

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveError(undefined);
    try {
      await remove.mutateAsync({ ticketId, comentarioId: removing.id });
    } catch (error) {
      setRemoveError(getErrorMessage(error));
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <section aria-labelledby="comentarios-titulo" className="flex max-w-2xl flex-col gap-3">
      <h2 id="comentarios-titulo" className="text-lg font-semibold">
        Comentarios
      </h2>

      {isPending && <p className="text-sm text-muted-foreground">Cargando comentarios…</p>}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar los comentarios.
        </p>
      )}
      {comments && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>
      )}
      {comments && comments.length > 0 && (
        <ol className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-muted-foreground">
                  {comment.autor.nombre} · {formatTimestamp(comment.createdAt)}
                </p>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(comment)}>
                    Eliminar
                  </Button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{comment.texto}</p>
            </li>
          ))}
        </ol>
      )}
      {removeError && (
        <p role="alert" className="text-sm text-destructive">
          {removeError}
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <Label htmlFor="comentario-texto" className="sr-only">
          Nuevo comentario
        </Label>
        <Textarea
          id="comentario-texto"
          placeholder="Escribí un comentario"
          aria-invalid={errors.texto ? true : undefined}
          {...register("texto")}
        />
        {errors.texto && (
          <p className="text-sm text-destructive">
            El comentario es obligatorio (hasta 2000 caracteres).
          </p>
        )}
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            Comentar
          </Button>
        </div>
      </form>

      {isAdmin && (
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title="Eliminar comentario"
          description="El comentario deja de verse en el ticket y no se puede recuperar desde la aplicación. En el historial queda anotado que se eliminó, sin su texto."
          confirmLabel="Eliminar"
          onConfirm={confirmRemove}
        />
      )}
    </section>
  );
}
