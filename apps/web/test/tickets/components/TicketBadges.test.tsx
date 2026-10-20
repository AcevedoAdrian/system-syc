import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const catalogs = vi.hoisted(() => ({
  estados: [
    { id: "pend", orden: 1, clave: null },
    { id: "prog", orden: 2, clave: null },
    { id: "fin", orden: 3, clave: "FINALIZADO" },
  ],
  prioridades: [
    { id: "baja", orden: 1 },
    { id: "alta", orden: 2 },
    { id: "urgente", orden: 3 },
  ],
}));
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({
  useCatalog: (ruta: "estados" | "prioridades") => ({ data: catalogs[ruta] }),
}));

import {
  EstadoDot,
  EstadoPill,
  PrioridadDot,
  PrioridadLabel,
} from "@/features/tickets/components/TicketBadges";

describe("EstadoPill", () => {
  it("muestra el nombre del estado con su punto", () => {
    render(<EstadoPill estado={{ id: "prog", nombre: "En progreso", clave: null }} />);

    const pastilla = screen.getByText("En progreso");
    expect(pastilla).toHaveClass("rounded-full");
    expect(pastilla.firstElementChild).toHaveClass("bg-teal");
    expect(pastilla.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PrioridadLabel", () => {
  it("muestra el nombre de la prioridad con su punto", () => {
    render(<PrioridadLabel prioridad={{ id: "urgente", nombre: "Urgente" }} />);

    expect(screen.getByText("Urgente").firstElementChild).toHaveClass("bg-destructive");
  });
});

describe("EstadoDot", () => {
  it("pinta el estado de sistema por su clave", () => {
    const { container } = render(<EstadoDot estado={{ id: "fin", clave: "FINALIZADO" }} />);

    expect(container.firstElementChild).toHaveClass("bg-foreground");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PrioridadDot", () => {
  it("pinta la prioridad elegida con su color", () => {
    const { container } = render(<PrioridadDot id="alta" />);

    expect(container.firstElementChild).toHaveClass("bg-brand");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("sin prioridad elegida es un aro discontinuo", () => {
    const { container } = render(<PrioridadDot id="" />);

    expect(container.firstElementChild).toHaveClass("border-dashed", "bg-transparent");
  });
});
