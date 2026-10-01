import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export function useUsers() {
  return useQuery(orpc.users.list.queryOptions());
}
