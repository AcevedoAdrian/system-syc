import type { LoginInput } from "@syc/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/orpc-client";
import { LoginError, type LoginFailure } from "../login-error";
import { currentUserQueryKey } from "../session";

function failureFromStatus(status: number): LoginFailure {
  if (status === 429) return "rate-limited";
  if (status === 403) return "disabled";
  if (status >= 500 || status === 0) return "unreachable";
  return "invalid"; // mensaje genérico: no revela si el usuario existe
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      let error: { status: number } | null;
      try {
        ({ error } = await authClient.signIn.username(input));
      } catch {
        throw new LoginError("unreachable");
      }
      if (error) throw new LoginError(failureFromStatus(error.status));
      return client.users.me();
    },
    onSuccess: (user) => queryClient.setQueryData(currentUserQueryKey, user),
  });
}
