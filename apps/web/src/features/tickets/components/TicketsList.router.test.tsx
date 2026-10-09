import { TICKETS_PAGE_SIZE, type TicketSummary, type TicketsPage } from "@syc/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type TicketsSearch, ticketsSearchSchema } from "../tickets-search";

// Estos tests usan el router de verdad (en memoria): comprueban que el `search` que arma la paginación
// se serializa en la URL y que la ruta lo vuelve a leer. Con un `Link` de mentira no se vería.
const hook = vi.hoisted(() => ({ page: undefined as unknown, calls: [] as unknown[] }));
vi.mock("../hooks/useTickets", () => ({
  useTickets: (filters: unknown) => {
    hook.calls.push(filters);
    return {
      data: hook.page,
      isPending: false,
      isError: false,
      isPlaceholderData: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { role: "agente" } }),
}));
vi.mock("./TicketsFilters", () => ({ TicketsFilters: () => null }));

import { TicketsList } from "./TicketsList";

const ticket = (numero: number): TicketSummary => ({
  id: `t-${numero}`,
  numero,
  titulo: `Ticket ${numero}`,
  departamento: { id: "tec", nombre: "Técnico" },
  estado: { id: "pend", nombre: "Pendiente", clave: null },
  prioridad: { id: "alta", nombre: "Alta" },
  area: null,
  fechaRecepcion: "2026-10-01",
});

const page = (items: TicketSummary[], extra: Partial<TicketsPage>): TicketsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: TICKETS_PAGE_SIZE,
  ...extra,
});

function renderAt(url: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const ticketsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tickets",
    validateSearch: ticketsSearchSchema,
    component: function TicketsPage() {
      const search: TicketsSearch = ticketsRoute.useSearch();
      return <TicketsList filters={search} onFiltersChange={vi.fn()} />;
    },
  });
  const nuevoRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tickets/nuevo",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([ticketsRoute, nuevoRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const lastFilters = () => hook.calls[hook.calls.length - 1];

describe("TicketsList con el router real", () => {
  beforeEach(() => {
    hook.calls = [];
    hook.page = page([ticket(21)], { total: 134, page: 3 });
  });

  it("«Siguiente» y «Anterior» apuntan a la página vecina y conservan búsqueda y filtros", async () => {
    renderAt("/tickets?q=impresora&estadoId=pend&page=3");

    const siguiente = await screen.findByRole("link", { name: "Siguiente" });
    const anterior = screen.getByRole("link", { name: "Anterior" });

    expect(new URL(siguiente.getAttribute("href") ?? "", "http://x").searchParams.toString()).toBe(
      "q=impresora&estadoId=pend&page=4",
    );
    expect(new URL(anterior.getAttribute("href") ?? "", "http://x").searchParams.toString()).toBe(
      "q=impresora&estadoId=pend&page=2",
    );
  });

  it("desde la página 2 «Anterior» lleva a la URL sin `page`, que es la página 1", async () => {
    hook.page = page([ticket(21)], { total: 134, page: 2 });
    renderAt("/tickets?q=impresora&page=2");

    const anterior = await screen.findByRole("link", { name: "Anterior" });

    expect(anterior).toHaveAttribute("href", "/tickets?q=impresora");
  });

  it("al hacer clic la URL cambia y la bandeja pide la página nueva con los mismos filtros", async () => {
    const router = renderAt("/tickets?q=impresora&page=3");

    await userEvent.click(await screen.findByRole("link", { name: "Siguiente" }));

    await waitFor(() => expect(router.state.location.search).toEqual({ q: "impresora", page: 4 }));
    await waitFor(() => expect(lastFilters()).toEqual({ q: "impresora", page: 4 }));
  });

  it("un texto que parece número (?q=123) sigue siendo texto después de paginar", async () => {
    const router = renderAt("/tickets?q=123&page=3");
    const siguiente = await screen.findByRole("link", { name: "Siguiente" });
    expect(lastFilters()).toEqual({ q: "123", page: 3 });

    // El router entrecomilla el texto numérico en la URL para no leerlo luego como número.
    await userEvent.click(siguiente);

    await waitFor(() => expect(lastFilters()).toEqual({ q: "123", page: 4 }));
    expect(router.state.location.search).toEqual({ q: "123", page: 4 });
  });

  it("en una página posterior a la última, «Ir a la página 1» es un enlace a la URL sin `page`", async () => {
    hook.page = page([], { total: 25, page: 5 });
    renderAt("/tickets?q=impresora&page=5");

    const volver = await screen.findByRole("link", { name: "Ir a la página 1" });

    expect(volver).toHaveAttribute("href", "/tickets?q=impresora");
  });

  it("en los extremos no hay enlace hacia afuera: el botón queda deshabilitado", async () => {
    hook.page = page([ticket(1)], { total: 25, page: 1 });
    renderAt("/tickets");

    expect(await screen.findByRole("link", { name: "Siguiente" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });
});
