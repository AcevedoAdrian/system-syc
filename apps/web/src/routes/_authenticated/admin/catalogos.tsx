import { catalogRutaSchema } from "@syc/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CatalogsAdmin } from "@/features/catalogs/components/CatalogsAdmin";

// La pestaña activa vive en `?catalogo=`: así sobrevive a un reload. Un valor desconocido cae en
// la primera pestaña.
export const Route = createFileRoute("/_authenticated/admin/catalogos")({
  validateSearch: z.object({ catalogo: catalogRutaSchema.optional().catch(undefined) }),
  component: CatalogosPage,
});

function CatalogosPage() {
  const { catalogo = "areas" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CatalogsAdmin
      ruta={catalogo}
      onRutaChange={(ruta) => navigate({ search: { catalogo: ruta } })}
    />
  );
}
