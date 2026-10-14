import { notFound } from "@tanstack/react-router";

// La galería de la base visual (SPEC 09) solo existe en desarrollo: en el build de producción la ruta
// responde «no encontrado». `import.meta.env.PROD` lo reemplaza Vite al construir.
export function assertGalleryAvailable(): void {
  if (import.meta.env.PROD) throw notFound();
}
