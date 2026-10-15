import { ORPCError } from "@orpc/client";
import type { CatalogRuta } from "@syc/contracts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Cliente oRPC en memoria: una lista por catálogo y los mismos procedimientos que el contrato.
const fake = vi.hoisted(() => {
  type Item = { id: string; nombre: string; orden: number; activo: boolean } & Record<
    string,
    unknown
  >;
  const state = {
    tables: new Map<string, Item[]>(),
    nextId: 1,
    createError: null as Error | null,
    updates: [] as Record<string, unknown>[],
    creates: [] as Record<string, unknown>[],
  };
  const table = (ruta: string) => {
    if (!state.tables.has(ruta)) state.tables.set(ruta, []);
    return state.tables.get(ruta) as Item[];
  };
  const sorted = (ruta: string) => [...table(ruta)].sort((a, b) => a.orden - b.orden);
  // Como la API: un área sale con su tipo `{ id, nombre }` según `tipoId`.
  const withTipo = (item: Item, tipoId: unknown): Item => {
    const tipo = table("tiposArea").find((t) => t.id === tipoId);
    if (tipo) item.tipo = { id: tipo.id, nombre: tipo.nombre };
    return item;
  };
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
    create: procedure(
      ({ nombre, tipoId, color }: { nombre: string; tipoId?: string; color?: string }) => {
        if (state.createError) throw state.createError;
        state.creates.push({
          nombre,
          ...(tipoId === undefined ? {} : { tipoId }),
          ...(color === undefined ? {} : { color }),
        });
        const orden = Math.max(0, ...table(ruta).map((i) => i.orden)) + 1;
        const item = withTipo(
          {
            id: `i${state.nextId++}`,
            nombre,
            orden,
            activo: true,
            ...(color === undefined ? {} : { color }),
          },
          tipoId,
        );
        table(ruta).push(item);
        return item;
      },
    ),
    update: procedure(
      ({ itemId, ...fields }: { itemId: string; nombre: string; tipoId?: string }) => {
        state.updates.push({ itemId, ...fields });
        const item = table(ruta).find((i) => i.id === itemId) as Item;
        Object.assign(item, fields);
        return withTipo(item, fields.tipoId);
      },
    ),
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

// jsdom no implementa lo que Radix Select pide para abrirse.
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

function renderAdmin(ruta: CatalogRuta = "areas") {
  const onRutaChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CatalogsAdmin ruta={ruta} onRutaChange={onRutaChange} />
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
    fake.state.updates = [];
    fake.state.creates = [];
    const diputado = { id: "t1", nombre: "Diputado" };
    fake
      .table("tiposArea")
      .push(
        { ...diputado, orden: 1, activo: true },
        { id: "t2", nombre: "Bloque", orden: 2, activo: true },
        { id: "t3", nombre: "Comisión", orden: 3, activo: false },
      );
    fake
      .table("areas")
      .push(
        { id: "a1", nombre: "Sistemas", orden: 1, activo: true, tipo: diputado },
        { id: "a2", nombre: "Redes", orden: 2, activo: true, tipo: diputado },
      );
    fake.table("edificios").push({ id: "e1", nombre: "Sistemas", orden: 1, activo: true });
  });

  it("muestra las 8 pestañas en orden y avisa al cambiar de pestaña", async () => {
    const { onRutaChange } = renderAdmin();

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual([
      "Áreas",
      "Tipos de área",
      "Edificios",
      "Tipos",
      "Prioridades",
      "Módulos",
      "Proveedores",
      "Estados",
    ]);
    expect(await screen.findByRole("heading", { name: "Áreas" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Tipos de área" }));

    expect(onRutaChange).toHaveBeenCalledWith("tiposArea");
  });

  it("deshabilita Subir en la primera fila y Bajar en la última", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    expect(within(row("Sistemas")).getByRole("button", { name: /^Subir/ })).toBeDisabled();
    expect(within(row("Sistemas")).getByRole("button", { name: /^Bajar/ })).toBeEnabled();
    expect(within(row("Redes")).getByRole("button", { name: /^Bajar/ })).toBeDisabled();
  });

  it("en Tipos de área crea, edita, mueve, desactiva, reactiva y elimina", async () => {
    renderAdmin("tiposArea");
    await screen.findByText("Diputado");

    // Crear
    await userEvent.click(screen.getByRole("button", { name: "Nuevo tipo de área" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Oficina");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(rowNames()).toEqual(["Diputado", "Bloque", "Comisión", "Oficina"]));

    // Editar
    await userEvent.click(within(row("Oficina")).getByRole("button", { name: "Editar" }));
    const input = screen.getByLabelText("Nombre");
    expect(input).toHaveValue("Oficina");
    await userEvent.clear(input);
    await userEvent.type(input, "Despacho");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(rowNames()).toEqual(["Diputado", "Bloque", "Comisión", "Despacho"]));

    // Mover
    await userEvent.click(within(row("Despacho")).getByRole("button", { name: /^Subir/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Diputado", "Bloque", "Despacho", "Comisión"]));
    await userEvent.click(within(row("Diputado")).getByRole("button", { name: /^Bajar/ }));
    await waitFor(() => expect(rowNames()).toEqual(["Bloque", "Diputado", "Despacho", "Comisión"]));

    // Desactivar y reactivar
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: "Desactivar" }));
    expect(await within(row("Bloque")).findByText("Desactivado")).toBeInTheDocument();
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: "Reactivar" }));
    expect(await within(row("Bloque")).findByText("Activo")).toBeInTheDocument();

    // Eliminar, con confirmación
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: "Eliminar" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Se eliminará «Bloque». No se puede deshacer desde la pantalla; si solo querés ocultarlo, desactivalo.",
    );
    await userEvent.click(within(confirm).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(rowNames()).toEqual(["Diputado", "Despacho", "Comisión"]));
  });

  it("en Áreas la tabla muestra el tipo en la primera columna", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Tipo",
      "Nombre",
      "Estado",
      "Acciones",
    ]);
    expect(within(row("Sistemas")).getByText("Diputado")).toBeInTheDocument();
  });

  it("en Áreas el alta sin tipo muestra el error y no se envía", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nueva área" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Soporte");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText("Elegí un tipo.")).toBeVisible();
    expect(fake.state.creates).toEqual([]);
    expect(rowNames()).toEqual(["Sistemas", "Redes"]);
  });

  it("en Áreas el alta manda el tipo elegido y solo ofrece los activos", async () => {
    renderAdmin();
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nueva área" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Soporte");
    await userEvent.click(screen.getByRole("combobox", { name: "Tipo" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Diputado", "Bloque"]);
    await userEvent.click(screen.getByRole("option", { name: "Bloque" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(rowNames()).toEqual(["Sistemas", "Redes", "Soporte"]));
    expect(fake.state.creates).toEqual([{ nombre: "Soporte", tipoId: "t2" }]);
    expect(within(row("Soporte")).getByText("Bloque")).toBeInTheDocument();
  });

  it("en Áreas editar cambia el tipo; el tipo actual desactivado se ofrece marcado", async () => {
    fake.table("areas").push({
      id: "a3",
      nombre: "Comisión de salud",
      orden: 3,
      activo: true,
      tipo: { id: "t3", nombre: "Comisión" },
    });
    renderAdmin();
    await screen.findByText("Comisión de salud");

    await userEvent.click(within(row("Comisión de salud")).getByRole("button", { name: "Editar" }));
    const tipo = screen.getByRole("combobox", { name: "Tipo" });
    expect(tipo).toHaveTextContent("Comisión (inactivo)");
    await userEvent.click(tipo);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Diputado",
      "Bloque",
      "Comisión (inactivo)",
    ]);
    await userEvent.click(screen.getByRole("option", { name: "Bloque" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(fake.state.updates).toHaveLength(1));
    expect(fake.state.updates[0]).toEqual({
      itemId: "a3",
      nombre: "Comisión de salud",
      tipoId: "t2",
    });
    expect(await within(row("Comisión de salud")).findByText("Bloque")).toBeInTheDocument();
  });

  it("no envía un nombre vacío", async () => {
    renderAdmin("edificios");
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nuevo edificio" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(
      await screen.findByText("El nombre es obligatorio (hasta 120 caracteres)."),
    ).toBeVisible();
    expect(rowNames()).toEqual(["Sistemas"]);
  });

  it("muestra el error 409 de la API dentro del diálogo", async () => {
    fake.state.createError = new ORPCError("CONFLICT", {
      status: 409,
      message: "Ya existe un edificio con ese nombre",
    });
    renderAdmin("edificios");
    await screen.findByText("Sistemas");

    await userEvent.click(screen.getByRole("button", { name: "Nuevo edificio" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "sistemas");
    await userEvent.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe un edificio con ese nombre",
    );
  });

  it("en Proveedores edita los 5 campos y manda todos en el update", async () => {
    fake.table("proveedores").push({
      id: "p1",
      nombre: "Acme",
      orden: 1,
      activo: true,
      contacto: "Ana",
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
    renderAdmin("proveedores");
    await screen.findByText("Acme");

    await userEvent.click(within(row("Acme")).getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Contacto")).toHaveValue("Ana");
    await userEvent.type(screen.getByLabelText("Correo"), "soporte@acme.com");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(fake.state.updates).toHaveLength(1));
    expect(fake.state.updates[0]).toEqual({
      itemId: "p1",
      nombre: "Acme",
      contacto: "Ana",
      telefono: null,
      correo: "soporte@acme.com",
      sitioWeb: null,
    });
    expect(await within(row("Acme")).findByText("soporte@acme.com")).toBeInTheDocument();
  });

  describe("color de estados y prioridades (SPEC 10)", () => {
    beforeEach(() => {
      fake.table("estados").push(
        { id: "e1", nombre: "Pendiente", orden: 1, activo: true, clave: null, color: "azul" },
        {
          id: "e4",
          nombre: "Finalizado",
          orden: 2,
          activo: true,
          clave: "FINALIZADO",
          color: "verde",
        },
      );
      fake
        .table("prioridades")
        .push({ id: "p1", nombre: "Urgente", orden: 1, activo: true, color: "rojo" });
    });

    it("la tabla de Estados y la de Prioridades muestran la columna Color con el nombre del color", async () => {
      renderAdmin("estados");
      await screen.findByText("Pendiente");

      expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
        "Nombre",
        "Color",
        "Estado",
        "Acciones",
      ]);
      const azul = within(row("Pendiente")).getByText("Azul");
      expect(azul).toHaveAttribute("data-tono", "azul");
      expect(within(row("Finalizado")).getByText("Verde")).toHaveAttribute("data-tono", "verde");
    });

    it("la tabla de Prioridades también tiene la columna Color", async () => {
      renderAdmin("prioridades");
      await screen.findByText("Urgente");

      expect(within(row("Urgente")).getByText("Rojo")).toHaveAttribute("data-tono", "rojo");
    });

    it("la tabla de Edificios no tiene la columna Color ni el campo en el formulario", async () => {
      renderAdmin("edificios");
      await screen.findByText("Sistemas");

      expect(screen.queryByRole("columnheader", { name: "Color" })).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Nuevo edificio" }));
      expect(screen.queryByRole("combobox", { name: "Color" })).toBeNull();
    });

    it("el alta de un estado sin tocar el color manda gris", async () => {
      renderAdmin("estados");
      await screen.findByText("Pendiente");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo estado" }));
      expect(screen.getByRole("combobox", { name: "Color" })).toHaveTextContent("Gris");
      await userEvent.type(screen.getByLabelText("Nombre"), "En espera");
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      await waitFor(() => expect(fake.state.creates).toHaveLength(1));
      expect(fake.state.creates[0]).toEqual({ nombre: "En espera", color: "gris" });
      expect(await within(row("En espera")).findByText("Gris")).toHaveAttribute(
        "data-tono",
        "gris",
      );
    });

    it("elegir Rojo en el desplegable lo manda y la tabla lo refleja", async () => {
      renderAdmin("estados");
      await screen.findByText("Pendiente");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo estado" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "Bloqueado");
      await userEvent.click(screen.getByRole("combobox", { name: "Color" }));
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Gris",
        "Rojo",
        "Naranja",
        "Amarillo",
        "Verde",
        "Azul",
        "Violeta",
        "Rosa",
        "Celeste",
        "Turquesa",
        "Lima",
        "Marrón",
        "Índigo",
        "Magenta",
        "Bordó",
        "Pizarra",
      ]);
      await userEvent.click(screen.getByRole("option", { name: "Rojo" }));
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      await waitFor(() => expect(fake.state.creates).toHaveLength(1));
      expect(fake.state.creates[0]).toEqual({ nombre: "Bloqueado", color: "rojo" });
      expect(await within(row("Bloqueado")).findByText("Rojo")).toHaveAttribute(
        "data-tono",
        "rojo",
      );
    });

    it("un tono de la ampliación viaja sin acento y la tabla muestra su etiqueta con acento", async () => {
      renderAdmin("prioridades");
      await screen.findByText("Urgente");

      await userEvent.click(screen.getByRole("button", { name: "Nueva prioridad" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "Diferida");
      await userEvent.click(screen.getByRole("combobox", { name: "Color" }));
      await userEvent.click(screen.getByRole("option", { name: "Marrón" }));
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      await waitFor(() => expect(fake.state.creates).toHaveLength(1));
      expect(fake.state.creates[0]).toEqual({ nombre: "Diferida", color: "marron" });
      expect(await within(row("Diferida")).findByText("Marrón")).toHaveAttribute(
        "data-tono",
        "marron",
      );
    });

    it("editar un estado manda su color actual, y se puede cambiar", async () => {
      renderAdmin("estados");
      await screen.findByText("Pendiente");

      await userEvent.click(within(row("Pendiente")).getByRole("button", { name: "Editar" }));
      expect(screen.getByRole("combobox", { name: "Color" })).toHaveTextContent("Azul");
      await userEvent.clear(screen.getByLabelText("Nombre"));
      await userEvent.type(screen.getByLabelText("Nombre"), "Por hacer");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(fake.state.updates).toHaveLength(1));
      expect(fake.state.updates[0]).toEqual({ itemId: "e1", nombre: "Por hacer", color: "azul" });

      await userEvent.click(within(row("Por hacer")).getByRole("button", { name: "Editar" }));
      await userEvent.click(screen.getByRole("combobox", { name: "Color" }));
      await userEvent.click(screen.getByRole("option", { name: "Violeta" }));
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(fake.state.updates).toHaveLength(2));
      expect(fake.state.updates[1]).toEqual({
        itemId: "e1",
        nombre: "Por hacer",
        color: "violeta",
      });
    });

    it("una prioridad se edita con su color actual", async () => {
      renderAdmin("prioridades");
      await screen.findByText("Urgente");

      await userEvent.click(within(row("Urgente")).getByRole("button", { name: "Editar" }));
      expect(screen.getByRole("combobox", { name: "Color" })).toHaveTextContent("Rojo");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(fake.state.updates).toHaveLength(1));
      expect(fake.state.updates[0]).toEqual({ itemId: "p1", nombre: "Urgente", color: "rojo" });
    });
  });

  it("en Estados las filas de sistema no tienen Eliminar", async () => {
    fake
      .table("estados")
      .push(
        { id: "e1", nombre: "Pendiente", orden: 1, activo: true, clave: null },
        { id: "e5", nombre: "Cerrado", orden: 2, activo: true, clave: "CERRADO" },
      );
    renderAdmin("estados");
    await screen.findByText("Cerrado");

    expect(within(row("Cerrado")).getByText("De sistema")).toBeInTheDocument();
    expect(within(row("Cerrado")).queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(within(row("Pendiente")).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
  });
});
