import { TICKETS_PAGE_SIZE, type TicketSummary, type TicketsPage } from "@syc/contracts";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({
  state: { data: undefined, isPending: true, isError: false } as {
    data: TicketsPage | undefined;
    isPending: boolean;
    isError: boolean;
  },
}));
vi.mock("../hooks/useTickets", () => ({ useTickets: () => hook.state }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
  }: {
    to: string;
    params?: { ticketId: string };
    children: React.ReactNode;
  }) => <a href={params ? to.replace("$ticketId", params.ticketId) : to}>{children}</a>,
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

const page = (items: TicketSummary[]): TicketsPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: TICKETS_PAGE_SIZE,
});

describe("TicketsList", () => {
  beforeEach(() => {
    hook.state = { data: undefined, isPending: true, isError: false };
  });

  it("ofrece «Nuevo ticket» y muestra el estado de carga", () => {
    render(<TicketsList />);

    expect(screen.getByRole("link", { name: "Nuevo ticket" })).toHaveAttribute(
      "href",
      "/tickets/nuevo",
    );
    expect(screen.getByText("Cargando tickets…")).toBeInTheDocument();
  });

  it("sin tickets muestra el estado vacío, no un error", () => {
    hook.state = { data: page([]), isPending: false, isError: false };
    render(<TicketsList />);

    expect(screen.getByText(/Todavía no hay tickets/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("si falla la carga lo avisa", () => {
    hook.state = { data: undefined, isPending: false, isError: true };
    render(<TicketsList />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los tickets");
  });

  it("muestra una fila por ticket, en el orden recibido, con el número formateado", () => {
    hook.state = {
      data: page([ticket(13), ticket(1000000, { id: "t-grande" }), ticket(2)]),
      isPending: false,
      isError: false,
    };
    render(<TicketsList />);

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
      "Fecha de recepción",
    ]);
  });

  it("muestra los datos del ticket y la fecha de recepción como dd/mm/aaaa", () => {
    hook.state = { data: page([ticket(13)]), isPending: false, isError: false };
    render(<TicketsList />);

    const row = screen.getByTestId("ticket-row-13");
    expect(within(row).getByText("Ticket 13")).toBeInTheDocument();
    expect(within(row).getByText("Técnico")).toBeInTheDocument();
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    expect(within(row).getByText("Alta")).toBeInTheDocument();
    expect(within(row).getByText("01/10/2026")).toBeInTheDocument();
  });

  it("el número y el título abren el ticket", () => {
    hook.state = { data: page([ticket(13)]), isPending: false, isError: false };
    render(<TicketsList />);

    expect(screen.getByRole("link", { name: "TE-000013" })).toHaveAttribute(
      "href",
      "/tickets/t-13",
    );
    expect(screen.getByRole("link", { name: "Ticket 13" })).toHaveAttribute(
      "href",
      "/tickets/t-13",
    );
  });

  it("avisa que son los más recientes solo cuando llegó el tope de 50", () => {
    hook.state = {
      data: page(Array.from({ length: 50 }, (_, i) => ticket(i + 1))),
      isPending: false,
      isError: false,
    };
    const { unmount } = render(<TicketsList />);
    expect(screen.getByText("Se muestran los 50 más recientes.")).toBeInTheDocument();
    unmount();

    hook.state = { data: page([ticket(1)]), isPending: false, isError: false };
    render(<TicketsList />);
    expect(screen.queryByText(/más recientes/)).not.toBeInTheDocument();
  });
});
