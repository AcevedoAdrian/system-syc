import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export function useTicketHistory(ticketId: string) {
  return useQuery(orpc.tickets.history.queryOptions({ input: { ticketId } }));
}
