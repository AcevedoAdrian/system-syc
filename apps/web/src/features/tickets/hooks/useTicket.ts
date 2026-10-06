import { useQuery } from "@tanstack/react-query";
import { isNotFound, isUnauthorized } from "@/lib/errors";
import { orpc } from "@/lib/orpc-client";

// Un 404 (ticket de otro departamento, inexistente o eliminado) no se reintenta: reintentarlo solo
// demora el "El ticket no existe".
//
// Sin refresco al volver a la ventana: el formulario de edición parte de la versión (`updatedAt`) que
// leyó. Si otro usuario modifica el ticket, quien está editando se entera al guardar (409 con
// "Recargar"), no por un refresco que le borre lo que escribió.
export function useTicket(ticketId: string) {
  return useQuery({
    ...orpc.tickets.get.queryOptions({ input: { ticketId } }),
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      !isUnauthorized(error) && !isNotFound(error) && failureCount < 3,
  });
}
