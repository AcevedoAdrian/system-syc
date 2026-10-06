import { useQuery } from "@tanstack/react-query";
import { isNotFound, isUnauthorized } from "@/lib/errors";
import { orpc } from "@/lib/orpc-client";

// Un 404 (ticket de otro departamento, inexistente o eliminado) no se reintenta: reintentarlo solo
// demora el "El ticket no existe".
export function useTicket(ticketId: string) {
  return useQuery({
    ...orpc.tickets.get.queryOptions({ input: { ticketId } }),
    retry: (failureCount, error) =>
      !isUnauthorized(error) && !isNotFound(error) && failureCount < 3,
  });
}
