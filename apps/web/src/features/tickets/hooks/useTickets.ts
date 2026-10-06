import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";
import type { TicketsSearch } from "../tickets-search";

// Una página de la bandeja: filtros, búsqueda y página los resuelve la API (SPEC 06). Mientras llega la
// siguiente se sigue mostrando la anterior, sin parpadeo.
export function useTickets(filters: TicketsSearch) {
  return useQuery({
    ...orpc.tickets.list.queryOptions({ input: filters }),
    placeholderData: keepPreviousData,
  });
}
