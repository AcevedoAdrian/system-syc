import { createFileRoute } from "@tanstack/react-router";
import { StyleGallery } from "@/features/estilos/components/StyleGallery";
import { assertGalleryAvailable } from "@/features/estilos/gallery-access";

// Galería de la base visual (SPEC 09): solo en desarrollo y sin link en el menú.
export const Route = createFileRoute("/_authenticated/estilos")({
  beforeLoad: assertGalleryAvailable,
  component: StyleGallery,
});
