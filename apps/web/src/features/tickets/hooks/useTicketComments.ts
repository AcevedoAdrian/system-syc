import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

// Los comentarios no eliminados del ticket, del más antiguo al más reciente (el orden lo manda la API).
export function useTicketComments(ticketId: string) {
  return useQuery(orpc.comments.list.queryOptions({ input: { ticketId } }));
}
