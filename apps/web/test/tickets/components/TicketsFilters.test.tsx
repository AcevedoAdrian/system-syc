import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TicketsSearch } from "@/features/tickets/tickets-search";

const data = vi.hoisted(() => ({
  catalogs: {} as Record<
    string,
    { id: string; nombre: string; activo: boolean; tipo?: { id: string; nombre: string } }[]
  >,
  organizations: [] as { id: string; nombre: string; activo: boolean }[],
}));
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({
  useCatalog: (ruta: string) => ({ data: data.catalogs[ruta] ?? [] }),
}));
vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: data.organizations }),
}));

import { SEARCH_DELAY_MS, TicketsFilters } from "@/features/tickets/components/TicketsFilters";

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
      { id: "arch", nombre: "Archivo", activo: false, tipo: { id: "dir", nombre: "Dirección" } },
      { id: "sis", nombre: "Sistemas", activo: true, tipo: { id: "dir", nombre: "Dirección" } },
      { id: "aco", nombre: "Acosta", activo: true, tipo: { id: "dip", nombre: "Diputado" } },
    ],
    tiposArea: [
      { id: "dip", nombre: "Diputado", activo: true },
      { id: "dir", nombre: "Dirección", activo: true },
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

const openMore = () => userEvent.click(screen.getByRole("button", { name: /^Más filtros/ }));

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("TicketsFilters", () => {
  it("el buscador no ofrece autocompletar del navegador y su placeholder indica que hay más por escribir", () => {
    renderFilters();

    const buscador = screen.getByRole("searchbox", { name: "Buscar" });
    expect(buscador).toHaveAttribute("autocomplete", "off");
    expect(buscador).toHaveAttribute("name", "q");
    expect(buscador).toHaveAttribute("placeholder", expect.stringMatching(/…$/));
  });

  it("el campo de búsqueda va con su lupa decorativa y su etiqueta solo para lectores de pantalla", () => {
    renderFilters();

    expect(screen.getByText("Buscar")).toHaveClass("sr-only");
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toBeInTheDocument();
  });

  describe("selectores", () => {
    it("cambiar un filtro avisa con el filtro nuevo y vuelve a la página 1", async () => {
      const { onChange } = renderFilters({ q: "impresora", page: 3 });

      await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
      await userEvent.click(screen.getByRole("option", { name: "En progreso" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ q: "impresora", estadoId: "prog", page: undefined });
    });

    it("elegir un tipo de área filtra por tipoAreaId y vuelve a la página 1", async () => {
      data.catalogs.tiposArea = [
        { id: "dip", nombre: "Diputado", activo: true },
        { id: "com", nombre: "Comisión", activo: false },
      ];
      const { onChange } = renderFilters({ areaId: "sis", page: 4 });

      await userEvent.click(screen.getByRole("combobox", { name: "Tipo de área" }));
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Todos",
        "Diputado",
        "Comisión (inactivo)",
      ]);
      await userEvent.click(screen.getByRole("option", { name: "Diputado" }));

      expect(onChange).toHaveBeenCalledWith({ areaId: "sis", tipoAreaId: "dip", page: undefined });
    });

    it("elegir «Todos» quita el filtro", async () => {
      const { onChange } = renderFilters({ estadoId: "prog", page: 2 });

      await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));
      await userEvent.click(screen.getByRole("option", { name: "Todos" }));

      expect(onChange).toHaveBeenCalledWith({ estadoId: undefined, page: undefined });
    });

    it("muestra el filtro que dice la URL", async () => {
      renderFilters({ estadoId: "prog" });
      await openMore();

      expect(screen.getByRole("combobox", { name: "Estado" })).toHaveTextContent("En progreso");
      expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Todos");
    });

    it("ofrece los ítems inactivos al final, marcados «(inactivo)»", async () => {
      // El inactivo está primero en el orden de la administración.
      data.catalogs.estados.unshift({ id: "viejo", nombre: "Viejo", activo: false });
      renderFilters();

      await userEvent.click(screen.getByRole("combobox", { name: "Estado" }));

      expect(optionNames()).toEqual(["Todos", "Pendiente", "En progreso", "Viejo (inactivo)"]);
    });

    it("el filtro de área se agrupa por tipo, con las inactivas al final de su grupo", async () => {
      renderFilters();
      await openMore();

      await userEvent.click(screen.getByRole("combobox", { name: "Área" }));

      expect(optionNames()).toEqual(["Todos", "Acosta", "Sistemas", "Archivo (inactivo)"]);
      expect(screen.getAllByRole("group").map((g) => g.textContent)).toEqual([
        "DiputadoAcosta",
        "DirecciónSistemasArchivo (inactivo)",
      ]);
    });

    it("el filtro de área deja al final, sin grupo, las áreas de un tipo desconocido", async () => {
      data.catalogs.areas.push({ id: "sin", nombre: "Huérfana", activo: true });
      renderFilters();
      await openMore();

      await userEvent.click(screen.getByRole("combobox", { name: "Área" }));

      expect(optionNames().at(-1)).toBe("Huérfana");
      expect(screen.getAllByRole("group")).toHaveLength(2);
    });

    it("elegir un área filtra por areaId y vuelve a la página 1", async () => {
      const { onChange } = renderFilters({ page: 2 });
      await openMore();

      await userEvent.click(screen.getByRole("combobox", { name: "Área" }));
      await userEvent.click(screen.getByRole("option", { name: "Acosta" }));

      expect(onChange).toHaveBeenCalledWith({ areaId: "aco", page: undefined });
    });

    it("con un área elegida, el botón la muestra como «Tipo · Nombre»", () => {
      renderFilters({ areaId: "sis" });

      expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent(
        "Dirección · Sistemas",
      );
    });

    it("un área inactiva elegida se muestra marcada", () => {
      renderFilters({ areaId: "arch" });

      expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent(
        "Dirección · Archivo (inactivo)",
      );
    });

    it("la fila principal tiene Estado y Prioridad; el resto, bajo «Más filtros»", async () => {
      renderFilters();

      const ids = () => screen.getAllByRole("combobox").map((c) => c.getAttribute("id"));
      expect(ids()).toEqual(["filtro-estadoId", "filtro-prioridadId"]);

      await openMore();

      expect(ids()).toEqual([
        "filtro-estadoId",
        "filtro-prioridadId",
        "filtro-areaId",
        "filtro-tipoAreaId",
        "filtro-edificioId",
        "filtro-tipoId",
        "filtro-proveedorId",
        "filtro-moduloId",
      ]);
    });
  });

  describe("«Más filtros»", () => {
    const toggle = () => screen.getByRole("button", { name: /^Más filtros/ });

    it("arranca plegado y avisa su estado y qué controla", () => {
      renderFilters();

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(toggle()).toHaveAttribute("aria-controls", "filtros-adicionales");
      expect(screen.queryByLabelText("Recepción desde")).not.toBeInTheDocument();
    });

    it("se despliega y se pliega", async () => {
      renderFilters();

      await userEvent.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById("filtros-adicionales")).toBeInTheDocument();
      expect(screen.getByLabelText("Recepción desde")).toBeInTheDocument();

      await userEvent.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByLabelText("Recepción desde")).not.toBeInTheDocument();
    });

    it("no muestra la cuenta si no hay filtros de adentro activos", () => {
      renderFilters({ estadoId: "prog", q: "x" });

      expect(toggle()).toHaveAccessibleName("Más filtros");
    });

    it("muestra cuántos filtros de adentro están activos, sin contar los de la fila principal", () => {
      renderFilters({
        estadoId: "prog",
        prioridadId: "alta",
        areaId: "sis",
        fechaRecepcionDesde: "2026-10-01",
        page: 2,
      });

      expect(toggle()).toHaveAccessibleName("Más filtros (2)");
    });

    it("cuenta cada uno de los ocho filtros de adentro", () => {
      renderFilters({
        areaId: "a",
        tipoAreaId: "b",
        edificioId: "c",
        tipoId: "d",
        proveedorId: "e",
        moduloId: "f",
        fechaRecepcionDesde: "2026-10-01",
        fechaRecepcionHasta: "2026-10-31",
      });

      expect(toggle()).toHaveAccessibleName("Más filtros (8)");
    });

    it("arranca abierto si la URL trae un filtro de adentro", () => {
      renderFilters({ areaId: "sis" });

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Sistemas");
    });

    it("arranca plegado si la URL solo trae filtros de la fila principal", () => {
      renderFilters({ estadoId: "prog", prioridadId: "alta" });

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
    });

    it("se abre solo si después llega un filtro de adentro", () => {
      const { rerender } = renderFilters({});
      expect(toggle()).toHaveAttribute("aria-expanded", "false");

      rerender(
        <TicketsFilters filters={{ edificioId: "x" }} onChange={() => undefined} isAdmin={false} />,
      );

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
    });

    it("se puede plegar aunque haya filtros activos, y la cuenta lo sigue mostrando", async () => {
      renderFilters({ areaId: "sis" });

      await userEvent.click(toggle());

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(toggle()).toHaveAccessibleName("Más filtros (1)");
    });

    it("el panel trae las dos fechas, cada una acotada por la otra", async () => {
      renderFilters({ fechaRecepcionDesde: "2026-10-05", fechaRecepcionHasta: "2026-10-20" });

      expect(screen.getByLabelText("Recepción desde")).toHaveAttribute("max", "2026-10-20");
      expect(screen.getByLabelText("Recepción hasta")).toHaveAttribute("min", "2026-10-05");
    });
  });

  describe("departamento", () => {
    it("el admin lo ve en la fila principal, junto a Estado y Prioridad", () => {
      renderFilters({}, true);

      expect(screen.getAllByRole("combobox").map((c) => c.getAttribute("id"))).toEqual([
        "filtro-estadoId",
        "filtro-prioridadId",
        "filtro-departamentoId",
      ]);
    });

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
    it("cambiar una fecha avisa y vuelve a la página 1", async () => {
      const { onChange } = renderFilters({ page: 2 });
      await openMore();

      fireEvent.change(screen.getByLabelText("Recepción desde"), {
        target: { value: "2026-10-01" },
      });

      expect(onChange).toHaveBeenCalledWith({ fechaRecepcionDesde: "2026-10-01", page: undefined });
    });

    it("borrar una fecha quita el filtro", () => {
      // La URL ya trae la fecha: el panel arranca abierto.
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
