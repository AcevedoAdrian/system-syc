import { createFileRoute, redirect } from "@tanstack/react-router";

// La pantalla de inicio es la lista de tickets: `/` no tiene contenido propio (SPEC 05, Feature 5.10).
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    throw redirect({ to: "/tickets" });
  },
});
