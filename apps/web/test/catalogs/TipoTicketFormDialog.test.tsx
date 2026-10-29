import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TipoTicketFormDialog } from "@/features/catalogs/components/TipoTicketFormDialog";

const onSubmit = vi.fn();

function renderDialog(initial?: Parameters<typeof TipoTicketFormDialog>[0]["initial"]) {
  render(
    <TipoTicketFormDialog
      open
      onOpenChange={() => undefined}
      title="Nuevo tipo"
      submitLabel="Crear"
      initial={initial}
      onSubmit={onSubmit}
    />,
  );
}

describe("TipoTicketFormDialog", () => {
  beforeEach(() => {
    onSubmit.mockReset();
    onSubmit.mockResolvedValue(undefined);
  });

  it("con solo el nombre envía la descripción en null", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "  Incidente  ");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ nombre: "Incidente", descripcion: null });
  });

  it("envía la descripción recortada", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Incidente");
    await userEvent.type(screen.getByLabelText("Descripción"), "  Algo falló  ");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      nombre: "Incidente",
      descripcion: "Algo falló",
    });
  });

  it("una descripción en blanco se envía como null", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Incidente");
    await userEvent.type(screen.getByLabelText("Descripción"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ nombre: "Incidente", descripcion: null });
  });

  it("una descripción de 501 caracteres muestra el error y no envía", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Incidente");
    await userEvent.click(screen.getByLabelText("Descripción"));
    await userEvent.paste("a".repeat(501));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Hasta 500 caracteres.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("una de 500 caracteres se envía", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Incidente");
    await userEvent.click(screen.getByLabelText("Descripción"));
    await userEvent.paste("a".repeat(500));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].descripcion).toHaveLength(500);
  });

  it("muestra el contador y precarga lo guardado al editar", async () => {
    renderDialog({
      id: "k1",
      nombre: "Incidente",
      orden: 1,
      activo: true,
      descripcion: "Algo falló",
    });

    expect(screen.getByLabelText("Nombre")).toHaveValue("Incidente");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Algo falló");
    expect(screen.getByText("10/500")).toBeInTheDocument();
  });

  it("un error del servidor se muestra en el panel", async () => {
    onSubmit.mockRejectedValue(new Error("Ya existe un tipo de ticket con ese nombre"));
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Incidente");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
