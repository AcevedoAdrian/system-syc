import type { CatalogRuta } from "@syc/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./catalog-api";

// Las mutaciones de un catálogo. Cada una invalida solo la query de ese catálogo.
export function useCatalogMutations(ruta: CatalogRuta) {
  const queryClient = useQueryClient();
  const api = catalogApi(ruta);
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: api.key() });

  return {
    create: useMutation(api.create.mutationOptions({ onSuccess })),
    update: useMutation(api.update.mutationOptions({ onSuccess })),
    move: useMutation(api.move.mutationOptions({ onSuccess })),
    setActive: useMutation(api.setActive.mutationOptions({ onSuccess })),
    remove: useMutation(api.remove.mutationOptions({ onSuccess })),
  };
}
