import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, type BadgeTono, badgeTonos } from "./badge";

describe("Badge", () => {
  it("sin tono usa los colores de su variante", () => {
    render(<Badge variant="secondary">Pendiente</Badge>);

    const badge = screen.getByText("Pendiente");
    expect(badge).toHaveClass("bg-secondary", "text-secondary-foreground");
    expect(badge).not.toHaveAttribute("data-tono");
  });

  it("ofrece los 8 tonos de la base visual", () => {
    expect(badgeTonos).toEqual([
      "gris",
      "rojo",
      "naranja",
      "amarillo",
      "verde",
      "azul",
      "violeta",
      "rosa",
    ]);
  });

  it.each(badgeTonos as readonly BadgeTono[])(
    "el tono %s aplica su fondo, su texto y su borde",
    (tono) => {
      render(<Badge tono={tono}>Estado</Badge>);

      const badge = screen.getByText("Estado");
      expect(badge).toHaveClass(
        `bg-tono-${tono}`,
        `text-tono-${tono}-foreground`,
        `border-tono-${tono}-border`,
      );
      expect(badge).toHaveAttribute("data-tono", tono);
    },
  );

  it("el tono pisa a la variante: no quedan los colores de la variante", () => {
    render(
      <Badge variant="destructive" tono="verde">
        Cerrado
      </Badge>,
    );

    const badge = screen.getByText("Cerrado");
    expect(badge).toHaveClass("bg-tono-verde");
    expect(badge).not.toHaveClass("text-destructive");
    expect(badge).not.toHaveClass("bg-destructive/10");
    expect(badge).not.toHaveClass("border-transparent");
  });
});
