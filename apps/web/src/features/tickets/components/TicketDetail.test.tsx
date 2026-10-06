import { ORPCError } from "@orpc/client";
import type { Ticket, User } from "@syc/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTicket } from "../ticket-fixtures";

const mocks = vi.hoisted(() => ({
  user: undefined as unknown,
  ticket: {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as {
    data: Ticket | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: ReturnType<typeof vi.fn>;
  },
  remove: vi.fn(),
  navigate: vi.fn(),
  formMounts: 0,
}));

vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: mocks.user }),
}));
vi.mock("../hooks/useTicket", () => ({ useTicket: () => mocks.ticket }));
vi.mock("../hooks/useTicketMutations", () => ({
  useRemoveTicket: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}));
// Las piezas con su propia prueba se reemplazan por stubs que dejan ver lo que la pantalla les pasa.
vi.mock("./TicketHistory", () => ({
  TicketHistory: ({ ticketId }: { ticketId: string }) => (
    <div data-testid="historial">historial de {ticketId}</div>
  ),
}));
vi.mock("./TicketComments", () => ({
  TicketComments: ({ ticketId }: { ticketId: string }) => (
    <div data-testid="comentarios">comentarios de {ticketId}</div>
  ),
}));
vi.mock("./TicketForm", async () => {
  const { useEffect } = await import("react");
  return {
    TicketForm: (props: {
      ticket: Ticket;
      onSaved: () => void;
      onReload: () => Promise<unknown>;
      onDirtyChange: (dirty: boolean) => void;
    }) => {
      useEffect(() => {
        mocks.formMounts += 1;
      }, []);
      return (
        <div data-testid="formulario" data-version={props.ticket.updatedAt}>
          <button type="button" onClick={() => props.onDirtyChange(true)}>
            ensuciar
          </button>
          <button type="button" onClick={() => props.onDirtyChange(false)}>
            limpiar
          </button>
          <button type="button" onClick={() => props.onSaved()}>
            guardado
          </button>
          <button type="button" onClick={() => props.onReload()}>
            recargar
          </button>
        </div>
      );
    },
  };
});
vi.mock("./ChangeStatusDialog", () => ({
  ChangeStatusDialog: ({
    open,
    ticket,
    onReload,
  }: {
    open: boolean;
    ticket: Ticket;
    onReload: () => Promise<unknown>;
  }) =>
    open ? (
      <div data-testid="dialogo-estado" data-version={ticket.updatedAt}>
        <button type="button" onClick={() => onReload()}>
          recargar-estado
        </button>
      </div>
    ) : null,
}));
vi.mock("./ChangeDepartmentDialog", () => ({
  ChangeDepartmentDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="dialogo-departamento" /> : null,
}));

import { TicketDetail } from "./TicketDetail";

const agente: User = {
  id: "u1",
  username: "ana",
  name: "Ana",
  email: null,
  role: "agente",
  activo: true,
  department: { id: "tec", nombre: "Técnico" },
};
const admin: User = { ...agente, id: "u0", role: "admin", department: null };

function show(ticket: Ticket | undefined, extra: Partial<typeof mocks.ticket> = {}) {
  mocks.ticket = {
    data: ticket,
    isPending: false,
    isError: false,
    error: null,
    refetch: mocks.ticket.refetch,
    ...extra,
  };
  return render(<TicketDetail ticketId="t-13" />);
}

