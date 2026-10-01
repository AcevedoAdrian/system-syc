import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

const ONE_MINUTE = 60_000;

export function useCurrentUser() {
  return useQuery({ ...orpc.users.me.queryOptions(), staleTime: ONE_MINUTE });
}
