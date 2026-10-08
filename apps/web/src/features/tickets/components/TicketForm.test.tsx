import { ORPCError } from "@orpc/client";
import { hoyArgentina, STALE_TICKET_MESSAGE } from "@syc/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTicket } from "../ticket-fixtures";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  options: {
    prioridades: [
      { id: "alta", nombre: "Alta" },
      { id: "baja", nombre: "Baja" },
    ],
    areas: [{ id: "sist", nombre: "Sistemas" }],
    edificios: [{ id: "ed1", nombre: "Edificio 1" }],
    tipos: [{ id: "inc", nombre: "Incidente" }],
    modulos: [{ id: "mesa", nombre: "Mesa de entradas" }],
    proveedores: [
      { id: "acme", nombre: "Acme" },
      { id: "otro", nombre: "Otro" },
    ],
  } as Record<string, { id: string; nombre: string }[]>,
}));

vi.mock("../hooks/useTicketMutations", () => ({
  useUpdateTicket: () => ({ mutateAsync: mocks.update }),
}));
// Los selectores de Radix se prueban aparte: acá son `<select>` nativos. El valor actual que ya no
// está entre las opciones se ofrece marcado, como en el real.
vi.mock("./CatalogOptionSelect", () => ({
  CatalogOptionSelect: ({
    id,
    ruta,
    value,
    onChange,
    emptyLabel,
    current,
    ...aria
  }: {
    id: string;
    ruta: string;
    value: string;
    onChange: (v: string) => void;
    emptyLabel?: string;
    current?: { id: string; nombre: string } | null;
  }) => {
    const options = mocks.options[ruta] ?? [];
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...aria}>
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nombre}
          </option>
        ))}
        {current && !options.some((o) => o.id === current.id) && (
          <option value={current.id}>{current.nombre} (inactivo)</option>
        )}
      </select>
    );
  },
}));

import { TicketForm } from "./TicketForm";

const onSaved = vi.fn();
const onReload = vi.fn();
const onDirtyChange = vi.fn();

function renderForm(extra: Parameters<typeof makeTicket>[0] = {}) {
  const ticket = makeTicket(extra);
  render(
    <TicketForm
      ticket={ticket}
      onSaved={onSaved}
      onReload={onReload}
      onDirtyChange={onDirtyChange}
    />,
  );
  return ticket;
}

const save = () => userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

