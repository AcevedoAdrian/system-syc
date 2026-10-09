import { Link } from "@tanstack/react-router";
import { cn } from "cn";
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

// La bandeja (SPEC 06): búsqueda, filtros y paginación, todo resuelto por la API para el alcance del
// usuario. La tabla solo muestra la página recibida; no ordena ni filtra en el navegador.
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
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Button asChild>
          <Link to="/tickets/nuevo">Nuevo ticket</Link>
        </Button>
      </header>

      <TicketsFilters
        filters={filters}
        onChange={onFiltersChange}
        isAdmin={user?.role === "admin"}
      />

      {/* Siempre montada y solo para lectores de pantalla: al filtrar o paginar, lo visible cambia sin
          que nada se lo anuncie. */}
      <p role="status" className="sr-only">
        {resumen}
      </p>

      {isPending && <p role="status">Cargando tickets…</p>}
      {isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
          <p>No se pudieron cargar los tickets. Intentá de nuevo.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Reintentando…" : "Reintentar"}
          </Button>
        </div>
      )}

      {data && data.items.length === 0 && data.total > 0 && (
        // Una página posterior a la última (por ejemplo, desde un link viejo).
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground">Ningún ticket coincide con la búsqueda</p>
          <Button variant="link" className="px-0" asChild>
            <Link to="/tickets" search={pageSearch(1)}>
              Ir a la página 1
            </Link>
          </Button>
        </div>
      )}
      {data && data.total === 0 && filtered && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground">Ningún ticket coincide con la búsqueda</p>
          <Button variant="outline" onClick={() => onFiltersChange({})}>
            Limpiar filtros
          </Button>
        </div>
      )}
      {data && data.total === 0 && !filtered && (
        <p className="text-muted-foreground">
          Todavía no hay tickets. Creá el primero con «Nuevo ticket».
        </p>
      )}

      {data && data.items.length > 0 && (
        <div
          className={cn("flex flex-col gap-3", isPlaceholderData && "opacity-60")}
          aria-busy={isPlaceholderData}
        >
          <TicketsTable tickets={data.items} />
          <nav aria-label="Paginación" className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground tabular-nums">
              Página {data.page} de {totalPages} · {data.total}{" "}
              {data.total === 1 ? "ticket" : "tickets"}
            </p>
            <div className="flex gap-2">
              {/* Enlaces reales (se pueden abrir en otra pestaña); donde no hay página, un botón
                  deshabilitado, porque un enlace no se puede deshabilitar. */}
              {data.page > 1 ? (
                <Button variant="outline" asChild>
                  <Link to="/tickets" search={pageSearch(data.page - 1)}>
                    Anterior
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Anterior
                </Button>
              )}
              {data.page < totalPages ? (
                <Button variant="outline" asChild>
                  <Link to="/tickets" search={pageSearch(data.page + 1)}>
                    Siguiente
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Siguiente
                </Button>
              )}
            </div>
          </nav>
        </div>
      )}
    </section>
  );
}
