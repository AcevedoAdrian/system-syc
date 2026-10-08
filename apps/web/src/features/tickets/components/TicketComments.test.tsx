import { ORPCError } from "@orpc/client";
import type { Comment } from "@syc/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "agente" as "admin" | "agente",
  list: { data: undefined, isPending: true, isError: false } as {
    data: Comment[] | undefined;
    isPending: boolean;
    isError: boolean;
  },
  create: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/features/auth/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: { role: mocks.role } }),
}));
vi.mock("../hooks/useTicketComments", () => ({ useTicketComments: () => mocks.list }));
vi.mock("../hooks/useCommentMutations", () => ({
  useCreateComment: () => ({ mutateAsync: mocks.create }),
  useRemoveComment: () => ({ mutateAsync: mocks.remove }),
}));

import { TicketComments } from "./TicketComments";

const comment = (id: string, texto: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  texto,
  autor: { id: "u1", nombre: "Ana" },
  createdAt: "2026-10-06T17:32:00.000Z",
  ...extra,
});

const show = (comments: Comment[] | undefined, extra: Partial<typeof mocks.list> = {}) => {
  mocks.list = { data: comments, isPending: false, isError: false, ...extra };
  return render(<TicketComments ticketId="t-13" />);
};

const write = async (text: string) => {
  const textbox = screen.getByRole("textbox", { name: "Nuevo comentario" });
  if (text) await userEvent.type(textbox, text); // `type` no acepta un texto vacío
  await userEvent.click(screen.getByRole("button", { name: "Comentar" }));
};

