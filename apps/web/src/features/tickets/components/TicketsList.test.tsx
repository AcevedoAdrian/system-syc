import { TICKETS_PAGE_SIZE, type TicketSummary, type TicketsPage } from "@syc/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketsSearch } from "../tickets-search";

const hook = vi.hoisted(() => ({
  state: { data: undefined, isPending: true, isError: false, isPlaceholderData: false } as {
    data: TicketsPage | undefined;
    isPending: boolean;
    isError: boolean;
    isPlaceholderData: boolean;
  },
  role: "agente" as "admin" | "agente",
  calls: [] as unknown[],
}));
vi.mock("../hooks/useTickets", () => ({
  useTickets: (filters: unknown) => {
    hook.calls.push(filters);
    return hook.state;
  },
}));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { role: hook.role } }),
}));
// Los filtros tienen sus propios tests: acá solo importa lo que la lista les pasa.
vi.mock("./TicketsFilters", () => ({
  TicketsFilters: ({ isAdmin }: { isAdmin: boolean }) => (
    <p data-testid="filtros">{isAdmin ? "filtros de admin" : "filtros de agente"}</p>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    className,
    children,
  }: {
    to: string;
    params?: { ticketId: string };
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={params ? to.replace("$ticketId", params.ticketId) : to} className={className}>
      {children}
    </a>
  ),
}));

import { TicketsList } from "./TicketsList";

const ticket = (numero: number, extra: Partial<TicketSummary> = {}): TicketSummary => ({
  id: `t-${numero}`,
  numero,
  titulo: `Ticket ${numero}`,
  departamento: { id: "tec", nombre: "Técnico" },
  estado: { id: "pend", nombre: "Pendiente", clave: null },
  prioridad: { id: "alta", nombre: "Alta" },
  area: null,
  fechaRecepcion: "2026-10-01",
  ...extra,
});

const page = (items: TicketSummary[], extra: Partial<TicketsPage> = {}): TicketsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: TICKETS_PAGE_SIZE,
  ...extra,
});

const ready = (data: TicketsPage, extra: Partial<typeof hook.state> = {}) => {
  hook.state = { data, isPending: false, isError: false, isPlaceholderData: false, ...extra };
};

const renderList = (filters: TicketsSearch = {}) => {
  const onFiltersChange = vi.fn();
  render(<TicketsList filters={filters} onFiltersChange={onFiltersChange} />);
  return onFiltersChange;
};

