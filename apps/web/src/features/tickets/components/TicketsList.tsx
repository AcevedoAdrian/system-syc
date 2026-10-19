import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useTickets } from "../hooks/useTickets";
import { hasActiveFilters, type TicketsSearch } from "../tickets-search";
import { type FiltersChange, TicketsFilters } from "./TicketsFilters";
import { TicketsTable } from "./TicketsTable";

interface TicketsListProps {
  // Lo que dice la URL; la ruta lo valida (`ticketsSearchSchema`).
  filters: TicketsSearch;
  onFiltersChange: FiltersChange;
}

// Los avisos de la bandeja (cargando, error, sin resultados) van dentro de la tarjeta, bajo los filtros.
const noticeClass = "flex flex-col items-start gap-2 border-t px-5 py-8";

// La bandeja (SPEC 06): búsqueda, filtros y paginación, todo resuelto por la API para el alcance del
// usuario. La tabla solo muestra la página recibida; no ordena ni filtra en el navegador. El diseño
// es el de la etapa 9.4 del SPEC 09.
export function TicketsList({ filters, onFiltersChange }: TicketsListProps) {
  const { data: user } = useCurrentUser();
  const { data, isPending, isError, isPlaceholderData, isFetching, refetch } = useTickets(filters);
  const filtered = hasActiveFilters(filters);

  // La página 1 es la URL sin `page`. Cambiar de página conserva la búsqueda y los filtros.
  const pageSearch = (page: number): TicketsSearch => ({
    ...filters,
    page: page === 1 ? undefined : page,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const resumen = isPlaceholderData
    ? "Actualizando tickets…"
    : data
      ? data.total === 0
        ? "Sin resultados."
        : `${data.total} ${data.total === 1 ? "ticket encontrado" : "tickets encontrados"}, página ${data.page} de ${totalPages}.`
      : "";

  return (
    <section className="mx-auto flex w-full max-w-300 flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]">
            Tickets
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Seguimiento de solicitudes y su estado.
          </p>
        </div>
        <Button asChild className="h-10 px-5">
          <Link to="/tickets/nuevo">
            <Plus aria-hidden="true" />
            Nuevo ticket
          </Link>
        </Button>
      </header>

      {/* Siempre montada y solo para lectores de pantalla: al filtrar o paginar, lo visible cambia sin
          que nada se lo anuncie. */}
      <p role="status" className="sr-only">
        {resumen}
      </p>

      <section aria-label="Listado" className="overflow-hidden rounded-xl border bg-background">
        <TicketsFilters
          filters={filters}
          onChange={onFiltersChange}
          isAdmin={user?.role === "admin"}
        />

        {isPending && (
          <p role="status" className="border-t px-5 py-8 text-muted-foreground">
            Cargando tickets…
          </p>
        )}
        {isError && (
          <div role="alert" className={cn(noticeClass, "text-destructive")}>
            <p>No se pudieron cargar los tickets. Intentá de nuevo.</p>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )}

        {data && data.items.length === 0 && data.total > 0 && (
          // Una página posterior a la última (por ejemplo, desde un link viejo).
          <div className={noticeClass}>
            <p className="text-muted-foreground">Ningún ticket coincide con la búsqueda</p>
            <Button variant="link" className="px-0" asChild>
              <Link to="/tickets" search={pageSearch(1)}>
                Ir a la página 1
              </Link>
            </Button>
          </div>
        )}
        {data && data.total === 0 && filtered && (
          <div className={noticeClass}>
            <p className="text-muted-foreground">Ningún ticket coincide con la búsqueda</p>
            <Button variant="outline" onClick={() => onFiltersChange({})}>
              Limpiar filtros
            </Button>
          </div>
        )}
        {data && data.total === 0 && !filtered && (
          <p className="border-t px-5 py-8 text-muted-foreground">
            Todavía no hay tickets. Creá el primero con «Nuevo ticket».
          </p>
        )}

        {data && data.items.length > 0 && (
          <div className={cn(isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData}>
            <div className="border-t">
              <TicketsTable tickets={data.items} />
            </div>
            <nav
              aria-label="Paginación"
              className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground"
            >
              <p className="tabular-nums">
                Mostrando {(data.page - 1) * data.pageSize + 1}–
                {(data.page - 1) * data.pageSize + data.items.length} de {data.total} · Página{" "}
                {data.page} de {totalPages}
              </p>
              <div className="flex gap-2">
                {/* Enlaces reales (se pueden abrir en otra pestaña); donde no hay página, un botón
                    deshabilitado, porque un enlace no se puede deshabilitar. */}
                {data.page > 1 ? (
                  <Button variant="outline" className="h-10 px-5" asChild>
                    <Link to="/tickets" search={pageSearch(data.page - 1)}>
                      Anterior
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="h-10 px-5" disabled>
                    Anterior
                  </Button>
                )}
                {data.page < totalPages ? (
                  <Button variant="outline" className="h-10 px-5" asChild>
                    <Link to="/tickets" search={pageSearch(data.page + 1)}>
                      Siguiente
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="h-10 px-5" disabled>
                    Siguiente
                  </Button>
                )}
              </div>
            </nav>
          </div>
        )}
      </section>
    </section>
  );
}
