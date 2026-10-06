import { createFileRoute } from "@tanstack/react-router";
import { CreateTicketForm } from "@/features/tickets/components/CreateTicketForm";

function NuevoTicketPage() {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nuevo ticket</h1>
      <CreateTicketForm />
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/tickets/nuevo")({
  component: NuevoTicketPage,
});
