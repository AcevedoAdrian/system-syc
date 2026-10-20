import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  state: { error: null as Error | null, isPending: false },
}));
vi.mock("@/features/auth/hooks/useChangePassword", () => ({
  useChangePassword: () => ({ mutate: mocks.mutate, ...mocks.state }),
}));

import { ChangePasswordDialog } from "@/features/auth/components/ChangePasswordDialog";

const open = async () => {
  render(<ChangePasswordDialog />);
  await userEvent.click(screen.getByRole("button", { name: "Cambiar mi contraseña" }));
  return screen.findByRole("dialog", { name: "Cambiar mi contraseña" });
};

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.state = { error: null, isPending: false };
  });

  it("el acceso es un botón redondo de ícono con su etiqueta y su tooltip", () => {
    render(<ChangePasswordDialog />);

    const boton = screen.getByRole("button", { name: "Cambiar mi contraseña" });
    expect(boton).toHaveAttribute("title", "Cambiar mi contraseña");
    expect(boton).toHaveClass("size-10", "rounded-full");
  });

  it("abre el diálogo con su descripción y los tres campos obligatorios", async () => {
    const dialog = await open();

    expect(dialog).toHaveAccessibleDescription(/Necesitás tu contraseña actual/);
    for (const name of ["Contraseña actual", "Contraseña nueva", "Repetí la contraseña nueva"]) {
      expect(screen.getByLabelText(name)).toHaveAttribute("aria-required", "true");
    }
    expect(screen.getByLabelText("Contraseña actual")).toHaveFocus();
  });

  it("los campos miden 40px", async () => {
    await open();

    expect(screen.getByLabelText("Contraseña nueva")).toHaveClass("h-10");
  });

  it("manda la contraseña actual y la nueva", async () => {
    await open();

    await userEvent.type(screen.getByLabelText("Contraseña actual"), "vieja-1234");
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "nueva-5678");
    await userEvent.type(screen.getByLabelText("Repetí la contraseña nueva"), "nueva-5678");
    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate.mock.calls[0]?.[0]).toEqual({
      currentPassword: "vieja-1234",
      newPassword: "nueva-5678",
    });
  });

  it("con campos vacíos muestra los errores y no envía", async () => {
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("Ingresá tu contraseña actual.")).toBeVisible();
    expect(screen.getByText("Debe tener entre 8 y 128 caracteres.")).toBeVisible();
    expect(screen.getByLabelText("Contraseña actual")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("si la confirmación no coincide, lo dice y no envía", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Contraseña actual"), "vieja-1234");
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "nueva-5678");
    await userEvent.type(screen.getByLabelText("Repetí la contraseña nueva"), "otra-9999");

    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeVisible();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor como alerta", async () => {
    mocks.state = { error: new Error("La contraseña actual es incorrecta."), isPending: false };
    await open();

    expect(screen.getByRole("alert")).toHaveTextContent("La contraseña actual es incorrecta.");
  });

  it("mientras envía, el botón queda deshabilitado", async () => {
    mocks.state = { error: null, isPending: true };
    await open();

    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();
  });

  it("al terminar avisa, con una región de estado, y se cierra con «Cerrar»", async () => {
    mocks.mutate.mockImplementation((_values, options) => options.onSuccess());
    await open();
    await userEvent.type(screen.getByLabelText("Contraseña actual"), "vieja-1234");
    await userEvent.type(screen.getByLabelText("Contraseña nueva"), "nueva-5678");
    await userEvent.type(screen.getByLabelText("Repetí la contraseña nueva"), "nueva-5678");
    await userEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Contraseña actualizada. Tus otras sesiones se cerraron.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Cancelar» y Escape cierran sin enviar", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cambiar mi contraseña" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("al volver a abrirlo los campos están vacíos", async () => {
    await open();
    await userEvent.type(screen.getByLabelText("Contraseña actual"), "algo");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await userEvent.click(screen.getByRole("button", { name: "Cambiar mi contraseña" }));

    expect(screen.getByLabelText("Contraseña actual")).toHaveValue("");
  });
});
