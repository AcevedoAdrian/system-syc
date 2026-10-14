import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("se anuncia como estado y muestra el texto que recibe", () => {
    render(<LoadingState label="Cargando tickets…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando tickets…");
  });

  it("el ícono de giro no se lee: queda oculto para los lectores de pantalla", () => {
    const { container } = render(<LoadingState label="Cargando…" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