describe("TicketDetail", () => {
  beforeEach(() => {
    mocks.user = agente;
    mocks.formMounts = 0;
    mocks.ticket.refetch = vi.fn().mockResolvedValue(undefined);
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue(undefined);
    mocks.navigate.mockReset();
  });

  describe("estados de la carga", () => {
    it("mientras carga", () => {
      show(undefined, { isPending: true });

      expect(screen.getByText("Cargando ticket…")).toBeInTheDocument();
    });

    it("un 404 dice «El ticket no existe» y vuelve a la lista, sin depender del mensaje", () => {
      show(undefined, {
        isError: true,
        error: new ORPCError("NOT_FOUND", { status: 404, message: "Malformed response" }),
      });

      expect(screen.getByRole("alert")).toHaveTextContent("El ticket no existe.");
      expect(screen.getByRole("link", { name: "Volver a los tickets" })).toHaveAttribute(
        "href",
        "/tickets",
      );
      expect(screen.queryByTestId("formulario")).not.toBeInTheDocument();
    });

    it("cualquier otro error pide reintentar", () => {
      show(undefined, { isError: true, error: new Error("network") });

      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el ticket");
    });
  });

  describe("encabezado y partes", () => {
    it("muestra el número formateado, el título, el estado y el departamento", () => {
      show(makeTicket({ numero: 13 }));

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "TE-000013 · Impresora rota",
      );
      expect(screen.getByText("Pendiente")).toBeInTheDocument();
      expect(screen.getByText("Técnico")).toBeInTheDocument();
    });

    it("compone el formulario de datos, los comentarios y el historial del mismo ticket", () => {
      show(makeTicket());

      expect(screen.getByTestId("formulario")).toBeInTheDocument();
      expect(screen.getByTestId("comentarios")).toHaveTextContent("comentarios de t-13");
      expect(screen.getByTestId("historial")).toHaveTextContent("historial de t-13");
    });

    it("los comentarios van entre el formulario y el historial", () => {
      show(makeTicket());

      const order = screen
        .getAllByTestId(/^(formulario|comentarios|historial)$/)
        .map((element) => element.dataset.testid);
      expect(order).toEqual(["formulario", "comentarios", "historial"]);
    });

    it("comentar no reinicia el formulario: sigue siendo la misma versión del ticket", () => {
      show(makeTicket());

      expect(mocks.formMounts).toBe(1);
      expect(screen.getByTestId("comentarios")).toBeInTheDocument();
    });
  });

  describe("acciones según el rol", () => {
    it("un agente solo ve «Cambiar estado»: no cambia el departamento ni elimina", () => {
      mocks.user = agente;
      show(makeTicket());

      expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cambiar departamento" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    });

    it("el admin ve las tres acciones", () => {
      mocks.user = admin;
      show(makeTicket());

      expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cambiar departamento" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    });

    it("abre el diálogo de estado, y el de departamento solo para el admin", async () => {
      mocks.user = admin;
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
      expect(screen.getByTestId("dialogo-estado")).toBeInTheDocument();
      expect(screen.queryByTestId("dialogo-departamento")).not.toBeInTheDocument();
    });

    it("el admin abre el diálogo de departamento", async () => {
      mocks.user = admin;
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "Cambiar departamento" }));

      expect(screen.getByTestId("dialogo-departamento")).toBeInTheDocument();
    });
  });

  describe("cambios sin guardar", () => {
    it("bloquean el cambio de estado y de departamento, y avisan por qué", async () => {
      mocks.user = admin;
      show(makeTicket());
      expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "ensuciar" }));

      expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cambiar departamento" })).toBeDisabled();
      expect(screen.getByText(/Guardá o descartá los cambios/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "limpiar" }));
      expect(screen.getByRole("button", { name: "Cambiar estado" })).toBeEnabled();
      expect(screen.queryByText(/Guardá o descartá los cambios/)).not.toBeInTheDocument();
    });

    it("eliminar sigue disponible: no depende de lo que haya en el formulario", async () => {
      mocks.user = admin;
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "ensuciar" }));

      expect(screen.getByRole("button", { name: "Eliminar" })).toBeEnabled();
    });
  });

  describe("aviso de guardado", () => {
    it("confirma «Cambios guardados.» y lo quita al volver a editar", async () => {
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "guardado" }));
      expect(screen.getByRole("status")).toHaveTextContent("Cambios guardados.");

      await userEvent.click(screen.getByRole("button", { name: "ensuciar" }));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("versión del ticket", () => {
    it("el formulario se vuelve a montar con cada versión nueva, y no con la misma", () => {
      const { rerender } = show(makeTicket({ updatedAt: "2026-10-06T13:00:00.000Z" }));
      expect(mocks.formMounts).toBe(1);

      rerender(<TicketDetail ticketId="t-13" />);
      expect(mocks.formMounts).toBe(1);

      mocks.ticket.data = makeTicket({ updatedAt: "2026-10-06T14:00:00.000Z" });
      rerender(<TicketDetail ticketId="t-13" />);

      expect(mocks.formMounts).toBe(2);
      expect(screen.getByTestId("formulario")).toHaveAttribute(
        "data-version",
        "2026-10-06T14:00:00.000Z",
      );
    });

    it("«Recargar» del formulario y de los diálogos vuelve a leer el ticket", async () => {
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "recargar" }));
      await userEvent.click(screen.getByRole("button", { name: "Cambiar estado" }));
      await userEvent.click(screen.getByRole("button", { name: "recargar-estado" }));

      expect(mocks.ticket.refetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("eliminar", () => {
    beforeEach(() => {
      mocks.user = admin;
    });

    it("pide confirmación con el número del ticket, y no elimina todavía", async () => {
      show(makeTicket({ numero: 13 }));

      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));

      expect(await screen.findByText(/Se eliminará el ticket TE-000013/)).toBeInTheDocument();
      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("al confirmar elimina y vuelve a la lista", async () => {
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await userEvent.click(await screen.findByRole("button", { name: "Eliminar", hidden: false }));

      await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ ticketId: "t-13" }));
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/tickets" }));
    });

    it("cancelar no elimina nada", async () => {
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it("si la API rechaza, muestra el mensaje y no navega", async () => {
      mocks.remove.mockRejectedValue(new ORPCError("FORBIDDEN", { status: 403 }));
      show(makeTicket());

      await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      await userEvent.click(await screen.findByRole("button", { name: "Eliminar", hidden: false }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "No tenés permiso para realizar esta acción.",
      );
      expect(mocks.navigate).not.toHaveBeenCalled();
    });
  });
});
