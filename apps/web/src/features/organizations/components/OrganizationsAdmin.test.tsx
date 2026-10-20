import { ORPCError } from "@orpc/client";
import type { Organization } from "@syc/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: { data: undefined, isPending: false, isError: false } as {
    data: Organization[] | undefined;
    isPending: boolean;
    isError: boolean;
  },
  create: vi.fn(),
  rename: vi.fn(),
  setActive: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../hooks/useOrganizations", () => ({ useOrganizations: () => mocks.list }));
vi.mock("../hooks/useOrganizationMutations", () => ({
  useCreateOrganization: () => ({ mutateAsync: mocks.create }),
  useRenameOrganization: () => ({ mutateAsync: mocks.rename }),
  useSetOrganizationActive: () => ({ mutate: mocks.setActive }),
  useRemoveOrganization: () => ({ mutate: mocks.remove }),
}));

import { OrganizationsAdmin } from "./OrganizationsAdmin";

const organizations: Organization[] = [
  { id: "red", nombre: "Redes", activo: true, agentes: 3 },
  { id: "tec", nombre: "Técnico", activo: true, agentes: 0 },
  { id: "arc", nombre: "Archivo", activo: false, agentes: 1 },
];

const show = (
  data: Organization[] | undefined = organizations,
  extra: Partial<typeof mocks.list> = {},
) => {
  mocks.list = { data, isPending: false, isError: false, ...extra };
  return render(<OrganizationsAdmin />);
};
const row = (nombre: string) => within(screen.getByTestId(`org-row-${nombre}`));

