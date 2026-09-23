import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export function useHealth() {
  return useQuery(orpc.health.check.queryOptions());
}
