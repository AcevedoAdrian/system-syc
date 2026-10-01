import type { ChangePasswordInput } from "@syc/contracts";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

// La API cierra siempre las otras sesiones del usuario al cambiar la contraseña.
export function useChangePassword() {
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) => {
      let error: { code?: string } | null;
      try {
        ({ error } = await authClient.changePassword(input));
      } catch {
        throw new Error("No se pudo conectar con el servidor.");
      }
      if (error) {
        throw new Error(
          error.code === "INVALID_PASSWORD"
            ? "La contraseña actual es incorrecta."
            : "No se pudo cambiar la contraseña.",
        );
      }
    },
  });
}
