import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useTickets } from "../hooks/useTickets";
import { TicketsTable } from "./TicketsTable";

// La API devuelve como máximo los 50 más recientes (`TicketsService`).
const RECENT_LIMIT = 50;

// Lista mínima de SPEC 05: los 50 más recientes del alcance del usuario, sin filtros ni paginación.
// La bandeja completa (SPEC 06) la reemplaza.
export function TicketsList() {
  const { data, isPending, isError } = useTickets();
  const tickets = data?.items;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Button asChild>
          <Link to="/tickets/nuevo">Nuevo ticket</Link>
        </Button>
      </header>
      {isPending && <p>Cargando tickets…</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          No se pudieron cargar los tickets. Intentá de nuevo.
        </p>
      )}
      {tickets && tickets.length === 0 && (
        <p className="text-muted-foreground">
          Todavía no hay tickets. Creá el primero con «Nuevo ticket».
        </p>
      )}
      {tickets && tickets.length > 0 && (
        <>
          <TicketsTable tickets={tickets} />
          {tickets.length >= RECENT_LIMIT && (
            <p className="text-sm text-muted-foreground">
              Se muestran los {RECENT_LIMIT} más recientes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
