import { formatTicketNumber } from "@syc/contracts";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { isNotFound } from "@/lib/errors";
import { useTicket } from "../hooks/useTicket";
import { formatDay } from "../ticket-format";

// Detalle mínimo, de transición: adonde navega el alta. La pantalla completa del ticket (formulario
// de edición, cambio de estado, historial) la reemplaza en el paso siguiente del plan de SPEC 05.
export function TicketSummaryView({ ticketId }: { ticketId: string }) {
  const { data: ticket, isPending, isError, error } = useTicket(ticketId);

  if (isPending) return <p>Cargando ticket…</p>;
  if (isError) {
    // Ajeno, inexistente o eliminado dan el mismo 404: la pantalla no depende del mensaje.
    return (
      <div className="flex flex-col gap-2">
        <p role="alert">
          {isNotFound(error)
            ? "El ticket no existe."
            : "No se pudo cargar el ticket. Intentá de nuevo."}
        </p>
        <Link to="/tickets" className="text-sm underline">
          Volver a los tickets
        </Link>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">
        {formatTicketNumber(ticket.numero)} · {ticket.titulo}
      </h1>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{ticket.estado.nombre}</Badge>
        {ticket.departamento.nombre} · Prioridad {ticket.prioridad.nombre} · Recibido el{" "}
        {formatDay(ticket.fechaRecepcion)}
      </p>
      {ticket.descripcion && <p className="whitespace-pre-wrap">{ticket.descripcion}</p>}
    </section>
  );
}
