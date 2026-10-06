import { createFileRoute } from "@tanstack/react-router";
import { TicketsList } from "@/features/tickets/components/TicketsList";
import { ticketsSearchSchema } from "@/features/tickets/tickets-search";

// La búsqueda, los filtros y la página viven en la URL: recargar o compartir el link muestra lo mismo.
export const Route = createFileRoute("/_authenticated/tickets/")({
  validateSearch: ticketsSearchSchema,
  component: TicketsPage,
});

function TicketsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <TicketsList
      filters={search}
      onFiltersChange={(next, { replace } = {}) => navigate({ search: next, replace })}
    />
  );
}
