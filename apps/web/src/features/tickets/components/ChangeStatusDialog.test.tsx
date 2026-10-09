import { ORPCError } from "@orpc/client";
import { hoyArgentina, STALE_TICKET_MESSAGE } from "@syc/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTicket } from "../ticket-fixtures";

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  // Estados activos del catálogo. `clave` es lo que decide qué se pide, nunca el nombre.
  estados: [
    { id: "pend", nombre: "Pendiente", clave: null, activo: true, orden: 1 },
    { id: "prog", nombre: "En progreso", clave: null, activo: true, orden: 2 },
    { id: "fin", nombre: "Resuelto", clave: "FINALIZADO", activo: true, orden: 3 },
    { id: "cer", nombre: "Cerrado", clave: "CERRADO", activo: true, orden: 4 },
    { id: "can", nombre: "Cancelado", clave: "CANCELADO", activo: true, orden: 5 },
    { id: "rea", nombre: "Reabierto", clave: "REABIERTO", activo: true, orden: 6 },
    { id: "falso", nombre: "Finalizado", clave: null, activo: true, orden: 7 },
  ],
}));

vi.mock("@/features/catalogs/hooks/useCatalogOptions", () => ({
  useCatalogOptions: () => ({ data: mocks.estados }),
}));
vi.mock("../hooks/useTicketMutations", () => ({
  useChangeTicketStatus: () => ({ mutateAsync: mocks.change }),
}));
vi.mock("./CatalogOptionSelect", () => ({
  CatalogOptionSelect: ({
    id,
    value,
    onChange,
    placeholder,
    excludeId,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    excludeId?: string;
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {mocks.estados
        .filter((e) => e.id !== excludeId)
        .map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
    </select>
  ),
}));

import { ChangeStatusDialog } from "./ChangeStatusDialog";

const onOpenChange = vi.fn();
const onReload = vi.fn();

function renderDialog(extra: Parameters<typeof makeTicket>[0] = {}) {
  const ticket = makeTicket(extra);
  render(
    <ChangeStatusDialog ticket={ticket} open onOpenChange={onOpenChange} onReload={onReload} />,
  );
  return ticket;
}

const elegir = (estadoId: string) =>
  userEvent.selectOptions(screen.getByLabelText("Nuevo estado"), estadoId);
const confirmar = () => userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));

