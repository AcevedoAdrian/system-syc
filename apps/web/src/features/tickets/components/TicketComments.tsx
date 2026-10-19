import { zodResolver } from "@hookform/resolvers/zod";
import { type Comment, comentarioTextoSchema } from "@syc/contracts";
import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormSection } from "@/components/common/FormSection";
import { initialsOf } from "@/components/layout/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { getErrorMessage } from "@/lib/errors";
import { useCreateComment, useRemoveComment } from "../hooks/useCommentMutations";
import { useTicketComments } from "../hooks/useTicketComments";
import { formatTimestamp } from "../ticket-fields";
import { Field, textareaClass } from "./Field";

const commentFormSchema = z.object({ texto: comentarioTextoSchema });
type CommentForm = z.infer<typeof commentFormSchema>;

const emptyClass = "rounded-lg border border-dashed px-6 py-6 text-center text-muted-foreground";

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
    watch,
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
    <FormSection
      id="comentarios-titulo"
      tone="blue"
      icon={MessageSquare}
      title="Comentarios"
      description="Notas sobre el ticket, de la más antigua a la más reciente. No se pueden editar."
    >
      {isPending && <p className="text-muted-foreground">Cargando comentarios…</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          No se pudieron cargar los comentarios.
        </p>
      )}
      {comments && comments.length === 0 && (
        <p className={emptyClass}>Todavía no hay comentarios.</p>
      )}
      {comments && comments.length > 0 && (
        <ol className="flex flex-col gap-5">
          {comments.map((comment) => (
            <li key={comment.id} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="form-section-icon rounded-full text-[13px] font-medium"
              >
                {initialsOf(comment.autor.nombre)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border bg-background px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">{comment.autor.nombre}</span> ·{" "}
                    <time dateTime={comment.createdAt}>{formatTimestamp(comment.createdAt)}</time>
                  </p>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Eliminar comentario de ${comment.autor.nombre}`}
                      onClick={() => setRemoving(comment)}
                    >
                      Eliminar
                    </Button>
                  )}
                </div>
                <p className="wrap-break-word whitespace-pre-wrap text-body">{comment.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {removeError && (
        <p role="alert" className="text-destructive">
          {removeError}
        </p>
      )}

      <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t pt-6">
        <Field
          id="comentario-texto"
          label="Nuevo comentario"
          icon={MessageSquare}
          counter={{ value: (watch("texto") ?? "").length, max: 2000 }}
          error={errors.texto && "El comentario es obligatorio (hasta 2000 caracteres)."}
        >
          {(aria) => (
            <Textarea
              id="comentario-texto"
              placeholder="Escribí un comentario…"
              className={`${textareaClass} min-h-22`}
              {...aria}
              {...register("texto")}
            />
          )}
        </Field>
        {serverError && (
          <p role="alert" className="text-destructive">
            {serverError}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" className="h-10 px-5" disabled={isSubmitting}>
            {isSubmitting ? "Comentando…" : "Comentar"}
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
    </FormSection>
  );
}
