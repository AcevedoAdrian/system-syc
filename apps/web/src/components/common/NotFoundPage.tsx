import { Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

// Cualquier dirección que no existe (y `/estilos` en producción) cae acá.
export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
      <EmptyState
        title="Página no encontrada"
        description="La dirección que buscás no existe."
        action={
          <Button asChild variant="outline">
            <Link to="/tickets">Ir a los tickets</Link>
          </Button>
        }
      />
    </div>
  );
}
