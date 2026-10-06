import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

// Comentar o eliminar un comentario refresca sus comentarios, el historial del ticket (queda una
// entrada) y la bandeja (la búsqueda incluye los comentarios). No toca el ticket: no cambió, y volver
// a leerlo no aporta nada (comentar no modifica su `updatedAt`).
function invalidateAfterComment(queryClient: QueryClient, { ticketId }: { ticketId: string }) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.comments.list.key({ input: { ticketId } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.tickets.history.key({ input: { ticketId } }) }),
    queryClient.invalidateQueries({ queryKey: orpc.tickets.list.key() }),
  ]);
}

// `onSuccess` devuelve la promesa: la mutación termina cuando los comentarios ya se volvieron a leer,
// así que quien la espera ve el comentario nuevo en la lista.
export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: (_comment, variables) => invalidateAfterComment(queryClient, variables),
    }),
  );
}

export function useRemoveComment() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.comments.remove.mutationOptions({
      onSuccess: (_result, variables) => invalidateAfterComment(queryClient, variables),
    }),
  );
}
