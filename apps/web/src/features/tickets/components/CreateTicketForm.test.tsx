import { ORPCError } from "@orpc/client";
import { hoyArgentina, type User } from "@syc/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: undefined as unknown,
  create: vi.fn(),
  navigate: vi.fn(),
  departments: [
    { id: "tec", nombre: "Técnico", activo: true, agentes: 2 },
    { id: "red", nombre: "Redes", activo: true, agentes: 1 },
  ],
  options: {
    prioridades: [
      { id: "alta", nombre: "Alta" },
      { id: "baja", nombre: "Baja" },
    ],
    proveedores: [{ id: "acme", nombre: "Acme" }],
  } as Record<string, { id: string; nombre: string }[]>,
}));

vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: mocks.user }),
}));
vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: mocks.departments }),
}));
vi.mock("../hooks/useTicketMutations", () => ({
  useCreateTicket: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

// Los selectores de Radix se prueban aparte: acá son `<select>` nativos para ejercitar el formulario.
vi.mock("@/features/users/components/DepartmentSelect", () => ({
  DepartmentSelect: ({
    id,
    value,
    onChange,
    departments,
  }: {
    id: string;
    value: string;
    onChange: (v: string) => void;
    departments: { id: string; nombre: string }[];
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Elegí un departamento</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.nombre}
        </option>
      ))}
    </select>
  ),
}));
vi.mock("./CatalogOptionSelect", () => ({
  CatalogOptionSelect: ({
    id,
    ruta,
    value,
    onChange,
    emptyLabel,
    placeholder,
    ...aria
  }: {
    id: string;
    ruta: string;
    value: string;
    onChange: (v: string) => void;
    emptyLabel?: string;
    placeholder?: string;
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...aria}>
      <option value="">{emptyLabel ?? placeholder}</option>
      {(mocks.options[ruta] ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  ),
}));

import { CreateTicketForm } from "./CreateTicketForm";

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

const created = { id: "t-77", numero: 77 };

describe("CreateTicketForm", () => {
  beforeEach(() => {
    mocks.user = agente;
    mocks.create.mockReset();
    mocks.create.mockResolvedValue(created);
    mocks.navigate.mockReset();
  });

  it("no pide estado, número, área, edificio, tipo, módulo ni nada del cierre", () => {
    render(<CreateTicketForm />);

    for (const label of [
      "Estado",
      "Número",
      "Área",
      "Edificio",
      "Tipo",
      "Módulo",
      "Fecha de cierre",
      "Fecha de reapertura",
      "Solución",
      "Notificado",
    ]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    for (const label of [
      "Título",
      "Prioridad",
      "Fecha de recepción",
      "Descripción",
      "Actuación simple",
      "Proveedor",
      "Referencia externa",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("propone hoy como fecha de recepción, sin poder elegir una futura", () => {
    render(<CreateTicketForm />);

    const fecha = screen.getByLabelText("Fecha de recepción");
    expect(fecha).toHaveValue(hoyArgentina());
    expect(fecha).toHaveAttribute("max", hoyArgentina());
  });

  describe("agente", () => {
    it("ve su departamento como texto, sin poder elegir otro", () => {
      render(<CreateTicketForm />);

      // Es un campo de solo lectura con su etiqueta, no un texto suelto que ningún lector asocie.
      const departamento = screen.getByLabelText("Departamento");
      expect(departamento).toHaveValue("Técnico");
      expect(departamento).toHaveAttribute("readonly");
      expect(screen.queryByRole("combobox", { name: "Departamento" })).not.toBeInTheDocument();
      expect(screen.queryByText("Redes")).not.toBeInTheDocument();
    });

    it("crea con el mínimo: manda su departamento y los opcionales en null, y navega al ticket", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "  Impresora rota  ");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toEqual({
        departamentoId: "tec",
        titulo: "Impresora rota",
        descripcion: null,
        prioridadId: "alta",
        fechaRecepcion: hoyArgentina(),
        actuacionSimple: null,
        proveedorId: null,
        referenciaExterna: null,
      });
      await waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: "/tickets/$ticketId",
          params: { ticketId: "t-77" },
        }),
      );
    });
  });

  describe("admin", () => {
    beforeEach(() => {
      mocks.user = admin;
    });

    it("elige entre los departamentos activos y manda el elegido", async () => {
      render(<CreateTicketForm />);

      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "red");
      await userEvent.type(screen.getByLabelText("Título"), "Sin red");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "baja");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        departamentoId: "red",
        prioridadId: "baja",
      });
    });

    it("no deduce el departamento: sin elegir uno no envía y lo pide", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Sin red");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByText("Elegí un departamento.")).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("accesibilidad de los campos", () => {
    it("el agente ve su departamento como dato fijo, sin marcarlo como obligatorio", () => {
      render(<CreateTicketForm />);

      expect(screen.getByLabelText("Departamento")).not.toHaveAttribute("aria-required");
    });

    it("marca como obligatorios título, prioridad y fecha de recepción", () => {
      render(<CreateTicketForm />);

      for (const label of ["Título", "Prioridad", "Fecha de recepción"]) {
        expect(screen.getByLabelText(label)).toHaveAttribute("aria-required", "true");
      }
      expect(screen.getByLabelText("Descripción")).not.toHaveAttribute("aria-required");
    });

    it("un error de validación queda ligado a su campo", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "   ");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      const titulo = screen.getByLabelText("Título");
      await waitFor(() => expect(titulo).toHaveAttribute("aria-invalid", "true"));
      expect(titulo).toHaveAccessibleDescription(
        "El título es obligatorio (hasta 200 caracteres).",
      );
    });

    it("la referencia dice por qué está deshabilitada hasta elegir un proveedor", async () => {
      render(<CreateTicketForm />);

      const referencia = screen.getByLabelText("Referencia externa");
      expect(referencia).toBeDisabled();
      expect(referencia).toHaveAccessibleDescription(
        "Elegí un proveedor para cargar la referencia.",
      );

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "acme");
      expect(referencia).toBeEnabled();
      expect(referencia).not.toHaveAccessibleDescription();
    });

    describe("foco inicial en el título", () => {
      const original = window.matchMedia;
      afterEach(() => {
        window.matchMedia = original;
      });
      const withPointer = (pointer: "fine" | "coarse") => {
        window.matchMedia = ((query: string) => ({
          matches: query === `(pointer: ${pointer})`,
        })) as typeof window.matchMedia;
      };

      it("con mouse el título arranca enfocado", () => {
        withPointer("fine");
        render(<CreateTicketForm />);

        expect(screen.getByLabelText("Título")).toHaveFocus();
      });

      it("con pantalla táctil no se enfoca, para no abrir el teclado de golpe", () => {
        withPointer("coarse");
        render(<CreateTicketForm />);

        expect(screen.getByLabelText("Título")).not.toHaveFocus();
      });

      it("sin `matchMedia` (jsdom) no se enfoca y no falla", () => {
        window.matchMedia = undefined as unknown as typeof window.matchMedia;
        render(<CreateTicketForm />);

        expect(screen.getByLabelText("Título")).not.toHaveFocus();
      });
    });
  });

  describe("mientras crea", () => {
    it("el botón dice «Creando…» y no deja enviar otra vez", async () => {
      let finish: (ticket: typeof created) => void = () => undefined;
      mocks.create.mockImplementation(
        () => new Promise<typeof created>((resolve) => (finish = resolve)),
      );
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Sin red");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByRole("button", { name: "Creando…" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Crear ticket" })).not.toBeInTheDocument();

      finish(created);
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    });
  });

  describe("validaciones", () => {
    it("pide título y prioridad, y no envía", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "   ");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(
        await screen.findByText("El título es obligatorio (hasta 200 caracteres)."),
      ).toBeInTheDocument();
      expect(screen.getByText("Elegí una prioridad.")).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("rechaza una fecha de recepción futura", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Impresora");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      fireEvent.change(screen.getByLabelText("Fecha de recepción"), {
        target: { value: "2999-01-01" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(
        await screen.findByText("Ingresá una fecha válida, de hoy o anterior."),
      ).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("proveedor y referencia externa", () => {
    it("la referencia está deshabilitada sin proveedor y se habilita al elegir uno", async () => {
      render(<CreateTicketForm />);
      expect(screen.getByLabelText("Referencia externa")).toBeDisabled();

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "acme");

      expect(screen.getByLabelText("Referencia externa")).toBeEnabled();
    });

    it("manda la referencia normalizada: 019092/2026 se guarda como 19092/2026", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Falla del proveedor");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "acme");
      await userEvent.type(screen.getByLabelText("Referencia externa"), "019092/2026");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        proveedorId: "acme",
        referenciaExterna: "19092/2026",
      });
    });

    it("quitar el proveedor vacía y deshabilita la referencia", async () => {
      render(<CreateTicketForm />);
      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "acme");
      await userEvent.type(screen.getByLabelText("Referencia externa"), "5/2026");

      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "");

      expect(screen.getByLabelText("Referencia externa")).toBeDisabled();
      expect(screen.getByLabelText("Referencia externa")).toHaveValue("");
    });

    it.each(["abc", "000/2026", "5/1999"])("rechaza la referencia %s", async (value) => {
      render(<CreateTicketForm />);
      await userEvent.type(screen.getByLabelText("Título"), "Falla");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(screen.getByLabelText("Proveedor"), "acme");
      await userEvent.type(screen.getByLabelText("Referencia externa"), value);

      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByText(/Usá el formato número\/año/)).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  it("si la API rechaza, muestra su mensaje y no navega", async () => {
    mocks.create.mockRejectedValue(
      new ORPCError("CONFLICT", {
        status: 409,
        message: "Esa referencia ya está cargada en el ticket TE-000013",
      }),
    );
    render(<CreateTicketForm />);

    await userEvent.type(screen.getByLabelText("Título"), "Falla");
    await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
    await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esa referencia ya está cargada en el ticket TE-000013",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
