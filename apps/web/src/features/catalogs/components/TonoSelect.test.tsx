import { tonos } from "@syc/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TonoSelect } from "./TonoSelect";

// jsdom no implementa lo que Radix Select pide para abrirse.
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

describe("TonoSelect", () => {
  it("el botón muestra el tono elegido como insignia con su nombre", () => {
    render(<TonoSelect id="color" value="verde" onChange={vi.fn()} />);

    const boton = screen.getByRole("combobox");
    expect(boton).toHaveTextContent("Verde");
    expect(boton.querySelector('[data-slot="badge"]')).toHaveAttribute("data-tono", "verde");
  });

  it("ofrece los 16 tonos, cada uno como insignia con el nombre del color", async () => {
    render(<TonoSelect value="gris" onChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("combobox"));

    const opciones = screen.getAllByRole("option");
    expect(opciones).toHaveLength(tonos.length);
    expect(
      opciones.map((o) => o.querySelector('[data-slot="badge"]')?.getAttribute("data-tono")),
    ).toEqual([...tonos]);
    expect(screen.getByRole("option", { name: "Naranja" })).toBeInTheDocument();
    // Los nombres con acento salen de `tonoLabels`; el valor que viaja no lo tiene.
    expect(screen.getByRole("option", { name: "Marrón" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Bordó" })).toBeInTheDocument();
  });

  it("elegir un tono de la ampliación avisa su valor sin acento", async () => {
    const onChange = vi.fn();
    render(<TonoSelect value="gris" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Índigo" }));

    expect(onChange).toHaveBeenCalledWith("indigo");
  });

  it("avisa el tono elegido", async () => {
    const onChange = vi.fn();
    render(<TonoSelect value="gris" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Rosa" }));

    expect(onChange).toHaveBeenCalledWith("rosa");
  });
});
