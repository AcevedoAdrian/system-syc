import type { CatalogRuta } from "@syc/contracts";
import { useQuery } from "@tanstack/react-query";
import { catalogApi } from "./catalog-api";

// Todo `list`: activos e inactivos, en el orden de la pantalla. Lo usan la administración y los
// filtros de la bandeja (SPEC 06).
export function useCatalog(ruta: CatalogRuta) {
  return useQuery(catalogApi(ruta).list.queryOptions());
}
