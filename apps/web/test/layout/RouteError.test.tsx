import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { RouteError } from "@/components/layout/RouteError";

// Con el router de verdad (en memoria) y `RouteError` como `defaultErrorComponent`, igual que en
// `main.tsx`. `/tickets` falla en `beforeLoad` (como `getCurrentUser` con la API caída) mientras
// `apiDown` sea verdadero.
function renderAt(url: string) {
  let apiDown = true;
  let attempts = 0;
  const rootRoute = createRootRoute({ component: Outlet });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Inicio</p>,
  });
  const ticketsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tickets",
    beforeLoad: () => {
      attempts += 1;
      if (apiDown) throw new Error("Failed to fetch http://10.0.0.5:3000/users/me");
    },
    component: () => <p>Bandeja</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, ticketsRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
    defaultErrorComponent: RouteError,
  });
  render(<RouterProvider router={router} />);
  return {
    router,
    attempts: () => attempts,
    recover: () => {
      apiDown = false;
    },
  };
}

describe("Pantalla de error de la ruta", () => {
  it("un error al cargar la ruta muestra el aviso en castellano, con «Reintentar» e «Ir al inicio»", async () => {
    renderAt("/tickets");

    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Something went wrong!")).not.toBeInTheDocument();
  });

  it("no muestra el mensaje del error ni un botón para verlo", async () => {
    renderAt("/tickets");

    await screen.findByRole("heading", { name: "Algo salió mal" });
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/10\.0\.0\.5/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show error/i })).not.toBeInTheDocument();
  });

  it("«Reintentar» vuelve a cargar la ruta: si el problema se resolvió, aparece la pantalla", async () => {
    const user = userEvent.setup();
    const app = renderAt("/tickets");
    await screen.findByRole("heading", { name: "Algo salió mal" });
    const before = app.attempts();

    app.recover();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Bandeja")).toBeInTheDocument();
    expect(app.attempts()).toBeGreaterThan(before);
    expect(screen.queryByRole("heading", { name: "Algo salió mal" })).not.toBeInTheDocument();
  });

  it("«Reintentar» con el problema sin resolver sigue mostrando el aviso", async () => {
    const user = userEvent.setup();
    const app = renderAt("/tickets");
    await screen.findByRole("heading", { name: "Algo salió mal" });
    const before = app.attempts();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeInTheDocument();
    expect(app.attempts()).toBeGreaterThan(before);
  });

  it("«Ir al inicio» lleva a `/`", async () => {
    const user = userEvent.setup();
    const app = renderAt("/tickets");

    await user.click(await screen.findByRole("link", { name: "Ir al inicio" }));

    expect(await screen.findByText("Inicio")).toBeInTheDocument();
    expect(app.router.state.location.pathname).toBe("/");
  });
});
