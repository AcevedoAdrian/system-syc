import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketsSearch } from "../tickets-search";

const data = vi.hoisted(() => ({
  catalogs: {} as Record<string, { id: string; nombre: string; activo: boolean }[]>,
  organizations: [] as { id: string; nombre: string; activo: boolean }[],
}));
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({
  useCatalog: (ruta: string) => ({ data: data.catalogs[ruta] ?? [] }),
}));
vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: data.organizations }),
}));

import { SEARCH_DELAY_MS, TicketsFilters } from "./TicketsFilters";

// jsdom no implementa lo que Radix Select pide para abrirse.
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

beforeEach(() => {
  data.catalogs = {
    estados: [
      { id: "pend", nombre: "Pendiente", activo: true },
      { id: "prog", nombre: "En progreso", activo: true },
    ],
    // El inactivo está primero en el orden de la administración: la bandeja lo manda al final.
    areas: [
      { id: "arch", nombre: "Archivo", activo: false },
      { id: "sis", nombre: "Sistemas", activo: true },
    ],
  };
  data.organizations = [
    { id: "tec", nombre: "Técnico", activo: true },
    { id: "red", nombre: "Redes", activo: true },
  ];
});

afterEach(() => {
  vi.useRealTimers();
});

const renderFilters = (filters: TicketsSearch = {}, isAdmin = false) => {
  const onChange = vi.fn();
  const view = render(<TicketsFilters filters={filters} onChange={onChange} isAdmin={isAdmin} />);
  return { onChange, ...view };
};

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("TicketsFilters", () => {
  describe("selectores", () => {
    it("cambiar un filtro avisa con el filtro nuevo y vuelve a la página 1", async () => {
      const { onChange } = renderFilters({ q: "impresora", page: 3 });

      await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
      await userEvent.click(screen.getByRole("option", { name: "En progreso" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ q: "impresora", estadoId: "prog", page: undefined });
    });

    it("elegir «Todos» quita el filtro", async () => {
      const { onChange } = renderFilters({ estadoId: "prog", page: 2 });

      await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
      await userEvent.click(screen.getByRole("option", { name: "Todos" }));

      expect(onChange).toHaveBeenCalledWith({ estadoId: undefined, page: undefined });
    });

    it("muestra el filtro que dice la URL", () => {
      renderFilters({ estadoId: "prog" });

      expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("En progreso");
      expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Todos");
    });

    it("ofrece los ítems inactivos al final, marcados «(inactivo)»", async () => {
      renderFilters();

      await userEvent.click(screen.getByRole("combobox", { name: "Área" }));

      expect(optionNames()).toEqual(["Todos", "Sistemas", "Archivo (inactivo)"]);
    });

    it("ofrece un selector por cada catálogo de la bandeja", () => {
      renderFilters();

      const names = screen.getAllByRole("combobox").map((c) => c.getAttribute("id"));
      expect(names).toEqual([
        "filtro-estadoId",
        "filtro-areaId",
        "filtro-edificioId",
        "filtro-tipoId",
        "filtro-prioridadId",
        "filtro-proveedorId",
        "filtro-moduloId",
      ]);
    });
  });

  describe("departamento", () => {
    it("un agente no ve el filtro", () => {
      renderFilters({}, false);

      expect(screen.queryByRole("combobox", { name: "Departamento" })).not.toBeInTheDocument();
    });

    it("el admin lo ve y puede filtrar", async () => {
      const { onChange } = renderFilters({ page: 2 }, true);

      await userEvent.click(screen.getByRole("combobox", { name: "Departamento" }));
      expect(optionNames()).toEqual(["Todos", "Técnico", "Redes"]);
      await userEvent.click(screen.getByRole("option", { name: "Redes" }));

      expect(onChange).toHaveBeenCalledWith({ departamentoId: "red", page: undefined });
    });
  });

  describe("fechas de recepción", () => {
    it("cambiar una fecha avisa y vuelve a la página 1", () => {
      const { onChange } = renderFilters({ page: 2 });

      fireEvent.change(screen.getByLabelText("Recepción desde"), {
        target: { value: "2026-10-01" },
      });

      expect(onChange).toHaveBeenCalledWith({ fechaRecepcionDesde: "2026-10-01", page: undefined });
    });

    it("borrar una fecha quita el filtro", () => {
      const { onChange } = renderFilters({ fechaRecepcionHasta: "2026-10-31" });

      fireEvent.change(screen.getByLabelText("Recepción hasta"), { target: { value: "" } });

      expect(onChange).toHaveBeenCalledWith({ fechaRecepcionHasta: undefined, page: undefined });
    });

    it("cada fecha limita a la otra para no armar un rango invertido", () => {
      renderFilters({ fechaRecepcionDesde: "2026-10-05", fechaRecepcionHasta: "2026-10-20" });

      expect(screen.getByLabelText("Recepción desde")).toHaveAttribute("max", "2026-10-20");
      expect(screen.getByLabelText("Recepción hasta")).toHaveAttribute("min", "2026-10-05");
    });
  });

  describe("búsqueda", () => {
    const type = (text: string) =>
      fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: text } });
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

    it("busca cuando el usuario deja de escribir 300 ms, con `replace` y en la página 1", () => {
      vi.useFakeTimers();
      const { onChange } = renderFilters({ estadoId: "prog", page: 4 });

      type("impre");
      wait(SEARCH_DELAY_MS - 1);
      expect(onChange).not.toHaveBeenCalled();
      type("impresora");
      wait(SEARCH_DELAY_MS - 1);
      expect(onChange).not.toHaveBeenCalled();
      wait(1);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(
        { estadoId: "prog", q: "impresora", page: undefined },
        { replace: true },
      );
    });

    it("borrar el texto quita la búsqueda", () => {
      vi.useFakeTimers();
      const { onChange } = renderFilters({ q: "impresora" });

      type("");
      wait(SEARCH_DELAY_MS);

      expect(onChange).toHaveBeenCalledWith({ q: undefined, page: undefined }, { replace: true });
    });

    it("no busca si lo escrito es lo que ya dice la URL, ni por espacios de más", () => {
      vi.useFakeTimers();
      const { onChange } = renderFilters({ q: "impresora" });

      type("  impresora ");
      wait(SEARCH_DELAY_MS * 2);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("empieza con la búsqueda de la URL", () => {
      renderFilters({ q: "impresora" });

      expect(screen.getByLabelText("Buscar")).toHaveValue("impresora");
    });

    it("si la URL cambia desde afuera («Limpiar filtros») el campo se vacía", () => {
      const { rerender } = renderFilters({ q: "impresora" });

      rerender(<TicketsFilters filters={{}} onChange={() => undefined} isAdmin={false} />);

      expect(screen.getByLabelText("Buscar")).toHaveValue("");
    });
  });

  describe("«Limpiar filtros»", () => {
    it("no aparece sin filtros, ni con solo una página", () => {
      renderFilters({ page: 3 });

      expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
    });

    it("con filtros quita todo, también la página", async () => {
      const { onChange } = renderFilters({ q: "x", estadoId: "prog", page: 2 });

      await userEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

      expect(onChange).toHaveBeenCalledWith({});
    });
  });
});
