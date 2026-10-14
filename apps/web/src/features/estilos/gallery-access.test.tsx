import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotFoundPage } from "@/components/common/NotFoundPage";
import { assertGalleryAvailable } from "./gallery-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

function renderAt(path: string) {
  const root = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage });
  const estilos = createRoute({
    getParentRoute: () => root,
    path: "/estilos",
    beforeLoad: assertGalleryAvailable,
    component: () => <p>Galería de estilos</p>,
  });
  const tickets = createRoute({
    getParentRoute: () => root,
    path: "/tickets",
    component: () => <p>Bandeja</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([estilos, tickets]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("galería /estilos", () => {
  it("en desarrollo la guarda deja pasar", () => {
    vi.stubEnv("PROD", false);

    expect(() => assertGalleryAvailable()).not.toThrow();
  });

  it("en producción la guarda responde «no encontrado»", () => {
    vi.stubEnv("PROD", true);

    expect(() => assertGalleryAvailable()).toThrowError(
      expect.objectContaining({ isNotFound: true }),
    );
  });

  it("en desarrollo la ruta muestra la galería", async () => {
    vi.stubEnv("PROD", false);

    renderAt("/estilos");

    expect(await screen.findByText("Galería de estilos")).toBeInTheDocument();
  });

  it("en producción la ruta muestra la página de «no encontrado»", async () => {
    vi.stubEnv("PROD", true);

    renderAt("/estilos");

    expect(await screen.findByText("Página no encontrada")).toBeInTheDocument();
    expect(screen.queryByText("Galería de estilos")).not.toBeInTheDocument();
  });
});
