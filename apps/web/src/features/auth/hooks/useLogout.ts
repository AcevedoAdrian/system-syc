import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => authClient.signOut(),
    // Aunque falle la llamada, se limpia la sesión en memoria: lo peor es una cookie que vence sola.
    onSettled: async () => {
      queryClient.clear();
      await router.navigate({ to: "/login" });
    },
  });
}
