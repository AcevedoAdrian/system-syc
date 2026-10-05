import type { CatalogRuta } from "@syc/contracts";
import { useQuery } from "@tanstack/react-query";
import { type CatalogEntry, catalogApi } from "./catalog-api";

// Solo los activos, en el mismo orden que `useCatalog`: son los que se pueden elegir en los
// selectores de los formularios (SPEC 05). Un ticket que ya eligió un ítem desactivado lo sigue
// mostrando, porque lo lee de `useCatalog`.
export function useCatalogOptions(ruta: CatalogRuta) {
  return useQuery({
    ...catalogApi(ruta).list.queryOptions(),
    select: (items: CatalogEntry[]) => items.filter((item) => item.activo),
  });
}