describe("TicketsList", () => {
  beforeEach(() => {
    hook.state = { data: undefined, isPending: true, isError: false, isPlaceholderData: false };
    hook.role = "agente";
    hook.calls = [];
  });

  it("ofrece «Nuevo ticket» y muestra el estado de carga", () => {
    renderList();

    expect(screen.getByRole("link", { name: "Nuevo ticket" })).toHaveAttribute(
      "href",
      "/tickets/nuevo",
    );
    expect(screen.getByText("Cargando tickets…")).toBeInTheDocument();
  });

  it("pide los tickets con los filtros de la URL", () => {
    const filters = { q: "impresora", page: 2 };
    renderList(filters);

    expect(hook.calls[0]).toEqual(filters);
  });

  it("le dice a los filtros si el usuario es admin", () => {
    renderList();
    expect(screen.getByTestId("filtros")).toHaveTextContent("filtros de agente");

    hook.role = "admin";
    renderList();
    expect(screen.getAllByTestId("filtros")[1]).toHaveTextContent("filtros de admin");
  });

  describe("estados", () => {
    it("sin tickets y sin filtros muestra el estado vacío, no un error", () => {
      ready(page([]));
      renderList();

      expect(screen.getByText(/Todavía no hay tickets/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });

    it("sin resultados con filtros lo dice y «Limpiar filtros» quita todo", async () => {
      ready(page([]));
      const onFiltersChange = renderList({ q: "zzz", estadoId: "pend", page: 1 });

      expect(screen.getByText("Ningún ticket coincide con la búsqueda")).toBeInTheDocument();
      expect(screen.queryByText(/Todavía no hay tickets/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

      expect(onFiltersChange).toHaveBeenCalledWith({});
    });

    it("una página posterior a la última ofrece volver a la página 1", async () => {
      ready(page([], { total: 25, page: 5 }));
      const onFiltersChange = renderList({ q: "impresora", page: 5 });

      expect(screen.getByText("Ningún ticket coincide con la búsqueda")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Ir a la página 1" }));

      expect(onFiltersChange).toHaveBeenCalledWith({ q: "impresora", page: undefined });
    });

    it("si falla la carga lo avisa", () => {
      hook.state = { data: undefined, isPending: false, isError: true, isPlaceholderData: false };
      renderList();

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los tickets");
    });

    it("mientras llega la página nueva sigue mostrando la anterior", () => {
      ready(page([ticket(13)]), { isPlaceholderData: true });
      renderList({ page: 2 });

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("Ticket 13").closest("[aria-busy]")).toHaveAttribute(
        "aria-busy",
        "true",
      );
    });
  });

  describe("tabla", () => {
    it("muestra una fila por ticket, en el orden recibido, con el número formateado", () => {
      ready(page([ticket(13), ticket(1000000, { id: "t-grande" }), ticket(2)]));
      renderList();

      const rows = screen.getAllByRole("row").slice(1); // sin el encabezado
      expect(rows.map((row) => within(row).getAllByRole("link")[0]?.textContent)).toEqual([
        "TE-000013",
        "TE-1000000",
        "TE-000002",
      ]);
      expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Número",
        "Título",
        "Departamento",
        "Estado",
        "Prioridad",
        "Área",
        "Fecha de recepción",
      ]);
    });

    it("muestra los datos del ticket, su área y la fecha como dd/mm/aaaa", () => {
      ready(page([ticket(13, { area: { id: "a1", nombre: "Sistemas" } }), ticket(14)]));
      renderList();

      const row = screen.getByTestId("ticket-row-13");
      expect(within(row).getByText("Ticket 13")).toBeInTheDocument();
      expect(within(row).getByText("Técnico")).toBeInTheDocument();
      expect(within(row).getByText("Pendiente")).toBeInTheDocument();
      expect(within(row).getByText("Alta")).toBeInTheDocument();
      expect(within(row).getByText("Sistemas")).toBeInTheDocument();
      expect(within(row).getByText("01/10/2026")).toBeInTheDocument();
      expect(within(screen.getByTestId("ticket-row-14")).getByText("—")).toBeInTheDocument();
    });

    it("la fecha va en un <time> con su valor ISO, y el número y la fecha usan cifras de ancho fijo", () => {
      ready(page([ticket(13)]));
      renderList();

      const row = screen.getByTestId("ticket-row-13");
      const fecha = within(row).getByText("01/10/2026");
      expect(fecha.tagName).toBe("TIME");
      expect(fecha).toHaveAttribute("datetime", "2026-10-01");
      expect(fecha).toHaveClass("tabular-nums");
      expect(within(row).getByRole("link", { name: "TE-000013" })).toHaveClass("tabular-nums");
    });

    it("un título largo se parte en líneas dentro de su celda y no ensancha la tabla", () => {
      const largo = "x".repeat(300);
      ready(page([ticket(13, { titulo: largo })]));
      renderList();

      const enlace = screen.getByRole("link", { name: largo });
      expect(enlace).toHaveClass("whitespace-normal", "wrap-break-word", "max-w-md");
    });

    it("el número y el título abren el ticket", () => {
      ready(page([ticket(13)]));
      renderList();

      expect(screen.getByRole("link", { name: "TE-000013" })).toHaveAttribute(
        "href",
        "/tickets/t-13",
      );
      expect(screen.getByRole("link", { name: "Ticket 13" })).toHaveAttribute(
        "href",
        "/tickets/t-13",
      );
    });
  });

  describe("paginación", () => {
    const twentyOnPage2 = () =>
      ready(
        page(
          Array.from({ length: 20 }, (_, i) => ticket(i + 1)),
          { total: 134, page: 2 },
        ),
      );

    it("muestra la página, el total de páginas y el de tickets", () => {
      twentyOnPage2();
      renderList({ page: 2 });

      expect(screen.getByText("Página 2 de 7 · 134 tickets")).toBeInTheDocument();
    });

    it("usa el singular con un solo ticket", () => {
      ready(page([ticket(1)]));
      renderList();

      expect(screen.getByText("Página 1 de 1 · 1 ticket")).toBeInTheDocument();
    });

    it("«Siguiente» y «Anterior» cambian de página y conservan los filtros", async () => {
      twentyOnPage2();
      const onFiltersChange = renderList({ q: "impresora", page: 2 });

      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await userEvent.click(screen.getByRole("button", { name: "Anterior" }));

      expect(onFiltersChange).toHaveBeenNthCalledWith(1, { q: "impresora", page: 3 });
      // La página 1 es la de la URL sin `page`.
      expect(onFiltersChange).toHaveBeenNthCalledWith(2, { q: "impresora", page: undefined });
    });

    it("en la primera página no hay «Anterior», y en la última no hay «Siguiente»", () => {
      ready(page([ticket(1)], { total: 25 }));
      const { unmount } = render(<TicketsList filters={{}} onFiltersChange={() => undefined} />);
      expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
      unmount();

      ready(page([ticket(21)], { total: 25, page: 2 }));
      render(<TicketsList filters={{ page: 2 }} onFiltersChange={() => undefined} />);
      expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    });
  });
});
