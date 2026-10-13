import type { CatalogRuta } from "@syc/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogApi } from "./catalog-api";

// Las mutaciones de un catálogo. Cada una invalida la query de ese catálogo; las de Tipos de área
// también la de Áreas, que muestra el nombre del tipo (SPEC 08).
export function useCatalogMutations(ruta: CatalogRuta) {
  const queryClient = useQueryClient();
  const api = catalogApi(ruta);
  const onSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: api.key() });
    if (ruta === "tiposArea") {
      await queryClient.invalidateQueries({ queryKey: catalogApi("areas").key() });
    }
  };

  return {
    create: useMutation(api.create.mutationOptions({ onSuccess })),
    update: useMutation(api.update.mutationOptions({ onSuccess })),
    move: useMutation(api.move.mutationOptions({ onSuccess })),
    setActive: useMutation(api.setActive.mutationOptions({ onSuccess })),
    remove: useMutation(api.remove.mutationOptions({ onSuccess })),
  };
}
