import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

function Controlled({ onChange }: { onChange?: (value: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      aria-label="Activo"
      checked={on}
      onCheckedChange={(value) => {
        setOn(value);
        onChange?.(value);
      }}
    />
  );
}

describe("Switch", () => {
  it("es un interruptor con su etiqueta y su estado", () => {
    render(<Switch aria-label="Departamento «Redes» activo" checked />);

    const interruptor = screen.getByRole("switch", { name: "Departamento «Redes» activo" });
    expect(interruptor).toBeChecked();
    expect(interruptor).toHaveAttribute("aria-checked", "true");
  });

  it("apagado, aria-checked es false", () => {
    render(<Switch aria-label="Activo" checked={false} />);

    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("se activa y se desactiva con el mouse", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toBeChecked();
    await userEvent.click(screen.getByRole("switch"));

    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("se maneja con el teclado: Tab para llegar y espacio para cambiarlo", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByRole("switch")).toHaveFocus();
    await userEvent.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("deshabilitado no cambia ni recibe el foco", async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Activo" checked disabled onCheckedChange={onChange} />);

    await userEvent.click(screen.getByRole("switch"));
    await userEvent.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("switch")).not.toHaveFocus();
  });

  it("mide 44×26px y el apagado no usa el gris claro de la maqueta", () => {
    render(<Switch aria-label="Activo" checked={false} />);

    const interruptor = screen.getByRole("switch");
    expect(interruptor).toHaveClass(
      "h-6.5",
      "w-11",
      "bg-neutral-dot",
      "data-[state=checked]:bg-teal",
    );
  });
});
