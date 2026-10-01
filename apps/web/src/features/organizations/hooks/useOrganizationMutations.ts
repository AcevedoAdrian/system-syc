import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateDirectory } from "@/lib/invalidate-directory";
import { orpc } from "@/lib/orpc-client";

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.organizations.create.mutationOptions({
      onSuccess: () => invalidateDirectory(queryClient),
    }),
  );
}

export function useRenameOrganization() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.organizations.rename.mutationOptions({
      onSuccess: () => invalidateDirectory(queryClient),
    }),
  );
}

export function useSetOrganizationActive() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.organizations.setActive.mutationOptions({
      onSuccess: () => invalidateDirectory(queryClient),
    }),
  );
}

export function useRemoveOrganization() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.organizations.remove.mutationOptions({
      onSuccess: () => invalidateDirectory(queryClient),
    }),
  );
}
