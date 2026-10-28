import { TICKETS_PAGE_SIZE, type TicketSummary, type TicketsPage } from "@syc/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketsSearch } from "@/features/tickets/tickets-search";

type HookState = {
  data: TicketsPage | undefined;
  isPending: boolean;
  isError: boolean;
  isPlaceholderData: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
const hook = vi.hoisted(() => ({
  state: {} as HookState,
  role: "agente" as "admin" | "agente",
  calls: [] as unknown[],
}));
vi.mock("@/features/tickets/hooks/useTickets", () => ({
  useTickets: (filters: unknown) => {
    hook.calls.push(filters);
    return hook.state;
  },
}));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { role: hook.role } }),
}));
// Los puntos de color de estados y prioridades salen de los catálogos; la lógica tiene sus propios tests.
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({
  useCatalog: (ruta: string) => ({
    data:
      ruta === "estados"
        ? [
            { id: "pend", nombre: "Pendiente", orden: 1, activo: true, clave: null },
            { id: "prog", nombre: "En progreso", orden: 2, activo: true, clave: null },
            { id: "fin", nombre: "Finalizado", orden: 3, activo: true, clave: "FINALIZADO" },
          ]
        : [
            { id: "baja", nombre: "Baja", orden: 1, activo: true },
            { id: "alta", nombre: "Alta", orden: 2, activo: true },
            { id: "urgente", nombre: "Urgente", orden: 3, activo: true },
          ],
  }),
}));
// Los filtros tienen sus propios tests: acá solo importa lo que la lista les pasa.
vi.mock("@/features/tickets/components/TicketsFilters", () => ({
  TicketsFilters: ({ isAdmin }: { isAdmin: boolean }) => (
    <p data-testid="filtros">{isAdmin ? "filtros de admin" : "filtros de agente"}</p>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    className,
    children,
    "aria-label": ariaLabel,
  }: {
    to: string;
    params?: { ticketId: string };
    search?: Record<string, unknown>;
    className?: string;
    "aria-label"?: string;
    children: React.ReactNode;
  }) => {
    // El `search` queda en el href como en la URL real; el router de verdad se prueba aparte.
    const query = new URLSearchParams(
      Object.entries(search ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    const path = params ? to.replace("$ticketId", params.ticketId) : to;
    return (
      <a href={query ? `${path}?${query}` : path} className={className} aria-label={ariaLabel}>
        {children}
      </a>
    );
  },
}));

import { TicketsList } from "@/features/tickets/components/TicketsList";

const ticket = (numero: number, extra: Partial<TicketSummary> = {}): TicketSummary => ({
  id: `t-${numero}`,
  numero,
  referenciaExterna: `${numero}/2026`,
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

const initialState = (extra: Partial<HookState> = {}): HookState => ({
  data: undefined,
  isPending: true,
  isError: false,
  isPlaceholderData: false,
  isFetching: false,
  refetch: vi.fn(),
  ...extra,
});

const ready = (data: TicketsPage, extra: Partial<HookState> = {}) => {
  hook.state = initialState({ data, isPending: false, ...extra });
};

const renderList = (filters: TicketsSearch = {}) => {
  const onFiltersChange = vi.fn();
  render(<TicketsList filters={filters} onFiltersChange={onFiltersChange} />);
  return onFiltersChange;
};

describe("TicketsList", () => {
  beforeEach(() => {
    hook.state = initialState();
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

  it("tiene el título, su bajada y el listado en una región con nombre", () => {
    renderList();

    expect(screen.getByRole("heading", { level: 1, name: "Tickets" })).toBeInTheDocument();
    expect(screen.getByText("Seguimiento de solicitudes y su estado.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Listado" })).toBeInTheDocument();
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

    it("una página posterior a la última ofrece volver a la página 1", () => {
      ready(page([], { total: 25, page: 5 }));
      renderList({ q: "impresora", page: 5 });

      expect(screen.getByText("Ningún ticket coincide con la búsqueda")).toBeInTheDocument();
      // Un enlace real a la misma búsqueda sin `page` (la página 1).
      expect(screen.getByRole("link", { name: "Ir a la página 1" })).toHaveAttribute(
        "href",
        "/tickets?q=impresora",
      );
    });

    it("si falla la carga lo avisa", () => {
      hook.state = initialState({ isPending: false, isError: true });
      renderList();

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los tickets");
    });

    it("si falla la carga ofrece «Reintentar», que vuelve a pedir los tickets", async () => {
      hook.state = initialState({ isPending: false, isError: true });
      renderList();

      await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

      expect(hook.state.refetch).toHaveBeenCalledTimes(1);
    });

    it("mientras reintenta lo dice y no deja pulsar otra vez", () => {
      hook.state = initialState({ isPending: false, isError: true, isFetching: true });
      renderList();

      expect(screen.getByRole("button", { name: "Reintentando…" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
    });

    it("el estado de carga es una región de estado", () => {
      renderList();

      expect(screen.getByText("Cargando tickets…")).toHaveAttribute("role", "status");
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

    it("la página que se está reemplazando se ve atenuada", () => {
      ready(page([ticket(13)]), { isPlaceholderData: true });
      renderList({ page: 2 });

      expect(screen.getByText("Ticket 13").closest("[aria-busy]")).toHaveClass("opacity-60");
    });

    it("la página ya recibida se ve normal", () => {
      ready(page([ticket(13)]));
      renderList();

      expect(screen.getByText("Ticket 13").closest("[aria-busy]")).not.toHaveClass("opacity-60");
    });
  });

  describe("resumen para lectores de pantalla", () => {
    // Una región viva siempre montada y oculta a la vista: lo visible cambia al filtrar o paginar y,
    // sin ella, un lector de pantalla no se entera.
    const resumen = (texto: string) => screen.getByText(texto);

    it("anuncia cuántos tickets hay y en qué página", () => {
      ready(page([ticket(13)], { total: 134, page: 2 }));
      renderList({ page: 2 });

      expect(resumen("134 tickets encontrados, página 2 de 7.")).toHaveAttribute("role", "status");
      expect(resumen("134 tickets encontrados, página 2 de 7.")).toHaveClass("sr-only");
    });

    it("usa el singular con un solo ticket", () => {
      ready(page([ticket(13)]));
      renderList();

      expect(resumen("1 ticket encontrado, página 1 de 1.")).toBeInTheDocument();
    });

    it("anuncia que no hubo resultados", () => {
      ready(page([]));
      renderList({ q: "zzz" });

      expect(resumen("Sin resultados.")).toBeInTheDocument();
    });

    it("mientras llega la página nueva dice que está actualizando, en vez de repetir la anterior", () => {
      ready(page([ticket(13)], { total: 134, page: 1 }), { isPlaceholderData: true });
      renderList({ page: 2 });

      expect(resumen("Actualizando tickets…")).toBeInTheDocument();
      expect(screen.queryByText(/tickets encontrados/)).not.toBeInTheDocument();
    });

    it("es la misma región antes y después de recibir los datos", () => {
      hook.state = initialState();
      const { rerender } = render(<TicketsList filters={{}} onFiltersChange={vi.fn()} />);
      const region = document.querySelector(".sr-only[role=status]");
      expect(region).toBeEmptyDOMElement();

      ready(page([ticket(13)]));
      rerender(<TicketsList filters={{}} onFiltersChange={vi.fn()} />);

      expect(document.querySelector(".sr-only[role=status]")).toBe(region);
      expect(region).toHaveTextContent("1 ticket encontrado, página 1 de 1.");
    });
  });

  describe("tabla", () => {
    it("muestra una fila por ticket, en el orden recibido, con el número del proveedor", () => {
      ready(page([ticket(13), ticket(1000000, { id: "t-grande" }), ticket(2)]));
      renderList();

      const rows = screen.getAllByRole("row").slice(1); // sin el encabezado
      expect(rows.map((row) => within(row).getAllByRole("cell")[0]?.textContent)).toEqual([
        "13/2026",
        "1000000/2026",
        "2/2026",
      ]);
      expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "N.º del proveedor",
        "Título",
        "Departamento",
        "Estado",
        "Prioridad",
        "Área",
        "Fecha de recepción",
      ]);
    });

    it("muestra los datos del ticket, su área y la fecha como dd/mm/aaaa", () => {
      ready(
        page([
          ticket(13, {
            area: { id: "a1", nombre: "Sistemas", tipo: { id: "t1", nombre: "Diputado" } },
          }),
          ticket(14),
        ]),
      );
      renderList();

      const row = screen.getByTestId("ticket-row-13");
      expect(within(row).getByText("Ticket 13")).toBeInTheDocument();
      expect(within(row).getByText("Técnico")).toBeInTheDocument();
      expect(within(row).getByText("Pendiente")).toBeInTheDocument();
      expect(within(row).getByText("Alta")).toBeInTheDocument();
      expect(within(row).getByText("Diputado · Sistemas")).toBeInTheDocument();
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
      expect(within(row).getByText("13/2026")).toHaveClass("tabular-nums");
    });

    it("un título largo se parte en líneas dentro de su celda y no ensancha la tabla", () => {
      const largo = "x".repeat(300);
      ready(page([ticket(13, { titulo: largo })]));
      renderList();

      const titulo = screen.getByText(largo);
      expect(titulo).toHaveClass("whitespace-normal", "wrap-break-word", "max-w-md");
    });

    it("el número abre el ticket, y es el único enlace de la fila", () => {
      ready(page([ticket(13)]));
      renderList();

      const enlaces = within(screen.getByTestId("ticket-row-13")).getAllByRole("link");
      expect(enlaces).toHaveLength(1);
      expect(enlaces[0]).toHaveAccessibleName("13/2026");
      expect(enlaces[0]).toHaveAttribute("href", "/tickets/t-13");
    });

    it("un ticket sin número del proveedor muestra «Sin número» y el enlace nombra el del sistema", () => {
      ready(page([ticket(13, { referenciaExterna: null })]));
      renderList();

      const enlace = within(screen.getByTestId("ticket-row-13")).getByRole("link");
      expect(enlace).toHaveTextContent("Sin número");
      expect(enlace).toHaveAccessibleName("Sin número del proveedor, abrir TE-000013");
      expect(enlace).toHaveAttribute("href", "/tickets/t-13");
    });

    it("el título es texto, no un segundo enlace al mismo destino", () => {
      ready(page([ticket(13)]));
      renderList();

      expect(screen.queryByRole("link", { name: "Ticket 13" })).not.toBeInTheDocument();
      expect(
        within(screen.getByTestId("ticket-row-13")).getByText("Ticket 13"),
      ).toBeInTheDocument();
    });

    it("el número va en tipografía monoespaciada, con el color de enlace, y se subraya también con el teclado", () => {
      ready(page([ticket(13)]));
      renderList();

      expect(screen.getByRole("link", { name: "13/2026" })).toHaveClass(
        "font-mono",
        "text-link",
        "hover:underline",
        "focus-visible:underline",
      );
    });

    describe("estado y prioridad", () => {
      it("el estado va en una píldora con su punto, y el punto no se lee en voz alta", () => {
        ready(page([ticket(13, { estado: { id: "prog", nombre: "En progreso", clave: null } })]));
        renderList();

        const pastilla = screen.getByText("En progreso");
        expect(pastilla).toHaveClass("rounded-full", "bg-card");
        const punto = pastilla.firstElementChild as HTMLElement;
        expect(punto).toHaveAttribute("aria-hidden", "true");
        expect(punto).toHaveClass("bg-teal");
      });

      it("el estado de sistema se pinta por su clave", () => {
        ready(
          page([ticket(13, { estado: { id: "fin", nombre: "Finalizado", clave: "FINALIZADO" } })]),
        );
        renderList();

        expect(screen.getByText("Finalizado").firstElementChild).toHaveClass("bg-foreground");
      });

      it("la prioridad lleva su punto, con el color de su lugar en el catálogo", () => {
        ready(
          page([
            ticket(1, { prioridad: { id: "urgente", nombre: "Urgente" } }),
            ticket(2, { prioridad: { id: "alta", nombre: "Alta" } }),
            ticket(3, { prioridad: { id: "baja", nombre: "Baja" } }),
          ]),
        );
        renderList();

        const punto = (nombre: string) => screen.getByText(nombre).firstElementChild;
        expect(punto("Urgente")).toHaveClass("bg-destructive");
        expect(punto("Alta")).toHaveClass("bg-brand");
        // Con tres prioridades, la primera es la tercera desde el final: ámbar.
        expect(punto("Baja")).toHaveClass("bg-warning");
        expect(punto("Alta")).toHaveAttribute("aria-hidden", "true");
      });

      it("el nombre acompaña siempre al punto: el color no es la única señal", () => {
        ready(page([ticket(13)]));
        renderList();

        const fila = within(screen.getByTestId("ticket-row-13"));
        expect(fila.getByText("Pendiente")).toBeInTheDocument();
        expect(fila.getByText("Alta")).toBeInTheDocument();
      });
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

    it("muestra el tramo, el total, la página y el total de páginas", () => {
      twentyOnPage2();
      renderList({ page: 2 });

      expect(screen.getByText("Mostrando 21–40 de 134 · Página 2 de 7")).toBeInTheDocument();
    });

    it("en la última página el tramo termina en el último ticket recibido", () => {
      ready(
        page(
          Array.from({ length: 14 }, (_, i) => ticket(i + 1)),
          { total: 134, page: 7 },
        ),
      );
      renderList({ page: 7 });

      expect(screen.getByText("Mostrando 121–134 de 134 · Página 7 de 7")).toBeInTheDocument();
    });

    it("con un solo ticket, el tramo es 1–1", () => {
      ready(page([ticket(1)]));
      renderList();

      expect(screen.getByText("Mostrando 1–1 de 1 · Página 1 de 1")).toBeInTheDocument();
    });

    it("«Siguiente» y «Anterior» son enlaces a la página vecina y conservan los filtros", () => {
      twentyOnPage2();
      renderList({ q: "impresora", page: 2 });

      expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
        "href",
        "/tickets?q=impresora&page=3",
      );
      // La página 1 es la de la URL sin `page`.
      expect(screen.getByRole("link", { name: "Anterior" })).toHaveAttribute(
        "href",
        "/tickets?q=impresora",
      );
    });

    it("cambiar de página no pasa por onFiltersChange: navega el propio enlace", async () => {
      twentyOnPage2();
      const onFiltersChange = renderList({ page: 2 });

      await userEvent.click(screen.getByRole("link", { name: "Siguiente" }));

      expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it("en la primera página no hay «Anterior», y en la última no hay «Siguiente»", () => {
      ready(page([ticket(1)], { total: 25 }));
      const { unmount } = render(<TicketsList filters={{}} onFiltersChange={() => undefined} />);
      expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
      expect(screen.queryByRole("link", { name: "Anterior" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Siguiente" })).toBeInTheDocument();
      unmount();

      ready(page([ticket(21)], { total: 25, page: 2 }));
      render(<TicketsList filters={{ page: 2 }} onFiltersChange={() => undefined} />);
      expect(screen.getByRole("link", { name: "Anterior" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
      expect(screen.queryByRole("link", { name: "Siguiente" })).not.toBeInTheDocument();
    });
  });
});
