import { tonos } from "@syc/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, type BadgeTono, badgeTonos, tonoClasses, tonoLabels } from "./badge";

describe("Badge", () => {
  it("sin tono usa los colores de su variante", () => {
    render(<Badge variant="secondary">Pendiente</Badge>);

    const badge = screen.getByText("Pendiente");
    expect(badge).toHaveClass("bg-secondary", "text-secondary-foreground");
    expect(badge).not.toHaveAttribute("data-tono");
  });

  it("ofrece los 16 tonos de la base visual: los 8 del SPEC 09 y los 8 de la ampliación", () => {
    expect(badgeTonos).toEqual([
      "gris",
      "rojo",
      "naranja",
      "amarillo",
      "verde",
      "azul",
      "violeta",
      "rosa",
      "celeste",
      "turquesa",
      "lima",
      "marron",
      "indigo",
      "magenta",
      "bordo",
      "pizarra",
    ]);
  });

  it("los tonos son los del contrato, y cada uno tiene sus clases y su nombre", () => {
    // Un tono agregado en `@syc/contracts` y no acá (o al revés) rompe el build, no el navegador.
    expect([...badgeTonos]).toEqual([...tonos]);
    expect(Object.keys(tonoClasses).sort()).toEqual([...tonos].sort());
    expect(Object.keys(tonoLabels).sort()).toEqual([...tonos].sort());
  });

  it("los nombres de los tonos son textos para el usuario, con mayúscula inicial", () => {
    expect(tonoLabels).toEqual({
      gris: "Gris",
      rojo: "Rojo",
      naranja: "Naranja",
      amarillo: "Amarillo",
      verde: "Verde",
      azul: "Azul",
      violeta: "Violeta",
      rosa: "Rosa",
      celeste: "Celeste",
      turquesa: "Turquesa",
      lima: "Lima",
      marron: "Marrón",
      indigo: "Índigo",
      magenta: "Magenta",
      bordo: "Bordó",
      pizarra: "Pizarra",
    });
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
