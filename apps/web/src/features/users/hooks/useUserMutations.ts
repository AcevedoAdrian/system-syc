import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateDirectory } from "@/lib/invalidate-directory";
import { orpc } from "@/lib/orpc-client";

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.users.create.mutationOptions({ onSuccess: () => invalidateDirectory(queryClient) }),
  );
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.users.update.mutationOptions({ onSuccess: () => invalidateDirectory(queryClient) }),
  );
}

export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.users.setActive.mutationOptions({ onSuccess: () => invalidateDirectory(queryClient) }),
  );
}

export function useResetUserPassword() {
  return useMutation(orpc.users.resetPassword.mutationOptions());
}