describe("TicketComments", () => {
  beforeEach(() => {
    mocks.role = "agente";
    mocks.list = { data: undefined, isPending: true, isError: false };
    mocks.create.mockReset();
    mocks.create.mockResolvedValue(undefined);
    mocks.remove.mockReset();
    mocks.remove.mockResolvedValue(undefined);
  });

  describe("la lista", () => {
    it("mientras carga, y si falla, lo avisa", () => {
      render(<TicketComments ticketId="t-13" />);
      expect(screen.getByText("Cargando comentarios…")).toBeInTheDocument();

      show(undefined, { isPending: false, isError: true });
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los comentarios.");
    });

    it("sin comentarios muestra un texto, no una lista vacía", () => {
      show([]);

      expect(screen.getByText("Todavía no hay comentarios.")).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("muestra autor, fecha y hora, y el texto, en el orden recibido", () => {
      show([
        comment("c1", "Llamé al proveedor"),
        comment("c2", "Me respondió", {
          autor: { id: "u2", nombre: "Beto" },
          createdAt: "2026-10-06T18:05:00.000Z",
        }),
      ]);

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Ana · 06/10/2026 14:32");
      expect(items[0]).toHaveTextContent("Llamé al proveedor");
      expect(items[1]).toHaveTextContent("Beto · 06/10/2026 15:05");
      expect(items[1]).toHaveTextContent("Me respondió");
    });

    it("respeta los saltos de línea del texto", () => {
      show([comment("c1", "Primera línea\nSegunda línea")]);

      const text = screen.getByText(/Primera línea/);
      expect(text).toHaveClass("whitespace-pre-wrap");
      expect(text.textContent).toBe("Primera línea\nSegunda línea");
    });

    it("no ofrece editar un comentario, ni al admin", () => {
      mocks.role = "admin";
      show([comment("c1", "Hola")]);

      expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    });
  });

  describe("comentar", () => {
    it("manda el texto recortado, vacía el campo y el comentario aparece en la lista", async () => {
      show([]);
      // Imita lo que hace el hook real: al terminar la mutación la lista ya trae el comentario nuevo.
      mocks.create.mockImplementation(async ({ texto }: { texto: string }) => {
        mocks.list = { ...mocks.list, data: [comment("c1", texto)] };
      });

      await write("  Llamé al proveedor  ");

      expect(mocks.create).toHaveBeenCalledWith({ ticketId: "t-13", texto: "Llamé al proveedor" });
      await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
      expect(screen.getByRole("listitem")).toHaveTextContent("Llamé al proveedor");
    });

    it.each(["", "   "])("rechaza un comentario vacío o de solo espacios: %j", async (text) => {
      show([]);

      await write(text);

      expect(screen.getByText(/El comentario es obligatorio/)).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it("el error de validación queda ligado al campo", async () => {
      show([]);

      await write("");

      const textbox = screen.getByRole("textbox", { name: "Nuevo comentario" });
      expect(textbox).toHaveAttribute("aria-invalid", "true");
      expect(textbox).toHaveAccessibleDescription(/El comentario es obligatorio/);
    });

    it("rechaza más de 2000 caracteres y no pierde lo escrito", async () => {
      show([]);
      const textbox = screen.getByRole("textbox");

      // `type` tecla por tecla tardaría; el valor se pega de una vez.
      await userEvent.click(textbox);
      await userEvent.paste("a".repeat(2001));
      await userEvent.click(screen.getByRole("button", { name: "Comentar" }));

      expect(screen.getByText(/hasta 2000 caracteres/)).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
      expect((textbox as HTMLTextAreaElement).value).toHaveLength(2001);
    });

    it("si la API rechaza, muestra el error y conserva el texto para reintentar", async () => {
      show([]);
      mocks.create.mockRejectedValue(
        new ORPCError("NOT_FOUND", { status: 404, message: "El ticket no existe" }),
      );

      await write("Hola");

      expect(await screen.findByRole("alert")).toHaveTextContent("El ticket no existe");
      expect(screen.getByRole("textbox")).toHaveValue("Hola");
    });

    it("se puede comentar siempre: el formulario no depende de nada del ticket", () => {
      show([]);

      expect(screen.getByRole("button", { name: "Comentar" })).toBeEnabled();
    });
  });

  describe("eliminar", () => {
    it("un agente no ve «Eliminar», tampoco en sus propios comentarios", () => {
      mocks.role = "agente";
      show([comment("c1", "Hola", { autor: { id: "u1", nombre: "Ana" } })]);

      expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();
    });

    it("el admin ve «Eliminar» en cada comentario", () => {
      mocks.role = "admin";
      show([comment("c1", "Uno"), comment("c2", "Dos")]);

      expect(screen.getAllByRole("button", { name: /^Eliminar comentario/ })).toHaveLength(2);
    });

    it("cada botón dice de quién es el comentario, para distinguirlos sin ver la pantalla", () => {
      mocks.role = "admin";
      show([
        comment("c1", "Uno", { autor: { id: "u1", nombre: "Ana" } }),
        comment("c2", "Dos", { autor: { id: "u2", nombre: "Luis" } }),
      ]);

      expect(
        screen.getAllByRole("button", { name: /^Eliminar comentario/ }).map((b) => b.ariaLabel),
      ).toEqual(["Eliminar comentario de Ana", "Eliminar comentario de Luis"]);
    });

    it("pide confirmación y elimina el comentario elegido", async () => {
      mocks.role = "admin";
      show([comment("c1", "Uno"), comment("c2", "Dos")]);

      const second = screen.getAllByRole("listitem")[1] as HTMLElement;
      await userEvent.click(
        within(second).getByRole("button", { name: "Eliminar comentario de Ana" }),
      );
      expect(mocks.remove).not.toHaveBeenCalled();
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog).toHaveTextContent("Eliminar comentario");
      await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

      expect(mocks.remove).toHaveBeenCalledWith({ ticketId: "t-13", comentarioId: "c2" });
    });

    it("cancelar no elimina nada", async () => {
      mocks.role = "admin";
      show([comment("c1", "Uno")]);

      await userEvent.click(screen.getByRole("button", { name: "Eliminar comentario de Ana" }));
      await userEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

      expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("si la API rechaza, muestra el error", async () => {
      mocks.role = "admin";
      show([comment("c1", "Uno")]);
      mocks.remove.mockRejectedValue(
        new ORPCError("NOT_FOUND", { status: 404, message: "El comentario no existe" }),
      );

      await userEvent.click(screen.getByRole("button", { name: "Eliminar comentario de Ana" }));
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("El comentario no existe");
    });
  });
});
