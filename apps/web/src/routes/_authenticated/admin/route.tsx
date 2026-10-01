import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// La barrera real está en la API; esto solo evita mostrar pantallas que el agente no podría usar.
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: ({ context }) => {
    if (context.currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: Outlet,
});
