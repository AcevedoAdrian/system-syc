import { Link, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LoginLayout } from "@/features/auth/components/LoginLayout";

// Pantalla de cualquier dirección que no existe (SPEC 09, 9.7). Usa el marco del login para verse igual
// con o sin sesión, y no revela nada de la aplicación. «Ir al inicio» lleva a `/`, que redirige a la
// bandeja (o al login, si no hay sesión).
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <LoginLayout>
      <section className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]">
            Página no encontrada
          </h1>
          <p className="text-base text-muted-foreground">
            La dirección{" "}
            <code className="font-mono text-sm break-all text-foreground">{pathname}</code> no
            existe.
          </p>
        </div>
        <div>
          <Button asChild className="h-10 px-5">
            <Link to="/">Ir al inicio</Link>
          </Button>
        </div>
      </section>
    </LoginLayout>
  );
}
