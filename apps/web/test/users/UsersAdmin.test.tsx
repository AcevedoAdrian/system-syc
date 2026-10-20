import { ORPCError } from "@orpc/client";
import type { Organization, User } from "@syc/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  users: { data: undefined, isPending: false, isError: false } as {
    data: User[] | undefined;
    isPending: boolean;
    isError: boolean;
  },
  me: { id: "u0" },
  departments: [
    { id: "red", nombre: "Redes", activo: true, agentes: 2 },
    { id: "tec", nombre: "Técnico", activo: true, agentes: 1 },
    { id: "arc", nombre: "Archivo", activo: false, agentes: 0 },
  ] as Organization[],
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock("@/features/users/hooks/useUsers", () => ({ useUsers: () => mocks.users }));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: mocks.me }),
}));
vi.mock("@/features/organizations/hooks/useOrganizations", () => ({
  useOrganizations: () => ({ data: mocks.departments }),
}));
vi.mock("@/features/users/hooks/useUserMutations", () => ({
  useCreateUser: () => ({ mutateAsync: mocks.create }),
  useUpdateUser: () => ({ mutateAsync: mocks.update }),
  useSetUserActive: () => ({ mutate: mocks.setActive }),
  useResetUserPassword: () => ({ mutateAsync: mocks.resetPassword }),
}));

