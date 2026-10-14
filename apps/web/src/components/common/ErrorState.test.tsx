import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("se anuncia como alerta con el título y la descripción", () => {
    render(<ErrorState title="No se pudo cargar" description="Intentá de nuevo." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar");
    expect(alert).toHaveTextContent("Intentá de nuevo.");
  });

  it("sin onRetry no ofrece el botón", () => {
    render(<ErrorState title="No se pudo cargar" />);

    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("con onRetry, «Reintentar» lo llama", async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="No se pudo cargar" onRetry={onRetry} />);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
