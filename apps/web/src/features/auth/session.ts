import type { User } from "@syc/contracts";
import { isUnauthorized } from "@/lib/errors";
import { client, orpc } from "@/lib/orpc-client";
import { queryClient } from "@/lib/query-client";

export const currentUserQueryKey = orpc.users.me.queryKey();

// Guarda de sesión de las rutas `_authenticated/*`. Devuelve el usuario con su rol y departamento
// (`users.me`), o `null` sin sesión. Reutiliza lo ya cargado; el resto de las lecturas pasan por
// `useCurrentUser`. Llama al cliente directo (no por el caché) para que un 401 lo resuelva la
// propia guarda, con el destino de vuelta, y no el manejador global.
export async function getCurrentUser(): Promise<User | null> {
  const cached = queryClient.getQueryData<User>(currentUserQueryKey);
  if (cached) return cached;
  try {
    const user = await client.users.me();
    queryClient.setQueryData(currentUserQueryKey, user);
    return user;
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
}
