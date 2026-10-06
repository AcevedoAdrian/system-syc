import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

// Cualquier cambio refresca el ticket, su historial y la lista: son todas las queries de `tickets`.
function useInvalidateTickets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
}

export function useCreateTicket() {
  return useMutation(orpc.tickets.create.mutationOptions({ onSuccess: useInvalidateTickets() }));
}

export function useUpdateTicket() {
  return useMutation(orpc.tickets.update.mutationOptions({ onSuccess: useInvalidateTickets() }));
}

export function useChangeTicketStatus() {
  return useMutation(
    orpc.tickets.changeStatus.mutationOptions({ onSuccess: useInvalidateTickets() }),
  );
}

export function useChangeTicketDepartment() {
  return useMutation(
    orpc.tickets.changeDepartment.mutationOptions({ onSuccess: useInvalidateTickets() }),
  );
}

// Solo la lista, y sin esperar: volver a pedir el ticket que se acaba de eliminar da 404 y la pantalla
// mostraría "El ticket no existe" un instante antes de volver a la lista.
export function useRemoveTicket() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.tickets.remove.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: orpc.tickets.list.key() });
      },
    }),
  );
}
