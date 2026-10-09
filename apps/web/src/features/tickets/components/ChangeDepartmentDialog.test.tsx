import { ORPCError } from "@orpc/client";
import { STALE_TICKET_MESSAGE } from "@syc/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTicket } from "../ticket-fixtures";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  offered: [] as string[],
  departments: [
    { id: "tec", nombre: "Técnico", activo: true, agentes: 2 },
    { id: "red", nombre: "Redes", activo: true, agentes: 1 },
    { id: "adm", nombre: "Administrativo", activo: true, agentes: 0 },
  ],
}));

vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: mocks.departments }),
}));
vi.mock("../hooks/useTicketMutations", () => ({
  useChangeTicketDepartment: () => ({ mutateAsync: mocks.change }),
}));
// `DepartmentSelect` ya filtra por `activo`; acá se registra qué departamentos le pasa el diálogo.
vi.mock("@/features/users/components/DepartmentSelect", () => ({
  DepartmentSelect: ({
    id,
    value,
    onChange,
    departments,
    "aria-describedby": describedBy,
    "aria-required": required,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    departments: { id: string; nombre: string }[];
    "aria-describedby"?: string;
    "aria-required"?: boolean;
  }) => {
    mocks.offered = departments.map((d) => d.id);
    return (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-required={required}
      >
        <option value="">Elegí un departamento</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </select>
    );
  },
}));

import { ChangeDepartmentDialog } from "./ChangeDepartmentDialog";

const onOpenChange = vi.fn();
const onReload = vi.fn();

function renderDialog() {
  const ticket = makeTicket();
  render(
    <ChangeDepartmentDialog ticket={ticket} open onOpenChange={onOpenChange} onReload={onReload} />,
  );
  return ticket;
}

const confirmar = () =>
  userEvent.click(screen.getByRole("button", { name: "Cambiar departamento" }));

describe("ChangeDepartmentDialog", () => {
  beforeEach(() => {
    for (const mock of [mocks.change, onOpenChange, onReload]) mock.mockReset();
    mocks.change.mockResolvedValue(undefined);
    onReload.mockResolvedValue(undefined);
  });

  it("muestra el departamento actual y no lo ofrece como destino", () => {
    renderDialog();

    expect(screen.getByText(/Departamento actual: Técnico/)).toBeInTheDocument();
    expect(mocks.offered).toEqual(["red", "adm"]);
  });

  it("manda el departamento elegido con la versión que leyó, y cierra", async () => {
    const ticket = renderDialog();

    await userEvent.selectOptions(screen.getByLabelText("Nuevo departamento"), "red");
    await confirmar();

    await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
    expect(mocks.change.mock.calls[0]?.[0]).toEqual({
      ticketId: "t-13",
      updatedAt: ticket.updatedAt,
      departamentoId: "red",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("sin elegir un departamento no envía", async () => {
    renderDialog();

    await confirmar();

    expect(await screen.findByText("Elegí un departamento.")).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
  });

  it("el departamento nuevo es obligatorio y su error queda ligado al campo", async () => {
    renderDialog();
    const select = screen.getByLabelText("Nuevo departamento");
    expect(select).toHaveAttribute("aria-required", "true");
    expect(select).not.toHaveAccessibleDescription();

    await confirmar();

    expect(await screen.findByText("Elegí un departamento.")).toBeInTheDocument();
    expect(select).toHaveAccessibleDescription("Elegí un departamento.");
  });

  it("un departamento desactivado (409) muestra el mensaje, sin «Recargar», y deja el diálogo abierto", async () => {
    mocks.change.mockRejectedValue(
      new ORPCError("CONFLICT", {
        status: 409,
        message: "El departamento está desactivado: no puede recibir tickets",
      }),
    );
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText("Nuevo departamento"), "red");
    await confirmar();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El departamento está desactivado: no puede recibir tickets",
    );
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("un 409 por versión desactualizada ofrece «Recargar», que vuelve a leer y cierra", async () => {
    mocks.change.mockRejectedValue(
      new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE }),
    );
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText("Nuevo departamento"), "red");
    await confirmar();
    await userEvent.click(await screen.findByRole("button", { name: "Recargar" }));

    await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("mientras cambia, el botón dice «Cambiando…» y no deja confirmar otra vez", async () => {
    let finish: () => void = () => undefined;
    mocks.change.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    renderDialog();

    await userEvent.selectOptions(screen.getByLabelText("Nuevo departamento"), "red");
    await confirmar();

    expect(await screen.findByRole("button", { name: "Cambiando…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Cambiar departamento" })).not.toBeInTheDocument();
    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("«Recargar» dice «Recargando…» mientras lee, y si falla muestra el error sin cerrar", async () => {
    mocks.change.mockRejectedValue(
      new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE }),
    );
    let fail: (error: Error) => void = () => undefined;
    onReload.mockImplementation(() => new Promise<void>((_, reject) => (fail = reject)));
    renderDialog();
    await userEvent.selectOptions(screen.getByLabelText("Nuevo departamento"), "red");
    await confirmar();

    await userEvent.click(await screen.findByRole("button", { name: "Recargar" }));
    expect(await screen.findByRole("button", { name: "Recargando…" })).toBeDisabled();
    fail(new Error("sin red"));

    expect(await screen.findByRole("button", { name: "Recargar" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo completar la operación. Intentá de nuevo.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
