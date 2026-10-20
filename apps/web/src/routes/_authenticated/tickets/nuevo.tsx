import { createFileRoute } from "@tanstack/react-router";
import { CreateTicketForm } from "@/features/tickets/components/CreateTicketForm";

function NuevoTicketPage() {
  return (
    <section className="mx-auto flex w-full max-w-300 flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]">
          Nuevo ticket
        </h1>
        <p className="text-base text-muted-foreground">
          Completá los datos del requerimiento. Los campos con * son obligatorios.
        </p>
      </div>
      <CreateTicketForm />
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/tickets/nuevo")({
  component: NuevoTicketPage,
});
