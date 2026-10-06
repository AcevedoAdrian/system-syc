import { createFileRoute } from "@tanstack/react-router";
import { TicketDetail } from "@/features/tickets/components/TicketDetail";

function TicketPage() {
  const { ticketId } = Route.useParams();
  return <TicketDetail ticketId={ticketId} />;
}

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  component: TicketPage,
});