// Los selectores de Radix se prueban aparte: acá son `<select>` nativos para ejercitar los formularios.
vi.mock("@/features/users/components/RoleSelect", () => ({
  roleLabels: { agente: "Agente", admin: "Administrador" },
  RoleSelect: ({
    id,
    value,
    onChange,
    ...aria
  }: {
    id: string;
    value: string;
    onChange: (v: "agente" | "admin") => void;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as "agente" | "admin")}
      {...aria}
    >
      <option value="agente">Agente</option>
      <option value="admin">Administrador</option>
    </select>
  ),
}));
vi.mock("@/features/users/components/DepartmentSelect", () => ({
  DepartmentSelect: ({
    id,
    value,
    onChange,
    departments,
    placeholder,
    ...aria
  }: {
    id: string;
    value: string | undefined;
    onChange: (v: string) => void;
    departments: Organization[];
    placeholder?: string;
  }) => (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-required={(aria as Record<string, unknown>)["aria-required"] as boolean | undefined}
    >
      <option value="">{placeholder ?? "Elegí un departamento"}</option>
      {departments
        .filter((d) => d.activo)
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
    </select>
  ),
}));

import { UsersAdmin } from "@/features/users/components/UsersAdmin";

const ana: User = {
  id: "u1",
  username: "ana",
  name: "Ana Pérez",
  email: "ana@ejemplo.com",
  role: "agente",
  activo: true,
  department: { id: "red", nombre: "Redes" },
};
const root: User = {
  id: "u0",
  username: "root",
  name: "Administrador",
  email: null,
  role: "admin",
  activo: true,
  department: null,
};
const luis: User = {
  id: "u2",
  username: "luis.g",
  name: "Luis Gómez",
  email: null,
  role: "agente",
  activo: false,
  department: { id: "tec", nombre: "Técnico" },
};

const show = (
  data: User[] | undefined = [root, ana, luis],
  extra: Partial<typeof mocks.users> = {},
) => {
  mocks.users = { data, isPending: false, isError: false, ...extra };
  return render(<UsersAdmin />);
};
const row = (username: string) => within(screen.getByTestId(`user-row-${username}`));

describe("UsersAdmin", () => {
  beforeEach(() => {
    for (const mock of [mocks.create, mocks.update, mocks.setActive, mocks.resetPassword])
      mock.mockReset();
    for (const mock of [mocks.create, mocks.update, mocks.resetPassword])
      mock.mockResolvedValue(undefined);
    mocks.me = { id: "u0" };
  });

  describe("pantalla", () => {
    it("tiene el título, la bajada y la acción de alta", () => {
      show();

      expect(screen.getByRole("heading", { level: 1, name: "Usuarios" })).toBeInTheDocument();
      expect(
        screen.getByText(
          "Cuentas de acceso. Los agentes pertenecen a un departamento; los administradores ven todo.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Nuevo usuario" })).toBeInTheDocument();
    });

    it("la lista tiene las siete columnas", () => {
      show();

      const region = screen.getByRole("region", { name: "Listado de usuarios" });
      expect(
        within(region)
          .getAllByRole("columnheader")
          .map((h) => h.textContent),
      ).toEqual(["Usuario", "Nombre", "Rol", "Departamento", "Email", "Activo", "Acciones"]);
    });

    it("muestra los datos de cada usuario, con — donde no hay", () => {
      show();

      expect(row("ana").getByText("ana")).toHaveClass("font-mono");
      expect(row("ana").getByText("Ana Pérez")).toBeInTheDocument();
      expect(row("ana").getByText("Agente")).toBeInTheDocument();
      expect(row("ana").getByText("Redes")).toBeInTheDocument();
      expect(row("ana").getByText("ana@ejemplo.com")).toBeInTheDocument();
      expect(
        row("root").getByText("Administrador", { selector: "span.text-body" }),
      ).toBeInTheDocument();
      // El admin no tiene departamento y su email es el interno: dos «—».
      expect(row("root").getAllByText("—")).toHaveLength(2);
    });

    it("un usuario desactivado se ve atenuado", () => {
      show();

      expect(row("luis.g").getByText("luis.g")).toHaveClass("text-muted-foreground");
      expect(row("luis.g").getByText("Luis Gómez")).toHaveClass("text-muted-foreground");
      expect(row("ana").getByText("ana")).toHaveClass("text-foreground");
    });

    it("mientras carga, y si falla, lo avisa", () => {
      const { unmount } = show(undefined, { isPending: true });
      expect(screen.getByText("Cargando usuarios…")).toBeInTheDocument();
      unmount();

      show(undefined, { isError: true });
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los usuarios.");
    });
  });

  describe("activo", () => {
    it("cada fila tiene un interruptor con el usuario en su etiqueta y el estado escrito", () => {
      show();

      expect(row("ana").getByRole("switch", { name: "Usuario «ana» activo" })).toBeChecked();
      expect(row("ana").getByText("Activo")).toBeInTheDocument();
      expect(
        row("luis.g").getByRole("switch", { name: "Usuario «luis.g» activo" }),
      ).not.toBeChecked();
      expect(row("luis.g").getByText("Desactivado")).toBeInTheDocument();
    });

    it("al tocarlo pide el cambio contrario", async () => {
      show();

      await userEvent.click(row("ana").getByRole("switch"));
      await userEvent.click(row("luis.g").getByRole("switch"));

      expect(mocks.setActive).toHaveBeenNthCalledWith(
        1,
        { userId: "u1", activo: false },
        expect.any(Object),
      );
      expect(mocks.setActive).toHaveBeenNthCalledWith(
        2,
        { userId: "u2", activo: true },
        expect.any(Object),
      );
    });

    it("nadie puede desactivarse a sí mismo: el interruptor propio queda deshabilitado y lo explica", async () => {
      show();

      const propio = row("root").getByRole("switch");
      expect(propio).toBeDisabled();
      expect(propio).toHaveAttribute("title", "No podés desactivarte a vos mismo");
      await userEvent.click(propio);

      expect(mocks.setActive).not.toHaveBeenCalled();
    });

    it("si el usuario propio estuviera desactivado, podría reactivarse", () => {
      mocks.me = { id: "u2" };
      show();

      expect(row("luis.g").getByRole("switch")).toBeEnabled();
    });

    it("si la API rechaza el cambio (último administrador), lo muestra como alerta", async () => {
      mocks.setActive.mockImplementation((_input, options) =>
        options.onError(
          new ORPCError("CONFLICT", {
            status: 409,
            message: "Debe quedar al menos un administrador activo",
          }),
        ),
      );
      show();

      await userEvent.click(row("ana").getByRole("switch"));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Debe quedar al menos un administrador activo",
      );
    });
  });

  describe("alta", () => {
    const open = async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
      return screen.findByRole("dialog", { name: "Nuevo usuario" });
    };

    it("abre el panel con Usuario enfocado y los campos obligatorios marcados", async () => {
      const panel = await open();

      expect(within(panel).getByRole("textbox", { name: "Usuario" })).toHaveFocus();
      for (const name of ["Usuario", "Nombre", "Rol", "Departamento"]) {
        expect(within(panel).getByLabelText(name)).toHaveAttribute("aria-required", "true");
      }
      expect(within(panel).getByLabelText("Contraseña")).toHaveAttribute("aria-required", "true");
      expect(within(panel).getByLabelText("Email (opcional)")).not.toHaveAttribute("aria-required");
    });

    it("el usuario va en tipografía monoespaciada, con tope de 30 caracteres, y explica el formato", async () => {
      const panel = await open();

      const usuario = within(panel).getByLabelText("Usuario");
      expect(usuario).toHaveClass("font-mono");
      expect(usuario).toHaveAttribute("maxlength", "30");
      expect(usuario).toHaveAccessibleDescription(
        "De 3 a 30 caracteres: letras, números, guion bajo y punto.",
      );
    });

    it("crea un agente con su departamento y cierra el panel", async () => {
      const panel = await open();

      await userEvent.type(within(panel).getByLabelText("Usuario"), "marta");
      await userEvent.type(within(panel).getByLabelText("Nombre"), "Marta Díaz");
      await userEvent.type(within(panel).getByLabelText("Contraseña"), "clave-1234");
      await userEvent.selectOptions(within(panel).getByLabelText("Departamento"), "tec");
      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
        username: "marta",
        name: "Marta Díaz",
        password: "clave-1234",
        role: "agente",
        organizationId: "tec",
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("un administrador no tiene departamento: el campo desaparece", async () => {
      const panel = await open();
      expect(within(panel).getByLabelText("Departamento")).toBeInTheDocument();

      await userEvent.selectOptions(within(panel).getByLabelText("Rol"), "admin");

      expect(within(panel).queryByLabelText("Departamento")).not.toBeInTheDocument();
    });

    it("crea un administrador sin departamento", async () => {
      const panel = await open();
      await userEvent.type(within(panel).getByLabelText("Usuario"), "jefe");
      await userEvent.type(within(panel).getByLabelText("Nombre"), "Jefe de área");
      await userEvent.type(within(panel).getByLabelText("Contraseña"), "clave-1234");
      await userEvent.selectOptions(within(panel).getByLabelText("Rol"), "admin");

      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      const sent = mocks.create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(sent.role).toBe("admin");
      expect(sent.organizationId).toBeUndefined();
    });

    it("un agente sin departamento no se envía y lo pide", async () => {
      const panel = await open();
      await userEvent.type(within(panel).getByLabelText("Usuario"), "marta");
      await userEvent.type(within(panel).getByLabelText("Nombre"), "Marta Díaz");
      await userEvent.type(within(panel).getByLabelText("Contraseña"), "clave-1234");

      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      expect(await within(panel).findByText("Un agente debe tener un departamento.")).toBeVisible();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("valida usuario, nombre y contraseña y ata cada error a su campo", async () => {
      const panel = await open();

      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      expect(await within(panel).findByText("El usuario no es válido.")).toBeVisible();
      expect(within(panel).getByText("El nombre es obligatorio.")).toBeVisible();
      expect(within(panel).getByText("Debe tener entre 8 y 128 caracteres.")).toBeVisible();
      expect(within(panel).getByLabelText("Usuario")).toHaveAttribute("aria-invalid", "true");
      expect(within(panel).getByLabelText("Contraseña")).toHaveAccessibleDescription(
        /Debe tener entre 8 y 128 caracteres/,
      );
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("un email inválido no se envía", async () => {
      const panel = await open();
      await userEvent.type(within(panel).getByLabelText("Email (opcional)"), "no-es-un-email");

      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      expect(await within(panel).findByText("El email no es válido.")).toBeVisible();
    });

    it("solo ofrece los departamentos activos", async () => {
      const panel = await open();

      const opciones = within(within(panel).getByLabelText("Departamento"))
        .getAllByRole("option")
        .map((o) => o.textContent);
      expect(opciones).toEqual(["Elegí un departamento", "Redes", "Técnico"]);
    });

    it("si la API rechaza (usuario repetido), muestra el mensaje y deja abierto el panel", async () => {
      mocks.create.mockRejectedValue(
        new ORPCError("CONFLICT", { status: 409, message: "Ya existe un usuario con ese nombre" }),
      );
      const panel = await open();
      await userEvent.type(within(panel).getByLabelText("Usuario"), "ana");
      await userEvent.type(within(panel).getByLabelText("Nombre"), "Otra Ana");
      await userEvent.type(within(panel).getByLabelText("Contraseña"), "clave-1234");
      await userEvent.selectOptions(within(panel).getByLabelText("Departamento"), "red");

      await userEvent.click(within(panel).getByRole("button", { name: "Crear usuario" }));

      expect(await within(panel).findByRole("alert")).toHaveTextContent(
        "Ya existe un usuario con ese nombre",
      );
      expect(screen.getByRole("dialog", { name: "Nuevo usuario" })).toBeInTheDocument();
    });

    it("«Cancelar» y Escape cierran el panel sin crear", async () => {
      await open();
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Nuevo usuario" }));
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe("edición", () => {
    const open = async (username = "ana") => {
      show();
      await userEvent.click(row(username).getByRole("button", { name: `Editar «${username}»` }));
      return screen.findByRole("dialog", { name: "Editar usuario" });
    };

    it("abre el panel con los datos actuales", async () => {
      const panel = await open();

      expect(within(panel).getByLabelText("Usuario")).toHaveValue("ana");
      expect(within(panel).getByLabelText("Nombre")).toHaveValue("Ana Pérez");
      expect(within(panel).getByLabelText("Email (opcional)")).toHaveValue("ana@ejemplo.com");
      expect(within(panel).getByLabelText("Rol")).toHaveValue("agente");
      expect(within(panel).getByLabelText("Departamento")).toHaveValue("red");
    });

    it("avisa que cambiar el usuario cambia cómo inicia sesión", async () => {
      const panel = await open();

      expect(within(panel).getByLabelText("Usuario")).toHaveAccessibleDescription(
        "Cambiarlo modifica el nombre con el que la persona inicia sesión.",
      );
    });

    it("guarda con el id del usuario", async () => {
      const panel = await open();
      const nombre = within(panel).getByLabelText("Nombre");
      await userEvent.clear(nombre);
      await userEvent.type(nombre, "Ana P.");

      await userEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
        userId: "u1",
        name: "Ana P.",
        role: "agente",
        organizationId: "red",
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("pasar a administrador quita el departamento", async () => {
      const panel = await open();

      await userEvent.selectOptions(within(panel).getByLabelText("Rol"), "admin");
      expect(within(panel).queryByLabelText("Departamento")).not.toBeInTheDocument();
      await userEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      const sent = mocks.update.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(sent).toMatchObject({ userId: "u1", role: "admin" });
      expect(sent.organizationId).toBeUndefined();
    });

    it("un email vacío vuelve al interno (null)", async () => {
      const panel = await open();

      await userEvent.clear(within(panel).getByLabelText("Email (opcional)"));
      await userEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
      expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ email: null });
    });

    it("un agente de un departamento desactivado conserva su lugar y lo dice", async () => {
      mocks.departments = [
        ...mocks.departments.filter((d) => d.id !== "tec"),
        { id: "tec", nombre: "Técnico", activo: false, agentes: 1 },
      ];
      const panel = await open("luis.g");

      const departamento = within(panel).getByLabelText("Departamento");
      expect(within(departamento).getByText("Técnico (desactivado)")).toBeInTheDocument();
      mocks.departments = mocks.departments.map((d) =>
        d.id === "tec" ? { ...d, activo: true } : d,
      );
    });

    it("si la API rechaza, muestra el mensaje en el panel", async () => {
      mocks.update.mockRejectedValue(
        new ORPCError("CONFLICT", { status: 409, message: "Ese usuario ya existe" }),
      );
      const panel = await open();

      await userEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

      expect(await within(panel).findByRole("alert")).toHaveTextContent("Ese usuario ya existe");
    });
  });

  describe("resetear contraseña", () => {
    const open = async () => {
      show();
      await userEvent.click(
        row("ana").getByRole("button", { name: "Resetear contraseña de «ana»" }),
      );
      return screen.findByRole("dialog", { name: "Resetear contraseña" });
    };

    it("abre el panel con el nombre de la persona y el campo enfocado", async () => {
      const panel = await open();

      expect(within(panel).getByText("Ana Pérez")).toBeInTheDocument();
      expect(within(panel).getByText(/Se cerrarán sus sesiones activas/)).toBeInTheDocument();
      expect(within(panel).getByLabelText("Nueva contraseña")).toHaveFocus();
    });

    it("manda el id del usuario y la contraseña nueva", async () => {
      const panel = await open();

      await userEvent.type(within(panel).getByLabelText("Nueva contraseña"), "otra-clave-9");
      await userEvent.click(within(panel).getByRole("button", { name: "Resetear contraseña" }));

      await waitFor(() => expect(mocks.resetPassword).toHaveBeenCalledTimes(1));
      expect(mocks.resetPassword.mock.calls[0]?.[0]).toEqual({
        userId: "u1",
        password: "otra-clave-9",
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("una contraseña corta no se envía", async () => {
      const panel = await open();

      await userEvent.type(within(panel).getByLabelText("Nueva contraseña"), "corta");
      await userEvent.click(within(panel).getByRole("button", { name: "Resetear contraseña" }));

      expect(await within(panel).findByText("Debe tener entre 8 y 128 caracteres.")).toBeVisible();
      expect(within(panel).getByLabelText("Nueva contraseña")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(mocks.resetPassword).not.toHaveBeenCalled();
    });

    it("si la API rechaza, muestra el mensaje", async () => {
      mocks.resetPassword.mockRejectedValue(
        new ORPCError("BAD_REQUEST", { status: 400, message: "Contraseña no válida" }),
      );
      const panel = await open();
      await userEvent.type(within(panel).getByLabelText("Nueva contraseña"), "otra-clave-9");

      await userEvent.click(within(panel).getByRole("button", { name: "Resetear contraseña" }));

      expect(await within(panel).findByRole("alert")).toHaveTextContent("Contraseña no válida");
    });
  });

  it("los botones de ícono llevan el usuario en su etiqueta", () => {
    show();

    expect(row("ana").getByRole("button", { name: "Editar «ana»" })).toHaveAttribute(
      "title",
      "Editar «ana»",
    );
    expect(
      row("ana").getByRole("button", { name: "Resetear contraseña de «ana»" }),
    ).toBeInTheDocument();
  });
});
