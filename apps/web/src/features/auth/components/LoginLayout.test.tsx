import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoginLayout } from "./LoginLayout";

describe("LoginLayout", () => {
  it("muestra el logo, la bajada, el interruptor de tema y el contenido", () => {
    render(
      <LoginLayout>
        <p>formulario</p>
      </LoginLayout>,
    );

    expect(screen.getByRole("img", { name: "system-syc" })).toBeInTheDocument();
    expect(screen.getByText("Gestión interna y seguimiento de tickets.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar modo oscuro" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("formulario");
  });
});
