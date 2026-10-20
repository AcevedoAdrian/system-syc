import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";

function Harness({
  onSubmit = () => undefined,
  error,
  submitting,
  startOpen = true,
}: {
  onSubmit?: () => void;
  error?: string;
  submitting?: boolean;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        abrir
      </button>
      <FormDrawer
        open={open}
        onOpenChange={setOpen}
        title="Nuevo departamento"
        description="Describe el panel."
      >
        <DrawerForm
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          submitLabel="Crear"
          submitting={submitting}
          error={error}
        >
          <label>
            Nombre
            <input />
          </label>
        </DrawerForm>
      </FormDrawer>
    </>
  );
}

describe("FormDrawer", () => {
  it("es un diálogo con el título y la descripción", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog", { name: "Nuevo departamento" });
    expect(dialog).toHaveAccessibleDescription("Describe el panel.");
  });

  it("el título va en un h2 con la tipografía de títulos", () => {
    render(<Harness />);

    expect(screen.getByRole("heading", { level: 2, name: "Nuevo departamento" })).toHaveClass(
      "font-heading",
    );
  });

  it("es un panel de 440px pegado a la derecha, de punta a punta", () => {
    render(<Harness />);

    expect(screen.getByRole("dialog")).toHaveClass("inset-y-0", "right-0", "w-110");
  });

  it("al abrirse enfoca el primer campo, no el botón de cerrar", async () => {
    render(<Harness />);

    expect(await screen.findByRole("textbox", { name: "Nombre" })).toHaveFocus();
  });

  it("se cierra con el botón «Cerrar»", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se cierra con «Cancelar»", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se cierra con Escape", async () => {
    render(<Harness />);

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cerrado, no deja nada en pantalla, y se puede volver a abrir", async () => {
    render(<Harness startOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "abrir" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("atrapa el foco: Tab no sale del panel", async () => {
    render(<Harness />);
    const dentro = [
      screen.getByRole("button", { name: "Cerrar" }),
      screen.getByRole("textbox", { name: "Nombre" }),
      screen.getByRole("button", { name: "Cancelar" }),
      screen.getByRole("button", { name: "Crear" }),
    ];

    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      expect(dentro.some((el) => el === document.activeElement)).toBe(true);
    }
  });
});

describe("DrawerForm", () => {
  it("«Crear» envía el formulario", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Enter dentro de un campo también envía", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Redes{Enter}");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("«Cancelar» no envía", async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor como alerta, sobre las acciones", () => {
    render(<Harness error="Ya existe un departamento con ese nombre" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe un departamento con ese nombre");
  });

  it("sin error no hay alerta", () => {
    render(<Harness />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras envía, la acción queda deshabilitada y «Cancelar» no", () => {
    render(<Harness submitting />);

    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
  });

  it("las acciones van fijas al pie, con un borde, y los campos con scroll", () => {
    render(<Harness />);

    const crear = screen.getByRole("button", { name: "Crear" });
    expect(crear.parentElement).toHaveClass("border-t", "justify-end");
    expect(
      screen.getByRole("textbox", { name: "Nombre" }).closest(".overflow-y-auto"),
    ).not.toBeNull();
  });
});