describe("ChangeStatusDialog", () => {
  beforeEach(() => {
    for (const mock of [mocks.change, onOpenChange, onReload]) mock.mockReset();
    mocks.change.mockResolvedValue(undefined);
    onReload.mockResolvedValue(undefined);
  });

  it("ofrece los estados activos menos el actual", () => {
    renderDialog();

    const nombres = screen.getAllByRole("option").map((o) => o.textContent);
    expect(nombres).toEqual([
      "Elegí un estado",
      "En progreso",
      "Resuelto",
      "Cerrado",
      "Cancelado",
      "Reabierto",
      "Finalizado",
    ]);
    expect(nombres).not.toContain("Pendiente");
  });

  it("antes de elegir no pide fecha ni solución, y no deja confirmar sin estado", async () => {
    renderDialog();

    expect(screen.queryByLabelText("Fecha de cierre")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fecha de reapertura")).not.toBeInTheDocument();
    await confirmar();

    expect(await screen.findByText("Elegí un estado.")).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
  });

  describe("ids junto al formulario del ticket", () => {
    // `TicketForm` sigue montado detrás del modal con estos mismos campos. Si el diálogo repitiera un
    // id, el `<label htmlFor>` resolvería al control del formulario y no al del diálogo.
    const idsDelFormulario = ["fechaCierre", "fechaReabierto", "solucionDescripcion"];

    function renderJuntoAlFormulario() {
      render(
        <>
          {idsDelFormulario.map((id) => (
            <input key={id} id={id} aria-label={`formulario ${id}`} />
          ))}
          <ChangeStatusDialog
            ticket={makeTicket()}
            open
            onOpenChange={onOpenChange}
            onReload={onReload}
          />
        </>,
      );
    }

    const idsRepetidos = () => {
      const ids = [...document.body.querySelectorAll("[id]")].map((node) => node.id);
      return ids.filter((id, index) => ids.indexOf(id) !== index);
    };

    it.each([
      ["fin", ["Fecha de cierre", "Solución (opcional)"]],
      ["rea", ["Fecha de reapertura"]],
    ])(
      "al elegir %s ningún id se repite y cada etiqueta lleva a su control",
      async (estadoId, etiquetas) => {
        renderJuntoAlFormulario();

        await elegir(estadoId);

        expect(idsRepetidos()).toEqual([]);
        for (const etiqueta of etiquetas) {
          const control = screen.getByLabelText(etiqueta);
          expect(control.closest("[role=dialog]")).not.toBeNull();
        }
      },
    );
  });

  describe("accesibilidad de los campos", () => {
    it("el estado y la fecha de cierre son obligatorios; la solución, no", async () => {
      renderDialog();

      await elegir("fin");

      expect(screen.getByLabelText("Fecha de cierre")).toHaveAttribute("aria-required", "true");
      expect(screen.getByLabelText("Solución (opcional)")).not.toHaveAttribute("aria-required");
    });

    it("el error de la fecha queda ligado al campo", async () => {
      renderDialog();
      await elegir("fin");

      await userEvent.clear(screen.getByLabelText("Fecha de cierre"));
      await confirmar();

      const fecha = screen.getByLabelText("Fecha de cierre");
      await waitFor(() => expect(fecha).toHaveAttribute("aria-invalid", "true"));
      expect(fecha).toHaveAccessibleDescription("Ingresá una fecha válida, de hoy o anterior.");
    });

    it("la fecha de reapertura es obligatoria", async () => {
      renderDialog();

      await elegir("rea");

      expect(screen.getByLabelText("Fecha de reapertura")).toHaveAttribute("aria-required", "true");
    });
  });

  describe("estado sin clave", () => {
    it("no pide ni manda fechas ni solución: solo cambia el estado", async () => {
      const ticket = renderDialog();

      await elegir("prog");
      expect(screen.queryByLabelText("Fecha de cierre")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Fecha de reapertura")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Solución (opcional)")).not.toBeInTheDocument();
      await confirmar();

      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).toEqual({
        ticketId: "t-13",
        updatedAt: ticket.updatedAt,
        estadoId: "prog",
      });
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("la regla es por clave: un estado que se llama «Finalizado» pero no tiene clave no pide fecha", async () => {
      renderDialog();

      await elegir("falso");

      expect(screen.queryByLabelText("Fecha de cierre")).not.toBeInTheDocument();
    });
  });

  describe("estados de cierre", () => {
    it.each([
      ["fin", "FINALIZADO"],
      ["cer", "CERRADO"],
      ["can", "CANCELADO"],
    ])("%s (%s) pide la fecha de cierre y deja cargar la solución", async (estadoId) => {
      renderDialog();

      await elegir(estadoId);

      expect(screen.getByLabelText("Fecha de cierre")).toBeInTheDocument();
      expect(screen.getByLabelText("Solución (opcional)")).toBeInTheDocument();
      expect(screen.queryByLabelText("Fecha de reapertura")).not.toBeInTheDocument();
    });

    it("propone hoy como fecha de cierre y manda la fecha con la solución", async () => {
      const ticket = renderDialog();

      await elegir("fin");
      expect(screen.getByLabelText("Fecha de cierre")).toHaveValue(hoyArgentina());
      await userEvent.type(screen.getByLabelText("Solución (opcional)"), "  Se cambió el toner  ");
      await confirmar();

      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).toEqual({
        ticketId: "t-13",
        updatedAt: ticket.updatedAt,
        estadoId: "fin",
        fechaCierre: hoyArgentina(),
        solucionDescripcion: "Se cambió el toner",
      });
    });

    it("la solución es opcional: en blanco se manda null", async () => {
      renderDialog();

      await elegir("cer");
      await confirmar();

      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).toMatchObject({
        estadoId: "cer",
        solucionDescripcion: null,
      });
    });

    it("de un cierre a otro propone la fecha de cierre actual y precarga la solución", async () => {
      renderDialog({
        estado: { id: "fin", nombre: "Resuelto", clave: "FINALIZADO" },
        fechaCierre: "2026-10-03",
        solucionDescripcion: "Se cambió el toner",
      });

      await elegir("cer");

      expect(screen.getByLabelText("Fecha de cierre")).toHaveValue("2026-10-03");
      expect(screen.getByLabelText("Solución (opcional)")).toHaveValue("Se cambió el toner");
      await confirmar();
      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).toMatchObject({
        estadoId: "cer",
        fechaCierre: "2026-10-03",
        solucionDescripcion: "Se cambió el toner",
      });
    });

    it("sin fecha de cierre, o con una futura, no envía", async () => {
      renderDialog();
      await elegir("fin");

      await userEvent.clear(screen.getByLabelText("Fecha de cierre"));
      await confirmar();
      expect(
        await screen.findByText("Ingresá una fecha válida, de hoy o anterior."),
      ).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Fecha de cierre"), {
        target: { value: "2999-01-01" },
      });
      await confirmar();

      expect(screen.getByText("Ingresá una fecha válida, de hoy o anterior.")).toBeInTheDocument();
      expect(mocks.change).not.toHaveBeenCalled();
    });
  });

  describe("reapertura", () => {
    it("pide la fecha de reapertura (propone hoy), sin fecha de cierre ni solución", async () => {
      renderDialog();

      await elegir("rea");

      expect(screen.getByLabelText("Fecha de reapertura")).toHaveValue(hoyArgentina());
      expect(screen.queryByLabelText("Fecha de cierre")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Solución (opcional)")).not.toBeInTheDocument();
    });

    it("manda solo la fecha de reapertura: no toca la fecha de cierre ni la solución", async () => {
      const ticket = renderDialog({
        estado: { id: "fin", nombre: "Resuelto", clave: "FINALIZADO" },
        fechaCierre: "2026-10-03",
        solucionDescripcion: "Se cambió el toner",
      });

      await elegir("rea");
      fireEvent.change(screen.getByLabelText("Fecha de reapertura"), {
        target: { value: "2026-10-05" },
      });
      await confirmar();

      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).toEqual({
        ticketId: "t-13",
        updatedAt: ticket.updatedAt,
        estadoId: "rea",
        fechaReabierto: "2026-10-05",
      });
    });

    it("cambiar de opinión de «Reabierto» a uno sin clave deja de pedir la fecha", async () => {
      renderDialog();
      await elegir("rea");

      await elegir("prog");

      expect(screen.queryByLabelText("Fecha de reapertura")).not.toBeInTheDocument();
      await confirmar();
      await waitFor(() => expect(mocks.change).toHaveBeenCalledTimes(1));
      expect(mocks.change.mock.calls[0]?.[0]).not.toHaveProperty("fechaReabierto");
    });
  });

  describe("mientras cambia", () => {
    it("el botón dice «Cambiando…» y no deja confirmar otra vez", async () => {
      let finish: () => void = () => undefined;
      mocks.change.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      renderDialog();

      await elegir("prog");
      await confirmar();

      expect(await screen.findByRole("button", { name: "Cambiando…" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Cambiar estado" })).not.toBeInTheDocument();
      finish();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  });

  describe("«Recargar» tras un 409", () => {
    const stale = () => new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE });

    it("mientras lee dice «Recargando…», no se puede volver a pulsar, y al terminar cierra", async () => {
      mocks.change.mockRejectedValue(stale());
      let finish: () => void = () => undefined;
      onReload.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      renderDialog();
      await elegir("prog");
      await confirmar();

      await userEvent.click(await screen.findByRole("button", { name: "Recargar" }));

      expect(await screen.findByRole("button", { name: "Recargando…" })).toBeDisabled();
      expect(onOpenChange).not.toHaveBeenCalled();
      finish();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it("si no puede leer el ticket muestra el error, no cierra y deja reintentar", async () => {
      mocks.change.mockRejectedValue(stale());
      onReload.mockRejectedValueOnce(new Error("sin red"));
      renderDialog();
      await elegir("prog");
      await confirmar();

      await userEvent.click(await screen.findByRole("button", { name: "Recargar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No se pudo completar la operación. Intentá de nuevo.",
      );
      expect(onOpenChange).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(onReload).toHaveBeenCalledTimes(2);
    });
  });

  describe("errores de la API", () => {
    it("un 409 por versión desactualizada ofrece «Recargar», que vuelve a leer y cierra el diálogo", async () => {
      mocks.change.mockRejectedValue(
        new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE }),
      );
      renderDialog();

      await elegir("prog");
      await confirmar();
      expect(await screen.findByRole("alert")).toHaveTextContent(STALE_TICKET_MESSAGE);
      await userEvent.click(screen.getByRole("button", { name: "Recargar" }));

      await waitFor(() => expect(onReload).toHaveBeenCalledTimes(1));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("otro error muestra su mensaje, sin «Recargar», y deja el diálogo abierto", async () => {
      mocks.change.mockRejectedValue(
        new ORPCError("BAD_REQUEST", { status: 400, message: "El estado está desactivado" }),
      );
      renderDialog();

      await elegir("prog");
      await confirmar();

      expect(await screen.findByRole("alert")).toHaveTextContent("El estado está desactivado");
      expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
