import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TicketTabs } from "./TicketTabs";

const panels = {
  datos: <input aria-label="Título" defaultValue="" />,
  comentarios: <p>conversación</p>,
  historial: <p>movimientos</p>,
};

const tab = (name: string) => screen.getByRole("tab", { name });
// Un panel oculto no tiene nombre accesible: se lo busca por el `id` al que apunta su pestaña.
const panel = (name: string) =>
  document.getElementById(tab(name).getAttribute("aria-controls") as string) as HTMLElement;

describe("TicketTabs", () => {
  it("tiene las pestañas Datos, Comentarios e Historial, con Datos activa al abrir", () => {
    render(<TicketTabs panels={panels} />);

    expect(screen.getByRole("tablist", { name: "Secciones del ticket" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Datos",
      "Comentarios",
      "Historial",
    ]);
    expect(tab("Datos")).toHaveAttribute("aria-selected", "true");
    expect(tab("Comentarios")).toHaveAttribute("aria-selected", "false");
  });

  it("solo el panel activo es visible", () => {
    render(<TicketTabs panels={panels} />);

    expect(screen.getByRole("tabpanel")).toBe(panel("Datos"));
    expect(panel("Comentarios")).toHaveAttribute("hidden");
    expect(panel("Historial")).toHaveAttribute("hidden");
  });

  it("cada pestaña apunta a su panel y el panel a su pestaña", () => {
    render(<TicketTabs panels={panels} />);

    for (const name of ["Datos", "Comentarios", "Historial"]) {
      expect(panel(name)).toHaveAttribute("role", "tabpanel");
      expect(panel(name)).toHaveAttribute("aria-labelledby", tab(name).id);
    }
  });

  it("al elegir una pestaña muestra su panel y oculta el anterior", async () => {
    render(<TicketTabs panels={panels} />);

    await userEvent.click(tab("Comentarios"));

    expect(screen.getByRole("tabpanel")).toBe(panel("Comentarios"));
    expect(screen.getByText("conversación")).toBeVisible();
    expect(panel("Datos")).toHaveAttribute("hidden");
  });

  it("los paneles ocultos siguen montados: cambiar de pestaña no pierde lo escrito", async () => {
    render(<TicketTabs panels={panels} />);

    await userEvent.type(screen.getByLabelText("Título"), "Impresora rota");
    await userEvent.click(tab("Historial"));
    // El campo sigue en el documento, solo que oculto.
    expect(screen.getByLabelText("Título", { selector: "input" })).toBeInTheDocument();
    await userEvent.click(tab("Datos"));

    expect(screen.getByLabelText("Título")).toHaveValue("Impresora rota");
  });

  it("se recorre con las flechas del teclado", async () => {
    render(<TicketTabs panels={panels} />);

    tab("Datos").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Comentarios")).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowRight}");
    expect(tab("Historial")).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowLeft}");
    expect(tab("Comentarios")).toHaveAttribute("aria-selected", "true");
  });

  it("con Tab el foco entra a la pestaña activa", async () => {
    render(<TicketTabs panels={panels} />);

    await userEvent.tab();

    expect(tab("Datos")).toHaveFocus();
  });

  it("cada pestaña lleva su punto de color, que no se lee en voz alta, y su raya al estar activa", () => {
    render(<TicketTabs panels={panels} />);

    const punto = (name: string) => tab(name).firstElementChild as HTMLElement;
    expect(punto("Datos")).toHaveClass("bg-brand");
    expect(punto("Comentarios")).toHaveClass("bg-blue");
    expect(punto("Historial")).toHaveClass("bg-amber");
    expect(punto("Datos")).toHaveAttribute("aria-hidden", "true");
    expect(tab("Datos")).toHaveClass("data-[state=active]:border-brand");
    expect(tab("Comentarios")).toHaveClass("data-[state=active]:border-blue");
    expect(tab("Historial")).toHaveClass("data-[state=active]:border-amber");
  });
});
