import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

// La lista mínima de SPEC 05 (los 50 más recientes del alcance del usuario). SPEC 06 la reemplaza
// por la bandeja con filtros.
export function useTickets() {
  return useQuery(orpc.tickets.list.queryOptions());
}
