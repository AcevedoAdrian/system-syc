import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

function Demo({ showCloseButton }: { showCloseButton?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger>abrir</DialogTrigger>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>Necesitás tu contraseña actual.</DialogDescription>
        </DialogHeader>
        <input aria-label="Campo" />
        <DialogFooter>
          <DialogClose asChild>
            <button type="button" data-slot="button">
              Cancelar
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const open = async (props: { showCloseButton?: boolean } = {}) => {
  render(<Demo {...props} />);
  await userEvent.click(screen.getByRole("button", { name: "abrir" }));
  return screen.getByRole("dialog", { name: "Cambiar mi contraseña" });
};

describe("Dialog (SPEC 09, etapa 9.6)", () => {
  it("es un diálogo con su título y su descripción", async () => {
    const dialog = await open();

    expect(dialog).toHaveAccessibleDescription("Necesitás tu contraseña actual.");
  });

  it("es una tarjeta de 420px con borde, relleno de 32px y la sombra del diálogo", async () => {
    const dialog = await open();

    expect(dialog).toHaveClass(
      "sm:max-w-105",
      "p-8",
      "rounded-xl",
      "border",
      "bg-background",
      "shadow-dialog",
    );
  });

  it("el título va en la tipografía de títulos, a 28px", async () => {
    await open();

    expect(screen.getByText("Cambiar mi contraseña", { selector: "h2" })).toHaveClass(
      "font-heading",
      "text-[28px]",
    );
  });

  it("la descripción es de 16px y atenuada", async () => {
    await open();

    expect(screen.getByText("Necesitás tu contraseña actual.")).toHaveClass(
      "text-base",
      "text-muted-foreground",
    );
  });

  it("el fondo es el velo del tema, no un negro fijo", async () => {
    await open();

    expect(document.querySelector("[data-slot=dialog-overlay]")).toHaveClass("bg-scrim");
  });

  it("no tiene botón «×» por defecto", async () => {
    await open();

    expect(screen.queryByRole("button", { name: "Cerrar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("con showCloseButton muestra el «×», en español, y cierra", async () => {
    await open({ showCloseButton: true });

    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("los botones del pie van a la derecha, sin la franja gris de antes, de 40px", async () => {
    await open();

    const pie = screen.getByRole("button", { name: "Cancelar" }).parentElement as HTMLElement;
    expect(pie).toHaveClass("sm:justify-end", "gap-3");
    expect(pie).not.toHaveClass("bg-muted/50");
    expect(pie.className).toContain("**:data-[slot=button]:h-10");
  });

  it("se cierra con Escape y con el botón de cancelar", async () => {
    await open();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "abrir" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
