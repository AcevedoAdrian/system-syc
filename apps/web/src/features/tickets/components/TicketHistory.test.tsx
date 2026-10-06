import type { AuditHistory } from "@syc/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({
  state: { data: undefined, isPending: true, isError: false } as {
    data: AuditHistory | undefined;
    isPending: boolean;
    isError: boolean;
  },
}));
vi.mock("../hooks/useTicketHistory", () => ({ useTicketHistory: () => hook.state }));

import { TicketHistory } from "./TicketHistory";

const entry = (
  id: string,
  action: string,
  payload: Record<string, unknown>,
  actor: { id: string; name: string } | null = { id: "u1", name: "Ana" },
) => ({ id, action, actor, payload, createdAt: "2026-10-06T17:32:00.000Z" });

const show = (data: AuditHistory) => {
  hook.state = { data, isPending: false, isError: false };
  render(<TicketHistory ticketId="t-13" />);
};

describe("TicketHistory", () => {
  it("mientras carga, y si falla, lo avisa", () => {
    hook.state = { data: undefined, isPending: true, isError: false };
    const { unmount } = render(<TicketHistory ticketId="t-13" />);
    expect(screen.getByText("Cargando historial…")).toBeInTheDocument();
    unmount();

    hook.state = { data: undefined, isPending: false, isError: true };
    render(<TicketHistory ticketId="t-13" />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el historial.");
  });

  it("sin movimientos muestra un texto, no una lista vacía", () => {
    show([]);

    expect(screen.getByText("Todavía no hay movimientos.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("un cambio de estado se lee 'Estado: Pendiente → En progreso', con fecha y usuario", () => {
    show([
      entry("a2", "update", {
        before: { estado: { id: "e1", nombre: "Pendiente" } },
        after: { estado: { id: "e2", nombre: "En progreso" } },
      }),
    ]);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText(/06\/10\/2026 14:32 · Ana/)).toBeInTheDocument();
    expect(item).toHaveTextContent("Estado: Pendiente → En progreso");
  });

  it("muestra una línea por cada campo que cambió", () => {
    show([
      entry("a2", "update", {
        before: { estado: { id: "e1", nombre: "Pendiente" }, fechaCierre: null },
        after: { estado: { id: "e3", nombre: "Resuelto" }, fechaCierre: "2026-10-05" },
      }),
    ]);

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Estado: Pendiente → Resuelto");
    expect(item).toHaveTextContent("Fecha de cierre: — → 05/10/2026");
  });

  it("el alta dice 'Ticket creado' y la eliminación 'Ticket eliminado'", () => {
    show([entry("a3", "delete", {}), entry("a1", "create", { after: { numero: 13 } })]);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ticket eliminado");
    expect(items[1]).toHaveTextContent("Ticket creado");
    // El alta no repite los campos del ticket como si fueran cambios.
    expect(items[1]).not.toHaveTextContent("→");
  });

  it("respeta el orden que manda la API (más reciente primero)", () => {
    show([
      entry("a3", "update", { before: { titulo: "B" }, after: { titulo: "C" } }),
      entry("a2", "update", { before: { titulo: "A" }, after: { titulo: "B" } }),
    ]);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Título: B → C");
    expect(items[1]).toHaveTextContent("Título: A → B");
  });

  it("un cambio hecho por el sistema (sin actor) se atribuye a 'Sistema'", () => {
    show([entry("a1", "create", { after: {} }, null)]);

    expect(screen.getByRole("listitem")).toHaveTextContent("· Sistema");
  });

  it("el nombre de una referencia sale de la foto: sobrevive a que el ítem se renombre o elimine", () => {
    show([
      entry("a2", "update", {
        before: { area: { id: "a1", nombre: "Mantenimiento (vieja)" } },
        after: { area: null },
      }),
    ]);

    expect(screen.getByRole("listitem")).toHaveTextContent("Área: Mantenimiento (vieja) → —");
  });
});