describe("TicketForm", () => {
  beforeEach(() => {
    for (const mock of [mocks.update, onSaved, onReload, onDirtyChange]) mock.mockReset();
    mocks.update.mockResolvedValue(undefined);
    onReload.mockResolvedValue(undefined);
  });

  it("muestra los valores actuales del ticket", () => {
    renderForm({
      titulo: "Impresora rota",
      descripcion: "Piso 2",
      area: { id: "sist", nombre: "Sistemas" },
      proveedor: { id: "acme", nombre: "Acme" },
      referenciaExterna: "19092/2026",
      solucionDescripcion: "Se reinició",
      notificado: true,
    });

    expect(screen.getByLabelText("Título")).toHaveValue("Impresora rota");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Piso 2");
    expect(screen.getByLabelText("Prioridad")).toHaveValue("alta");
    expect(screen.getByLabelText("Área")).toHaveValue("sist");
    expect(screen.getByLabelText("Edificio")).toHaveValue("");
    expect(screen.getByLabelText("Proveedor")).toHaveValue("acme");
    expect(screen.getByLabelText("Referencia externa")).toHaveValue("19092/2026");
    expect(screen.getByLabelText("Solución")).toHaveValue("Se reinició");
    expect(screen.getByLabelText("Fecha de recepción")).toHaveValue("2026-10-01");
    expect(screen.getByRole("checkbox", { name: "Se notificó al usuario" })).toBeChecked();
  });

  it("no tiene el estado ni el departamento: cada uno tiene su propio diálogo", () => {
    renderForm();

    expect(screen.queryByLabelText("Estado")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Departamento")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Número")).not.toBeInTheDocument();
  });

  describe("fecha de cierre y de reapertura", () => {
    it("solo aparecen si el ticket ya tiene valor", () => {
      renderForm();

      expect(screen.queryByLabelText("Fecha de cierre")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Fecha de reapertura")).not.toBeInTheDocument();
    });

    it("con valor se pueden corregir, y se mandan con la nueva fecha", async () => {
      renderForm({ fechaCierre: "2026-10-03", fechaReabierto: "2026-10-04" });

      const cierre = screen.getByLabelText("Fecha de cierre");
      expect(cierre).toHaveValue("2026-10-03");
      expect(screen.getByLabelText("Fecha de reapertura")).toHaveValue("2026-10-04");
      await userEvent.clear(cierre);
      await userEvent.type(cierre, "2026-10-02");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        fechaCierre: "2026-10-02",
        fechaReabierto: "2026-10-04",
      });
    });

    it("sin valor se mandan en null: no se cargan por esta vía", async () => {
      renderForm();

      await userEvent.type(screen.getByLabelText("Título"), " (urgente)");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        fechaCierre: null,
        fechaReabierto: null,
      });
    });

    it("la fecha de cierre no puede quedar vacía ni ser futura", async () => {
      renderForm({ fechaCierre: "2026-10-03" });

      await userEvent.clear(screen.getByLabelText("Fecha de cierre"));
      await save();

      expect(
        await screen.findByText("Ingresá una fecha válida, de hoy o anterior."),
      ).toBeInTheDocument();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe("accesibilidad de los campos", () => {
    it("marca como obligatorios título, prioridad y fecha de recepción, y solo esos", () => {
      renderForm();

      for (const label of ["Título", "Prioridad", "Fecha de recepción"]) {
        expect(screen.getByLabelText(label)).toHaveAttribute("aria-required", "true");
      }
      for (const label of ["Descripción", "Actuación simple", "Solución"]) {
        expect(screen.getByLabelText(label)).not.toHaveAttribute("aria-required");
      }
    });

    it("un error de validación queda ligado a su campo", async () => {
      renderForm();

      await userEvent.clear(screen.getByLabelText("Título"));
      await save();

      const titulo = screen.getByLabelText("Título");
      await waitFor(() => expect(titulo).toHaveAttribute("aria-invalid", "true"));
      expect(titulo).toHaveAccessibleDescription(
        "El título es obligatorio (hasta 200 caracteres).",
      );
    });

    it("sin proveedor la referencia está deshabilitada y dice por qué", () => {
      renderForm({ proveedor: null });

      const referencia = screen.getByLabelText("Referencia externa");
      expect(referencia).toBeDisabled();
      expect(referencia).toHaveAccessibleDescription(
        "Elegí un proveedor para cargar la referencia.",
      );
    });

    it("con proveedor la referencia se habilita y la explicación desaparece", () => {
      renderForm({ proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" });

      expect(screen.getByLabelText("Referencia externa")).toBeEnabled();
      expect(
        screen.queryByText("Elegí un proveedor para cargar la referencia."),
      ).not.toBeInTheDocument();
    });

    it("los campos de texto libre no ofrecen autocompletar del navegador", () => {
      renderForm();

      for (const label of ["Título", "Actuación simple", "Referencia externa"]) {
        expect(screen.getByLabelText(label)).toHaveAttribute("autocomplete", "off");
      }
    });
  });

  describe("mientras guarda", () => {
    it("el botón dice «Guardando…» y no deja enviar otra vez, y al terminar vuelve a su texto", async () => {
      let finish: () => void = () => undefined;
      mocks.update.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
      renderForm();

      await userEvent.type(screen.getByLabelText("Título"), "!");
      await save();

      const guardando = await screen.findByRole("button", { name: "Guardando…" });
      expect(guardando).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();

      finish();
      expect(await screen.findByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    });
  });

  describe("guardar y descartar", () => {
    it("sin cambios no se puede guardar ni descartar", () => {
      renderForm();

      expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Descartar cambios" })).toBeDisabled();
    });

    it("avisa a la pantalla cuando hay cambios sin guardar, y cuando ya no", async () => {
      renderForm();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);

      await userEvent.type(screen.getByLabelText("Título"), "!");
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);

      await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
      expect(screen.getByLabelText("Título")).toHaveValue("Impresora rota");
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });

    it("manda todos los campos y la versión que leyó (`updatedAt`) para el bloqueo optimista", async () => {
      const ticket = renderForm();

      await userEvent.clear(screen.getByLabelText("Título"));
      await userEvent.type(screen.getByLabelText("Título"), "  Impresora sin tinta  ");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toEqual({
        ticketId: "t-13",
        updatedAt: ticket.updatedAt,
        titulo: "Impresora sin tinta",
        descripcion: null,
        actuacionSimple: null,
        prioridadId: "alta",
        areaId: null,
        edificioId: null,
        tipoId: null,
        moduloId: null,
        proveedorId: null,
        referenciaExterna: null,
        fechaRecepcion: "2026-10-01",
        fechaCierre: null,
        fechaReabierto: null,
        solucionDescripcion: null,
        notificado: false,
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("completa área, edificio, tipo y módulo, que nacieron sin asignar", async () => {
      renderForm();

      await userEvent.selectOptions(screen.getByLabelText("Área"), "sist");
      await userEvent.selectOptions(screen.getByLabelText("Edificio"), "ed1");
      await userEvent.selectOptions(screen.getByLabelText("Tipo"), "inc");
      await userEvent.selectOptions(screen.getByLabelText("Módulo"), "mesa");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        areaId: "sist",
        edificioId: "ed1",
        tipoId: "inc",
        moduloId: "mesa",
      });
    });

    it("dejar un campo opcional en blanco lo borra (se manda null)", async () => {
      renderForm({ descripcion: "Piso 2", area: { id: "sist", nombre: "Sistemas" } });

      await userEvent.clear(screen.getByLabelText("Descripción"));
      await userEvent.selectOptions(screen.getByLabelText("Área"), "");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ descripcion: null, areaId: null });
    });

    it("marca y desmarca «Se notificó al usuario»", async () => {
      renderForm();

      await userEvent.click(screen.getByRole("checkbox", { name: "Se notificó al usuario" }));
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ notificado: true });
    });

    it("pide un título y no envía", async () => {
      renderForm();

      await userEvent.clear(screen.getByLabelText("Título"));
      await save();

      expect(
        await screen.findByText("El título es obligatorio (hasta 200 caracteres)."),
      ).toBeInTheDocument();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe("valor actual desactivado o eliminado", () => {
    it("lo sigue mostrando, marcado como inactivo, y guardar sin tocarlo no lo borra", async () => {
      renderForm({ area: { id: "vieja", nombre: "Mantenimiento" } });

      expect(screen.getByLabelText("Área")).toHaveValue("vieja");
      expect(screen.getByRole("option", { name: "Mantenimiento (inactivo)" })).toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Título"), "!");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ areaId: "vieja" });
    });
  });

  describe("proveedor y referencia externa", () => {
    it("sin proveedor la referencia está deshabilitada", () => {
      renderForm();

      expect(screen.getByLabelText("Referencia externa")).toBeDisabled();
    });

    it("al cambiar de proveedor se vacía la referencia, y se manda la que se cargue para el nuevo", async () => {
      renderForm({ proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" });

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "otro");
      expect(screen.getByLabelText("Referencia externa")).toHaveValue("");
      await userEvent.type(screen.getByLabelText("Referencia externa"), "077/2026");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        proveedorId: "otro",
        referenciaExterna: "77/2026",
      });
    });

    it("al cambiar de proveedor sin cargar otra referencia, queda vacía", async () => {
      renderForm({ proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" });

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "otro");
      await save();

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        proveedorId: "otro",
        referenciaExterna: null,
      });
    });

    it("quitar el proveedor borra la referencia y la deshabilita", async () => {
      renderForm({ proveedor: { id: "acme", nombre: "Acme" }, referenciaExterna: "19092/2026" });

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "");

      expect(screen.getByLabelText("Referencia externa")).toBeDisabled();
      await save();
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        proveedorId: null,
        referenciaExterna: null,
      });
    });

    it("rechaza una referencia con formato inválido", async () => {
      renderForm({ proveedor: { id: "acme", nombre: "Acme" } });

      await userEvent.type(screen.getByLabelText("Referencia externa"), "000/2026");
      await save();

      expect(await screen.findByText(/Usá el formato número\/año/)).toBeInTheDocument();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe("errores de la API", () => {
    it("un 409 por versión desactualizada muestra el mensaje y ofrece «Recargar»", async () => {
      mocks.update.mockRejectedValue(
        new ORPCError("CONFLICT", { status: 409, message: STALE_TICKET_MESSAGE }),
      );
      renderForm();

      await userEvent.type(screen.getByLabelText("Título"), "!");
      await save();

      expect(await screen.findByRole("alert")).toHaveTextContent(STALE_TICKET_MESSAGE);
      expect(onSaved).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
      expect(onReload).toHaveBeenCalledTimes(1);
    });

    it("un 409 por referencia duplicada muestra el mensaje pero NO ofrece «Recargar»", async () => {
      mocks.update.mockRejectedValue(
        new ORPCError("CONFLICT", {
          status: 409,
          message: "Esa referencia ya está cargada en el ticket TE-000020",
        }),
      );
      renderForm({ proveedor: { id: "acme", nombre: "Acme" } });

      await userEvent.type(screen.getByLabelText("Referencia externa"), "555/2026");
      await save();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Esa referencia ya está cargada en el ticket TE-000020",
      );
      expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
      // Lo escrito sigue ahí: recargar lo habría descartado sin necesidad.
      expect(screen.getByLabelText("Referencia externa")).toHaveValue("555/2026");
    });

    it("un error de validación del servidor no muestra el texto técnico", async () => {
      mocks.update.mockRejectedValue(
        new ORPCError("BAD_REQUEST", { status: 400, message: "Input validation failed" }),
      );
      renderForm();

      await userEvent.type(screen.getByLabelText("Título"), "!");
      await save();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No se pudo completar la operación. Intentá de nuevo.",
      );
    });

    it("la fecha de recepción propone como máximo hoy", () => {
      renderForm();

      expect(screen.getByLabelText("Fecha de recepción")).toHaveAttribute("max", hoyArgentina());
    });
  });
});
