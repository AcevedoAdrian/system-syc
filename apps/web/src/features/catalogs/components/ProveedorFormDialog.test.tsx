import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProveedorFormDialog } from "./ProveedorFormDialog";

const onSubmit = vi.fn();

function renderDialog(initial?: Parameters<typeof ProveedorFormDialog>[0]["initial"]) {
  render(
    <ProveedorFormDialog
      open
      onOpenChange={() => undefined}
      title="Nuevo proveedor"
      submitLabel="Crear"
      initial={initial}
      onSubmit={onSubmit}
    />,
  );
}

describe("ProveedorFormDialog", () => {
  beforeEach(() => {
    onSubmit.mockReset();
    onSubmit.mockResolvedValue(undefined);
  });

  it("con solo el nombre envía los otros 4 campos en null", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "  Acme  ");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      nombre: "Acme",
      contacto: null,
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
  });

  it("envía los 5 campos recortados", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Acme");
    await userEvent.type(screen.getByLabelText("Contacto"), "Ana");
    await userEvent.type(screen.getByLabelText("Teléfono"), "+54 11 5555-0000 int. 2");
    await userEvent.type(screen.getByLabelText("Correo"), "soporte@acme.com");
    await userEvent.type(screen.getByLabelText("Sitio web"), "https://acme.com");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      nombre: "Acme",
      contacto: "Ana",
      telefono: "+54 11 5555-0000 int. 2",
      correo: "soporte@acme.com",
      sitioWeb: "https://acme.com",
    });
  });

  it("un correo inválido muestra el error y no envía", async () => {
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Acme");
    await userEvent.type(screen.getByLabelText("Correo"), "soporte@");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText(/Ingresá un correo válido/)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(["www.proveedor.com", "ftp://proveedor.com"])(
    "el sitio web %s muestra el error y no envía",
    async (url) => {
      renderDialog();

      await userEvent.type(screen.getByLabelText("Nombre"), "Acme");
      await userEvent.type(screen.getByLabelText("Sitio web"), url);
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      expect(await screen.findByText(/empiece con http:\/\/ o https:\/\//)).toBeVisible();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it("el nombre vacío no envía", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText(/El nombre es obligatorio/)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("al editar carga los datos y dejar un campo en blanco lo manda en null", async () => {
    renderDialog({
      id: "p1",
      nombre: "Acme",
      orden: 1,
      activo: true,
      contacto: "Ana",
      telefono: null,
      correo: "soporte@acme.com",
      sitioWeb: null,
    });

    expect(screen.getByLabelText("Contacto")).toHaveValue("Ana");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("");
    await userEvent.clear(screen.getByLabelText("Correo"));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      nombre: "Acme",
      contacto: "Ana",
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
  });

  it("muestra el error de la API dentro del diálogo", async () => {
    onSubmit.mockRejectedValue(new Error("falló"));
    renderDialog();

    await userEvent.type(screen.getByLabelText("Nombre"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo completar la operación");
  });
});
