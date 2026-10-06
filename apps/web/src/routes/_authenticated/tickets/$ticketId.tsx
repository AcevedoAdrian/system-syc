import { createFileRoute } from "@tanstack/react-router";
import { TicketSummaryView } from "@/features/tickets/components/TicketSummaryView";

function TicketPage() {
  const { ticketId } = Route.useParams();
  return <TicketSummaryView ticketId={ticketId} />;
}

export const Route = createFileRoute("/_authenticated/tickets/$ticketId")({
  component: TicketPage,
});
