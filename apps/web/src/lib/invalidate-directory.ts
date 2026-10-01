import type { QueryClient } from "@tanstack/react-query";
import { orpc } from "./orpc-client";

// Usuarios y departamentos se muestran cruzados (departamento de cada usuario, cantidad de agentes
// de cada departamento): después de cualquier cambio se refrescan los dos listados.
export function invalidateDirectory(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.users.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.organizations.key() }),
  ]);
}
