import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("muestra el título", () => {
    render(<EmptyState title="No hay tickets" />);

    expect(screen.getByText("No hay tickets")).toBeInTheDocument();
  });

  it("muestra la descripción y la acción cuando las recibe", () => {
    render(
      <EmptyState
        title="No hay tickets"
        description="Todavía no cargaste ninguno."
        action={<button type="button">Nuevo ticket</button>}
      />,
    );

    expect(screen.getByText("Todavía no cargaste ninguno.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo ticket" })).toBeInTheDocument();
  });

  it("sin descripción ni acción no deja huecos", () => {
    const { container } = render(<EmptyState title="No hay tickets" />);

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