describe("OrganizationsAdmin", () => {
  beforeEach(() => {
    for (const mock of [mocks.create, mocks.rename, mocks.setActive, mocks.remove])
      mock.mockReset();
    mocks.create.mockResolvedValue(undefined);
    mocks.rename.mockResolvedValue(undefined);
  });

  describe("pantalla", () => {
    it("tiene el título, la bajada y la acción de alta", () => {
      show();

      expect(screen.getByRole("heading", { level: 1, name: "Departamentos" })).toBeInTheDocument();
      expect(
        screen.getByText("Equipos que atienden los tickets. Solo administradores."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Nuevo departamento" })).toBeInTheDocument();
    });

    it("la lista está en una región con nombre, con las cuatro columnas", () => {
      show();

      const region = screen.getByRole("region", { name: "Listado de departamentos" });
      expect(
        within(region)
          .getAllByRole("columnheader")
          .map((h) => h.textContent),
      ).toEqual(["Nombre", "Agentes asignados", "Activo", "Acciones"]);
    });

    it("muestra cada departamento con su cantidad de agentes", () => {
      show();

      expect(row("Redes").getByText("3")).toBeInTheDocument();
      expect(row("Técnico").getByText("0")).toBeInTheDocument();
      expect(screen.getAllByTestId(/^org-row-/)).toHaveLength(3);
    });

    it("un departamento desactivado se ve atenuado", () => {
      show();

      expect(row("Archivo").getByText("Archivo")).toHaveClass("text-muted-foreground");
      expect(row("Redes").getByText("Redes")).toHaveClass("text-foreground");
    });

    it("mientras carga, y si falla, lo avisa", () => {
      const { unmount } = show(undefined, { isPending: true });
      expect(screen.getByText("Cargando departamentos…")).toBeInTheDocument();
      unmount();

      show(undefined, { isError: true });
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No se pudieron cargar los departamentos.",
      );
    });

    it("sin departamentos lo dice y no dibuja la tabla", () => {
      show([]);

      expect(screen.getByText("Todavía no hay departamentos.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("activo", () => {
    it("cada fila tiene un interruptor con el nombre del departamento y el estado escrito al lado", () => {
      show();

      expect(
        row("Redes").getByRole("switch", { name: "Departamento «Redes» activo" }),
      ).toBeChecked();
      expect(row("Redes").getByText("Activo")).toBeInTheDocument();
      expect(
        row("Archivo").getByRole("switch", { name: "Departamento «Archivo» activo" }),
      ).not.toBeChecked();
      expect(row("Archivo").getByText("Desactivado")).toBeInTheDocument();
    });

    it("al tocarlo pide el cambio contrario", async () => {
      show();

      await userEvent.click(row("Redes").getByRole("switch"));
      await userEvent.click(row("Archivo").getByRole("switch"));

      expect(mocks.setActive).toHaveBeenNthCalledWith(
        1,
        { organizationId: "red", activo: false },
        expect.any(Object),
      );
      expect(mocks.setActive).toHaveBeenNthCalledWith(
        2,
        { organizationId: "arc", activo: true },
        expect.any(Object),
      );
    });

    it("si la API rechaza el cambio, lo muestra como alerta", async () => {
      mocks.setActive.mockImplementation((_input, options) =>
        options.onError(
          new ORPCError("CONFLICT", { status: 409, message: "No se puede desactivar" }),
        ),
      );
      show();

      await userEvent.click(row("Redes").getByRole("switch"));

      expect(await screen.findByRole("alert")).toHaveTextContent("No se puede desactivar");
    });

    it("se puede operar con el teclado", async () => {
      show();

      row("Redes").getByRole("switch").focus();
      await userEvent.keyboard(" ");

      expect(mocks.setActive).toHaveBeenCalledTimes(1);
    });
  });

  describe("alta", () => {
    it("«Nuevo departamento» abre el panel con el campo Nombre enfocado", async () => {
      show();

      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));

      const panel = await screen.findByRole("dialog", { name: "Nuevo departamento" });
      expect(within(panel).getByRole("textbox", { name: "Nombre" })).toHaveFocus();
      expect(
        within(panel).getByText("El nombre no puede repetirse entre departamentos."),
      ).toBeInTheDocument();
    });

    it("crea con el nombre y cierra el panel", async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));

      await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "  Soporte  ");
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(mocks.create.mock.calls[0]?.[0]).toEqual({ nombre: "Soporte" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("sin nombre pide uno y no envía", async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));

      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      const campo = screen.getByRole("textbox", { name: "Nombre" });
      expect(
        await screen.findByText("El nombre es obligatorio (hasta 120 caracteres)."),
      ).toBeVisible();
      expect(campo).toHaveAttribute("aria-invalid", "true");
      expect(campo).toHaveAccessibleDescription(/El nombre es obligatorio/);
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("el nombre es obligatorio y no admite más de 120 caracteres", async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));

      const campo = screen.getByRole("textbox", { name: "Nombre" });
      expect(campo).toHaveAttribute("aria-required", "true");
      expect(campo).toHaveAttribute("maxlength", "120");
    });

    it("si la API rechaza, muestra su mensaje en el panel y no lo cierra", async () => {
      mocks.create.mockRejectedValue(
        new ORPCError("CONFLICT", {
          status: 409,
          message: "Ya existe un departamento con ese nombre",
        }),
      );
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Redes");

      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Ya existe un departamento con ese nombre",
      );
      expect(screen.getByRole("dialog", { name: "Nuevo departamento" })).toBeInTheDocument();
    });

    it("«Cancelar» y Escape cierran el panel sin crear", async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("al volver a abrirlo, el campo está vacío", async () => {
      show();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Algo");
      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      await userEvent.click(screen.getByRole("button", { name: "Nuevo departamento" }));

      expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveValue("");
    });
  });

  describe("renombrar", () => {
    it("abre el panel con el nombre actual y guarda el nuevo", async () => {
      show();

      await userEvent.click(row("Redes").getByRole("button", { name: "Renombrar «Redes»" }));

      const panel = await screen.findByRole("dialog", { name: "Renombrar departamento" });
      const campo = within(panel).getByRole("textbox", { name: "Nombre" });
      expect(campo).toHaveValue("Redes");
      await userEvent.clear(campo);
      await userEvent.type(campo, "Redes y comunicaciones");
      await userEvent.click(within(panel).getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(mocks.rename).toHaveBeenCalledTimes(1));
      expect(mocks.rename.mock.calls[0]?.[0]).toEqual({
        organizationId: "red",
        nombre: "Redes y comunicaciones",
      });
    });
  });

  describe("eliminar", () => {
    it("pide confirmar, con el botón en rojo, y recién ahí elimina", async () => {
      show();

      await userEvent.click(row("Técnico").getByRole("button", { name: "Eliminar «Técnico»" }));

      const confirmar = await screen.findByRole("alertdialog");
      expect(confirmar).toHaveTextContent('Se eliminará "Técnico" de forma definitiva.');
      expect(mocks.remove).not.toHaveBeenCalled();
      const boton = within(confirmar).getByRole("button", { name: "Eliminar" });
      expect(boton).toHaveClass("bg-destructive");
      await userEvent.click(boton);

      expect(mocks.remove).toHaveBeenCalledWith({ organizationId: "tec" }, expect.any(Object));
    });

    it("«Cancelar» no elimina", async () => {
      show();
      await userEvent.click(row("Técnico").getByRole("button", { name: "Eliminar «Técnico»" }));

      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }),
      );

      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("si la API rechaza (tiene agentes o historia), muestra el mensaje", async () => {
      mocks.remove.mockImplementation((_input, options) =>
        options.onError(
          new ORPCError("CONFLICT", {
            status: 409,
            message: "El departamento tiene agentes asignados",
          }),
        ),
      );
      show();
      await userEvent.click(row("Redes").getByRole("button", { name: "Eliminar «Redes»" }));

      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "El departamento tiene agentes asignados",
      );
    });
  });

  it("cada botón de ícono tiene el nombre del departamento en su etiqueta", () => {
    show();

    expect(row("Redes").getByRole("button", { name: "Renombrar «Redes»" })).toHaveAttribute(
      "title",
      "Renombrar «Redes»",
    );
    expect(row("Redes").getByRole("button", { name: "Eliminar «Redes»" })).toHaveAttribute(
      "title",
      "Eliminar «Redes»",
    );
  });
});
