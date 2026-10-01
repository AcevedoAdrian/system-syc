import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

export function useOrganizations() {
  return useQuery(orpc.organizations.list.queryOptions());
}
