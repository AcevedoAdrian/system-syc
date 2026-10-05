import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Cliente oRPC en memoria: una lista por catálogo y los mismos procedimientos que el contrato.
const fake = vi.hoisted(() => {
  type Item = { id: string; nombre: string; orden: number; activo: boolean };
  const state = { tables: new Map<string, Item[]>(), nextId: 1, createError: null as Error | null };
  const table = (ruta: string) => {
    if (!state.tables.has(ruta)) state.tables.set(ruta, []);
    return state.tables.get(ruta) as Item[];
  };
  const sorted = (ruta: string) => [...table(ruta)].sort((a, b) => a.orden - b.orden);
  const procedure = <TInput, TOutput>(fn: (input: TInput) => TOutput) => ({
    mutationOptions: (options: object = {}) => ({
      mutationFn: async (input: TInput) => fn(input),
      ...options,
    }),
  });
  const api = (ruta: string) => ({
    key: () => ["catalogs", ruta],
    list: {
      queryOptions: () => ({
        queryKey: ["catalogs", ruta, "list"],
        queryFn: async () => structuredClone(sorted(ruta)),
      }),
    },
    create: procedure(({ nombre }: { nombre: string }) => {
      if (state.createError) throw state.createError;
      const orden = Math.max(0, ...table(ruta).map((i) => i.orden)) + 1;
      const item = { id: `i${state.nextId++}`, nombre, orden, activo: true };
      table(ruta).push(item);
      return item;
    }),
    update: procedure(({ itemId, nombre }: { itemId: string; nombre: string }) => {
      const item = table(ruta).find((i) => i.id === itemId) as Item;
      item.nombre = nombre;
      return item;
    }),
    move: procedure(({ itemId, direccion }: { itemId: string; direccion: string }) => {
      const list = sorted(ruta);
      const index = list.findIndex((i) => i.id === itemId);
      const other = list[index + (direccion === "subir" ? -1 : 1)];
      const item = list[index];
      if (!item || !other) return;
      [item.orden, other.orden] = [other.orden, item.orden];
    }),
    setActive: procedure(({ itemId, activo }: { itemId: string; activo: boolean }) => {
      const item = table(ruta).find((i) => i.id === itemId) as Item;
      item.activo = activo;
      return item;
    }),
    remove: procedure(({ itemId }: { itemId: string }) => {
      state.tables.set(
        ruta,
        table(ruta).filter((i) => i.id !== itemId),
      );
    }),
  });
  return { state, table, api };
});

vi.mock("@/lib/orpc-client", () => ({
  orpc: { catalogs: new Proxy({}, { get: (_target, ruta: string) => fake.api(ruta) }) },
}));

import { CatalogsAdmin } from "./CatalogsAdmin";

function renderAdmin(onRutaChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CatalogsAdmin ruta="areas" onRutaChange={onRutaChange} />
    </QueryClientProvider>,
  );
  return { onRutaChange };
}

const rowNames = () =>
  screen
    .getAllByTestId(/^catalog-row-/)
    .map((row) => row.getAttribute("data-testid")?.replace("catalog-row-", ""));
const row = (nombre: string) => screen.getByTestId(`catalog-row-${nombre}`);

describe("CatalogsAdmin", () => {
  beforeEach(() => {
    fake.state.tables.clear();
    fake.state.nextId = 1;
    fake.state.createError = null;
    fake
      .table("areas")
      .push(
        { id: "a1", nombre: "Sistemas", orden: 1, activo: true },
        { id: "a2", nombre: "Redes", orden: 2, activo: true },
      );
  });

  it("muestra las 7 pestañas en orden y avisa al cambiar de pestaña", async () => {
    const { onRutaChange } = renderAdmin();

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Áreas",
      "Edificios",
      "Tipos",
      "Prioridades",
      "Módulos",
      "Proveedores",
      "Estados",
    ]);
    expect(await screen.findByRole("heading", { name: "Áreas" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Edificios" }));

    expect(onRutaChange).toHaveBeenCalledWith("edificios");
  });

  it("deshabilita Subir en la primera fila y Bajar en la última", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    expect(within(row("Sistemas")).getByRole("button", { name: /^Subir/ })).toBeDisabled();
    expect(within(row("Sistemas")).getByRole("button", { name: /^Bajar/ })).toBeEnabled();
    expect(within(row("Redes")).getByRole("button", { name: /^Bajar/ })).toBeDisabled();
  });

  it("crea, edita, mueve, desactiva, reactiva y elimina un ítem", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    // Crear
    await userEvent.click(screen.getByRole("button", { name: "Nueva área" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Soporte");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(rowNames()).toEqual(["Sistemas", "Redes", "Soporte"]));

    // Editar
    await userEvent.click(within(row("Soporte")).getByRole("button", { name: "Editar" }));
    const input = screen.getByLabelText("Nombre");
    expect(input).toHaveValue("Soporte");
    await userEvent.clear(input);
    await userEvent.type(input, "Mesa de ayuda");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(rowNames()).toEqual(["Sistemas", "Redes", "Mesa de ayuda"]));

    // Mover
    await userEvent.click(within(row("Mesa de ayuda")).getByRole("button", { name: /^Subir/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Sistemas", "Mesa de ayuda", "Redes"]));
    await userEvent.click(within(row("Sistemas")).getByRole("button", { name: /^Bajar/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Mesa de ayuda", "Sistemas", "Redes"]));

    // Desactivar y reactivar
    await userEvent.click(within(row("Redes")).getByRole("button", { name: "Desactivar" }));
    expect(await within(row("Redes")).findByText("Desactivado")).toBeInTheDocument();
    await userEvent.click(within(row("Redes")).getByRole("button", { name: "Reactivar" }));
    expect(await within(row("Redes")).findByText("Activo")).toBeInTheDocument();

    // Eliminar, con confirmación
    await userEvent.click(within(row("Redes")).getByRole("button", { name: "Eliminar" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Se eliminará «Redes». No se puede deshacer desde la pantalla; si solo querés ocultarlo, desactivalo.",
    );
    await userEvent.click(within(confirm).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(rowNames()).toEqual(["Mesa de ayuda", "Sistemas"]));
  });

  it("no envía un nombre vacío", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nueva área" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByText("El nombre es obligatorio (hasta 120 caracteres)."),
    ).toBeVisible();
    expect(rowNames()).toEqual(["Sistemas", "Redes"]);
  });

  it("muestra el error 409 de la API dentro del diálogo", async () => {
    fake.state.createError = new ORPCError("CONFLICT", {
      status: 409,
      message: "Ya existe un área con ese nombre",
    });
    renderAdmin();
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nueva área" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "sistemas");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe un área con ese nombre");
  });
});
