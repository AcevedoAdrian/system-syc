import { catalogRutaSchema } from "@syc/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogsAdmin } from "@/features/catalogs/components/CatalogsAdmin";

// El catálogo abierto vive en `?catalogo=` (lo elige el menú lateral): así sobrevive a un reload. Un
// valor desconocido cae en el primero.
export const Route = createFileRoute("/_authenticated/admin/catalogos")({
  validateSearch: z.object({ catalogo: catalogRutaSchema.optional().catch(undefined) }),
  component: CatalogosPage,
});

function CatalogosPage() {
  const { catalogo = "areas" } = Route.useSearch();
  return <CatalogsAdmin ruta={catalogo} />;
}
