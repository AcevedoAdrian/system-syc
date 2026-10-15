import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StyleGallery } from "./StyleGallery";

describe("StyleGallery", () => {
  it("tiene un único h1: el encabezado de la propia galería", () => {
    render(<StyleGallery />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Galería de estilos");
  });

  it("muestra todo lo que un módulo nuevo debe reutilizar", () => {
    render(<StyleGallery />);

    for (const name of [
      "Paleta",
      "Tipografía",
      "Botones",
      "Campos",
      "Tonos de insignia",
      "Tabla",
      "Pestañas",
      "Diálogo",
      "Encabezado y estados",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
  });

  it("muestra los 16 tonos de insignia", () => {
    render(<StyleGallery />);

    const section = screen.getByRole("region", { name: "Tonos de insignia" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(16);
  });

  it("los tonos se muestran con su nombre (tonoLabels) y suman el TonoSelect", () => {
    render(<StyleGallery />);

    const section = screen.getByRole("region", { name: "Tonos de insignia" });
    expect(
      within(section)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "Gris",
      "Rojo",
      "Naranja",
      "Amarillo",
      "Verde",
      "Azul",
      "Violeta",
      "Rosa",
      "Celeste",
      "Turquesa",
      "Lima",
      "Marrón",
      "Índigo",
      "Magenta",
      "Bordó",
      "Pizarra",
    ]);
    expect(within(section).getByRole("combobox", { name: "Color" })).toHaveTextContent("Gris");
  });

  it("muestra los tres estados con sus roles", () => {
    render(<StyleGallery />);

    expect(screen.getByRole("status")).toHaveTextContent("Cargando tickets…");
    expect(screen.getByText("No hay tickets")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
  });
});
