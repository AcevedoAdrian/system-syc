import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LoginLayout } from "@/features/auth/components/LoginLayout";

// Pantalla de cualquier error que nadie más capturó (SPEC 09, 9.7), por ejemplo la API caída al entrar:
// `defaultErrorComponent` del router. Usa el marco del login, como `NotFound`, para verse igual con o sin
// sesión. No muestra `error.message`: puede traer detalles de la red o del servidor.
// «Reintentar» invalida el router (vuelve a correr `beforeLoad` y los loaders, donde se pidió la sesión)
// y reinicia el límite de error; «Ir al inicio» lleva a `/`, que redirige a la bandeja o al login.
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <LoginLayout>
      <section role="alert" className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]">
            Algo salió mal
          </h1>
          <p className="text-base text-muted-foreground">
            No pudimos mostrar esta pantalla. Si el problema sigue, avisá a quien administra el
            sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            className="h-10 px-5"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
          >
            Reintentar
          </Button>
          <Button asChild variant="outline" className="h-10 px-5">
            <Link to="/">Ir al inicio</Link>
          </Button>
        </div>
      </section>
    </LoginLayout>
  );
}
