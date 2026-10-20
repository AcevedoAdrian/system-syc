import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Route as RootRoute } from "@/routes/__root";

// Con el router de verdad (en memoria): la raíz es la de la aplicación y las rutas, unas de mentira que
// imitan la estructura anidada (`/admin/usuarios`, `/tickets/$ticketId`).
function renderAt(url: string) {
  const rootRoute = createRootRoute({
    component: Outlet,
    notFoundComponent: RootRoute.options.notFoundComponent,
  });
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin",
    component: () => (
      <div>
        marco autenticado
        <Outlet />
      </div>
    ),
  });
  const usuariosRoute = createRoute({
    getParentRoute: () => adminRoute,
    path: "/usuarios",
    component: () => <p>Usuarios</p>,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Inicio</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, adminRoute.addChildren([usuariosRoute])]),
    history: createMemoryHistory({ initialEntries: [url] }),
    notFoundMode: "root",
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Página no encontrada", () => {
  it("una dirección inexistente muestra el aviso con la dirección y «Ir al inicio»", async () => {
    renderAt("/tikets");

    expect(
      await screen.findByRole("heading", { name: "Página no encontrada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/tikets")).toHaveClass("font-mono");
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/");
  });

  it("una dirección anidada inexistente también, y sin el marco de la ruta padre", async () => {
    renderAt("/admin/xyz");

    expect(
      await screen.findByRole("heading", { name: "Página no encontrada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/admin/xyz")).toBeInTheDocument();
    expect(screen.queryByText("marco autenticado")).not.toBeInTheDocument();
  });

  it("una dirección que existe no la muestra", async () => {
    renderAt("/admin/usuarios");

    expect(await screen.findByText("Usuarios")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Página no encontrada" })).not.toBeInTheDocument();
  });

  it("«Ir al inicio» lleva a `/`", async () => {
    const router = renderAt("/tikets");

    (await screen.findByRole("link", { name: "Ir al inicio" })).click();

    expect(await screen.findByText("Inicio")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
