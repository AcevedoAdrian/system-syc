import { ORPCError } from "@orpc/client";
import { hoyArgentina, type User } from "@syc/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    modulos: [{ id: "serv", nombre: "Servidores" }],
  } as Record<string, { id: string; nombre: string }[]>,
}));

// Los puntos de color salen de los catálogos; su lógica tiene sus propios tests.
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({ useCatalog: () => ({ data: [] }) }));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: mocks.user }),
}));
vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: mocks.departments }),
}));
vi.mock("@/features/tickets/hooks/useTicketMutations", () => ({
  useCreateTicket: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

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
vi.mock("@/features/tickets/components/CatalogOptionSelect", () => ({
  CatalogOptionSelect: ({
    id,
    ruta,
    value,
    onChange,
    emptyLabel,
    placeholder,
    departamentoId,
    ...aria
  }: {
    id: string;
    ruta: string;
    value: string;
    onChange: (v: string) => void;
    emptyLabel?: string;
    placeholder?: string;
    departamentoId?: string;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-departamento={departamentoId}
      {...aria}
    >
      <option value="">{emptyLabel ?? placeholder}</option>
      {(mocks.options[ruta] ?? []).map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  ),
}));

import { CreateTicketForm } from "@/features/tickets/components/CreateTicketForm";

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

  it("no pide estado, número, área, edificio, tipo ni nada del cierre", () => {
    render(<CreateTicketForm />);

    for (const label of [
      "Estado",
      "Número",
      "Área",
      "Edificio",
      "Tipo",
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
      "Módulo",
      "Fecha de recepción",
      "Descripción",
      "Actuación simple",
      "Referencia externa",
      "N.º de factura",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole("combobox", { name: "Proveedor" })).toBeInTheDocument();
  });

  it("propone hoy como fecha de recepción, sin poder elegir una futura", () => {
    render(<CreateTicketForm />);

    const fecha = screen.getByLabelText("Fecha de recepción");
    expect(fecha).toHaveValue(hoyArgentina());
    expect(fecha).toHaveAttribute("max", hoyArgentina());
  });

  describe("diseño (SPEC 09, etapa 9.5)", () => {
    it("tiene dos secciones, «Datos del ticket» y «Proveedor», y no ofrece clasificación", () => {
      render(<CreateTicketForm />);

      expect(screen.getByRole("region", { name: "Datos del ticket" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Proveedor" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Clasificación" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "Solución y seguimiento" }),
      ).not.toBeInTheDocument();
    });

    it("cada campo está dentro de su sección", () => {
      render(<CreateTicketForm />);

      const datos = within(screen.getByRole("region", { name: "Datos del ticket" }));
      for (const label of [
        "Título",
        "Prioridad",
        "Fecha de recepción",
        "Descripción",
        "Actuación simple",
      ]) {
        expect(datos.getByLabelText(label)).toBeInTheDocument();
      }
      const proveedor = within(screen.getByRole("region", { name: "Proveedor" }));
      expect(proveedor.getByLabelText("Referencia externa")).toBeInTheDocument();
      expect(proveedor.getByLabelText("N.º de factura")).toBeInTheDocument();
      expect(proveedor.getByRole("combobox", { name: "Proveedor" })).toBeInTheDocument();
    });

    it("el título y la descripción cuentan sus caracteres", async () => {
      render(<CreateTicketForm />);
      expect(screen.getByText("0/200")).toBeInTheDocument();
      expect(screen.getByText("0/5000")).toBeInTheDocument();

      await userEvent.type(screen.getByLabelText("Título"), "Hola");
      await userEvent.type(screen.getByLabelText("Descripción"), "Detalle");

      expect(screen.getByText("4/200")).toBeInTheDocument();
      expect(screen.getByText("7/5000")).toBeInTheDocument();
    });

    it("el título no admite más de 200 caracteres", () => {
      render(<CreateTicketForm />);

      expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "200");
    });

    it("«Usar hoy» vuelve a poner la fecha de hoy", async () => {
      render(<CreateTicketForm />);
      const fecha = screen.getByLabelText("Fecha de recepción");
      fireEvent.change(fecha, { target: { value: "2020-01-01" } });
      expect(fecha).toHaveValue("2020-01-01");

      await userEvent.click(screen.getByRole("button", { name: "Usar hoy" }));

      expect(fecha).toHaveValue(hoyArgentina());
    });

    it("«Cancelar» es un enlace a la bandeja y no envía nada", async () => {
      render(<CreateTicketForm />);

      const cancelar = screen.getByRole("link", { name: "Cancelar" });
      expect(cancelar).toHaveAttribute("href", "/tickets");
      await userEvent.click(cancelar);

      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("las acciones van en una barra fija al pie, con «Crear ticket» al final", () => {
      render(<CreateTicketForm />);

      const crear = screen.getByRole("button", { name: "Crear ticket" });
      const barra = crear.parentElement as HTMLElement;
      expect(barra).toHaveClass("sticky", "bottom-0");
      expect(barra).toContainElement(screen.getByRole("link", { name: "Cancelar" }));
      expect(barra.lastElementChild).toBe(crear);
    });

    it("el error del servidor sale en la barra de acciones", async () => {
      mocks.create.mockRejectedValue(new Error("Falló"));
      render(<CreateTicketForm />);
      await userEvent.type(screen.getByLabelText("Título"), "Impresora");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");

      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      const alerta = await screen.findByRole("alert");
      expect(alerta.closest(".sticky")).not.toBeNull();
    });

    it("la actuación simple arranca con el año en curso y va en tipografía monoespaciada", () => {
      render(<CreateTicketForm />);

      const actuacion = screen.getByLabelText("Actuación simple");
      expect(actuacion).toHaveValue(`/${hoyArgentina().slice(0, 4)}`);
      expect(actuacion).not.toHaveAttribute("placeholder");
      expect(actuacion).toHaveClass("font-mono");
      expect(actuacion).toHaveAccessibleDescription("Escribí el número antes de la barra.");
    });

    it("al entrar al campo sin tocarlo, el cursor queda delante de la barra", async () => {
      render(<CreateTicketForm />);
      const actuacion = screen.getByLabelText<HTMLInputElement>("Actuación simple");

      actuacion.focus();
      await waitFor(() => expect(actuacion.selectionStart).toBe(0));
      expect(actuacion.selectionEnd).toBe(0);

      await userEvent.keyboard("1023");
      expect(actuacion).toHaveValue(`1023/${hoyArgentina().slice(0, 4)}`);
    });

    it("el agente ve por qué no puede cambiar el departamento", () => {
      render(<CreateTicketForm />);

      expect(screen.getByLabelText("Departamento")).toHaveAccessibleDescription(
        "Es el departamento de tu cuenta. No se puede cambiar.",
      );
    });

    it("el admin no ve esa explicación", () => {
      mocks.user = admin;
      render(<CreateTicketForm />);

      expect(screen.getByLabelText(/^Departamento/)).not.toHaveAccessibleDescription();
    });
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
        moduloId: null,
        fechaRecepcion: hoyArgentina(),
        actuacionSimple: null,
        proveedorId: null,
        referenciaExterna: null,
        numeroFactura: null,
      });
      await waitFor(() =>
        expect(mocks.navigate).toHaveBeenCalledWith({
          to: "/tickets/$ticketId",
          params: { ticketId: "t-77" },
        }),
      );
    });
  });

  describe("módulo (SPEC 11)", () => {
    it("el agente lo elige entre los de su departamento y se manda con el alta", async () => {
      render(<CreateTicketForm />);
      const modulo = screen.getByLabelText("Módulo");
      expect(modulo).toBeEnabled();
      expect(modulo).toHaveAttribute("data-departamento", "tec");

      await userEvent.type(screen.getByLabelText("Título"), "Servidor caído");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(modulo, "serv");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        departamentoId: "tec",
        moduloId: "serv",
      });
    });

    it("el admin sin departamento lo ve deshabilitado, con la pista", () => {
      mocks.user = admin;
      render(<CreateTicketForm />);

      const modulo = screen.getByLabelText("Módulo");
      expect(modulo).toBeDisabled();
      expect(modulo).toHaveAccessibleDescription("Elegí un departamento para cargar el módulo.");
    });

    it("al elegir un departamento se habilita y recibe ese departamento", async () => {
      mocks.user = admin;
      render(<CreateTicketForm />);

      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "red");

      const modulo = screen.getByLabelText("Módulo");
      expect(modulo).toBeEnabled();
      expect(modulo).toHaveAttribute("data-departamento", "red");
      expect(modulo).not.toHaveAccessibleDescription(
        "Elegí un departamento para cargar el módulo.",
      );
    });

    it("cambiar el departamento vacía el módulo elegido", async () => {
      mocks.user = admin;
      render(<CreateTicketForm />);
      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "tec");
      await userEvent.selectOptions(screen.getByLabelText("Módulo"), "serv");
      expect(screen.getByLabelText("Módulo")).toHaveValue("serv");

      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "red");

      expect(screen.getByLabelText("Módulo")).toHaveValue("");
    });

    it("volver a dejar el departamento sin elegir lo deshabilita y lo vacía", async () => {
      mocks.user = admin;
      render(<CreateTicketForm />);
      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "tec");
      await userEvent.selectOptions(screen.getByLabelText("Módulo"), "serv");

      await userEvent.selectOptions(screen.getByLabelText("Departamento"), "");

      expect(screen.getByLabelText("Módulo")).toBeDisabled();
      expect(screen.getByLabelText("Módulo")).toHaveValue("");
    });

    it("un 400 del servidor sobre el módulo se muestra bajo el campo", async () => {
      mocks.create.mockRejectedValue(
        new ORPCError("BAD_REQUEST", {
          status: 400,
          message: "El módulo no es del departamento del ticket",
        }),
      );
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Servidor caído");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(screen.getByLabelText("Módulo"), "serv");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByText("El módulo no es del departamento del ticket")).toBeVisible();
      expect(screen.getByLabelText("Módulo")).toHaveAccessibleDescription(
        expect.stringContaining("El módulo no es del departamento del ticket"),
      );
      expect(mocks.navigate).not.toHaveBeenCalled();
    });

    it("otro error del servidor sigue yendo a la barra de acciones", async () => {
      mocks.create.mockRejectedValue(
        new ORPCError("BAD_REQUEST", { status: 400, message: "La prioridad no existe" }),
      );
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Servidor caído");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("La prioridad no existe");
    });
  });

  describe("actuación simple en el envío", () => {
    it("con el número escrito manda número/año", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Impresora");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      screen.getByLabelText<HTMLInputElement>("Actuación simple").focus();
      await userEvent.keyboard("1023");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        actuacionSimple: `1023/${hoyArgentina().slice(0, 4)}`,
      });
    });

    it("si queda solo «/año» (también tras borrar lo escrito), manda null", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Impresora");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      const actuacion = screen.getByLabelText<HTMLInputElement>("Actuación simple");
      actuacion.focus();
      await userEvent.keyboard("1023{Backspace}{Backspace}{Backspace}{Backspace}");
      expect(actuacion).toHaveValue(`/${hoyArgentina().slice(0, 4)}`);
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({ actuacionSimple: null });
    });

    it("si el usuario cambia el año, lo manda tal cual", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Impresora");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.clear(screen.getByLabelText("Actuación simple"));
      await userEvent.type(screen.getByLabelText("Actuación simple"), "88/2024");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({ actuacionSimple: "88/2024" });
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

    it("un envío inválido muestra el aviso arriba del formulario, que se va al corregir", async () => {
      render(<CreateTicketForm />);
      expect(screen.queryByText("No se pudo crear el ticket.")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      const aviso = await screen.findByText("No se pudo crear el ticket.");
      expect(aviso.closest('[role="alert"]')).toHaveTextContent(
        "Los campos con error están marcados en rojo.",
      );

      await userEvent.type(screen.getByLabelText("Título"), "Impresora rota");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");

      await waitFor(() =>
        expect(screen.queryByText("No se pudo crear el ticket.")).not.toBeInTheDocument(),
      );
    });

    it("la referencia dice por qué está deshabilitada hasta elegir un proveedor", async () => {
      render(<CreateTicketForm />);

      const referencia = screen.getByLabelText("Referencia externa");
      expect(referencia).toBeDisabled();
      expect(referencia).toHaveAccessibleDescription(
        "Elegí un proveedor para cargar la referencia.",
      );

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");
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

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");

      expect(screen.getByLabelText("Referencia externa")).toBeEnabled();
    });

    it("manda la referencia normalizada: 019092/2026 se guarda como 19092/2026", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Falla del proveedor");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");
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
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");
      await userEvent.type(screen.getByLabelText("Referencia externa"), "5/2026");

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "");

      expect(screen.getByLabelText("Referencia externa")).toBeDisabled();
      expect(screen.getByLabelText("Referencia externa")).toHaveValue("");
    });

    it.each(["abc", "000/2026", "5/1999"])("rechaza la referencia %s", async (value) => {
      render(<CreateTicketForm />);
      await userEvent.type(screen.getByLabelText("Título"), "Falla");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");
      await userEvent.type(screen.getByLabelText("Referencia externa"), value);

      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByText(/Usá el formato número\/año/)).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("número de factura (SPEC 10)", () => {
    const elegirProveedor = () =>
      userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "acme");

    it("está deshabilitado sin proveedor, dice por qué y se habilita al elegir uno", async () => {
      render(<CreateTicketForm />);

      const factura = screen.getByLabelText("N.º de factura");
      expect(factura).toBeDisabled();
      expect(factura).toHaveAccessibleDescription("Elegí un proveedor para cargar la factura.");

      await elegirProveedor();
      expect(factura).toBeEnabled();
      expect(factura).not.toHaveAccessibleDescription();
    });

    it("manda la factura recortada y sin referencia externa", async () => {
      render(<CreateTicketForm />);

      await userEvent.type(screen.getByLabelText("Título"), "Falla del proveedor");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await elegirProveedor();
      await userEvent.type(screen.getByLabelText("N.º de factura"), "  0003-00004567  ");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        proveedorId: "acme",
        referenciaExterna: null,
        numeroFactura: "0003-00004567",
      });
    });

    it("quitar el proveedor vacía y deshabilita la factura, y no se envía", async () => {
      render(<CreateTicketForm />);
      await elegirProveedor();
      await userEvent.type(screen.getByLabelText("N.º de factura"), "A-12");

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Proveedor" }), "");

      expect(screen.getByLabelText("N.º de factura")).toBeDisabled();
      expect(screen.getByLabelText("N.º de factura")).toHaveValue("");

      await userEvent.type(screen.getByLabelText("Título"), "Falla");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({ numeroFactura: null });
    });

    it("rechaza una factura de más de 50 caracteres y lo dice bajo el campo", async () => {
      render(<CreateTicketForm />);
      await userEvent.type(screen.getByLabelText("Título"), "Falla");
      await userEvent.selectOptions(screen.getByLabelText("Prioridad"), "alta");
      await elegirProveedor();
      fireEvent.change(screen.getByLabelText("N.º de factura"), {
        target: { value: "a".repeat(51) },
      });

      await userEvent.click(screen.getByRole("button", { name: "Crear ticket" }));

      expect(await screen.findByText("Hasta 50 caracteres.")).toBeInTheDocument();
      expect(screen.getByLabelText("N.º de factura")).toBeInvalid();
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
