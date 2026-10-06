import { createFileRoute } from "@tanstack/react-router";
import { TicketsList } from "@/features/tickets/components/TicketsList";

export const Route = createFileRoute("/_authenticated/tickets/")({
  component: TicketsList,
});
