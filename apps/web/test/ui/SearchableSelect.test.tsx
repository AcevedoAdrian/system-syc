import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type SearchableGroup, SearchableSelect } from "@/components/common/SearchableSelect";

const groups: SearchableGroup[] = [
  {
    id: "dip",
    label: "Diputado",
    options: [
      { value: "a1", label: "Acosta", searchText: "Diputado Acosta" },
      { value: "a2", label: "Benitez", searchText: "Diputado Benitez" },
    ],
  },
  {
    id: "com",
    label: "Comisión",
    options: [{ value: "a3", label: "Acción Social", searchText: "Comisión Acción Social" }],
  },
];

const names = () => screen.getAllByRole("option").map((o) => o.textContent);

function renderSelect(props: Partial<Parameters<typeof SearchableSelect>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <>
      <label htmlFor="area">Área</label>
      <SearchableSelect
        id="area"
        value=""
        onChange={onChange}
        searchLabel="Buscar área"
        groups={groups}
        {...props}
      />
    </>,
  );
  return { onChange };
}

const open = () => userEvent.click(screen.getByRole("combobox", { name: "Área" }));
const search = () => screen.getByRole("combobox", { name: "Buscar área" });

describe("SearchableSelect", () => {
  it("el botón queda ligado a su etiqueta y muestra el placeholder sin valor", () => {
    renderSelect();

    expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Elegí una opción");
  });

  it("al abrir enfoca el buscador y ofrece todo agrupado", async () => {
    renderSelect();
    await open();

    expect(search()).toHaveFocus();
    expect(names()).toEqual(["Acosta", "Benitez", "Acción Social"]);
    expect(screen.getAllByRole("group").map((g) => g.textContent)).toEqual([
      "DiputadoAcostaBenitez",
      "ComisiónAcción Social",
    ]);
  });

  it("con menos de 3 caracteres no filtra y avisa cuántos hacen falta", async () => {
    renderSelect();
    await open();

    await userEvent.type(search(), "be");

    expect(names()).toHaveLength(3);
    expect(screen.getByText("Escribí al menos 3 letras para buscar.")).toBeInTheDocument();
  });

  it("desde 3 caracteres recorta sin mayúsculas ni acentos y oculta los grupos vacíos", async () => {
    renderSelect();
    await open();

    await userEvent.type(search(), "ACC");

    expect(names()).toEqual(["Acción Social"]);
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.queryByText(/al menos 3 letras/)).not.toBeInTheDocument();
  });

  it("también busca por el tipo", async () => {
    renderSelect();
    await open();

    await userEvent.type(search(), "diput");

    expect(names()).toEqual(["Acosta", "Benitez"]);
  });

  it("sin coincidencias lo dice", async () => {
    renderSelect();
    await open();

    await userEvent.type(search(), "zzz");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("Sin coincidencias.")).toBeInTheDocument();
  });

  it("las flechas mueven la opción activa y Enter elige y cierra", async () => {
    const { onChange } = renderSelect();
    await open();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("a2");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Enter sobre una búsqueda elige la primera coincidencia", async () => {
    const { onChange } = renderSelect();
    await open();

    await userEvent.type(search(), "benit{Enter}");

    expect(onChange).toHaveBeenCalledWith("a2");
  });

  it("Escape cierra sin elegir y devuelve el foco al botón", async () => {
    const { onChange } = renderSelect();
    await open();

    await userEvent.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Área" })).toHaveFocus();
  });

  it("un clic elige y cierra; al reabrir el buscador está vacío", async () => {
    const { onChange } = renderSelect();
    await open();
    await userEvent.type(search(), "acc");

    await userEvent.click(screen.getByRole("option", { name: "Acción Social" }));

    expect(onChange).toHaveBeenCalledWith("a3");
    await open();
    expect(search()).toHaveValue("");
  });

  it("marca la opción elegida y el botón muestra `selectedLabel`", async () => {
    renderSelect({ value: "a1", selectedLabel: "Diputado · Acosta" });

    expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Diputado · Acosta");
    await open();
    expect(screen.getByRole("option", { name: "Acosta" })).toHaveAttribute("aria-selected", "true");
  });

  it("la flecha abajo en el botón abre la lista", async () => {
    renderSelect();
    screen.getByRole("combobox", { name: "Área" }).focus();

    await userEvent.keyboard("{ArrowDown}");

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("las opciones sin grupo van antes de todo, dan el texto del botón y se ocultan al filtrar", async () => {
    const { onChange } = renderSelect({
      leadingOptions: [{ value: "", label: "Sin asignar" }],
      rest: [{ value: "x", label: "Huérfana" }],
    });

    expect(screen.getByRole("combobox", { name: "Área" })).toHaveTextContent("Sin asignar");
    await open();
    expect(names()).toEqual(["Sin asignar", "Acosta", "Benitez", "Acción Social", "Huérfana"]);

    await userEvent.type(search(), "huer");
    expect(names()).toEqual(["Huérfana"]);

    await userEvent.clear(search());
    await userEvent.click(screen.getByRole("option", { name: "Sin asignar" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("deshabilitado no abre", async () => {
    renderSelect({ disabled: true });

    await userEvent.click(screen.getByRole("combobox", { name: "Área" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
