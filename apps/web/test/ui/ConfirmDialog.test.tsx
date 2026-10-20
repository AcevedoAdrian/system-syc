import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

const setup = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Eliminar departamento"
      description="Se eliminará «Redes»."
      confirmLabel="Eliminar"
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onConfirm, onOpenChange };
};

describe("ConfirmDialog", () => {
  it("es un diálogo de alerta con título y descripción", () => {
    setup();

    const dialog = screen.getByRole("alertdialog", { name: "Eliminar departamento" });
    expect(dialog).toHaveAccessibleDescription("Se eliminará «Redes».");
  });

  it("usa el diseño de los diálogos: 420px, relleno de 32px, título de 28px", () => {
    setup();

    expect(screen.getByRole("alertdialog")).toHaveClass(
      "data-[size=default]:sm:max-w-105",
      "p-8",
      "shadow-dialog",
    );
    expect(screen.getByText("Eliminar departamento")).toHaveClass("font-heading", "text-[28px]");
  });

  it("confirmar llama a onConfirm", async () => {
    const { onConfirm } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("«Cancelar» no confirma y pide cerrar", async () => {
    const { onConfirm, onOpenChange } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Escape pide cerrar sin confirmar", async () => {
    const { onConfirm, onOpenChange } = setup();

    await userEvent.keyboard("{Escape}");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("por defecto el botón de confirmar es el primario", () => {
    setup();

    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "Eliminar" })).not.toHaveClass("bg-destructive");
  });

  it("en una eliminación el botón va relleno en rojo, con el texto del tema", () => {
    setup({ destructive: true });

    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass(
      "bg-destructive",
      "text-destructive-foreground",
    );
  });

  it("los dos botones miden 40px", () => {
    setup();

    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("h-10", "px-5");
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass("h-10", "px-5");
  });

  it("cerrado no muestra nada", () => {
    setup({ open: false });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
