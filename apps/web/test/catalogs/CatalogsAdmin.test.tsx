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
  // Como la API: un módulo sale con sus departamentos `{ id, nombre }` según `departamentoIds`.
  const departments = [
    { id: "d1", nombre: "Desarrollo", activo: true, agentes: 0 },
    { id: "d2", nombre: "Redes", activo: true, agentes: 0 },
    { id: "d3", nombre: "Técnico", activo: true, agentes: 0 },
    { id: "d4", nombre: "Archivo", activo: false, agentes: 0 },
  ];
  const withDepartamentos = (item: Item, ids: unknown): Item => {
    if (!Array.isArray(ids)) return item;
    item.departamentos = ids
      .map((id) => departments.find((d) => d.id === id))
      .filter((d) => d !== undefined)
      .map((d) => ({ id: d.id, nombre: d.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
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
      ({
        nombre,
        tipoId,
        departamentoIds,
        descripcion,
      }: {
        nombre: string;
        tipoId?: string;
        departamentoIds?: string[];
        descripcion?: string | null;
      }) => {
        if (state.createError) throw state.createError;
        state.creates.push({
          nombre,
          ...(descripcion === undefined ? {} : { descripcion }),
          ...(tipoId === undefined ? {} : { tipoId }),
          ...(departamentoIds === undefined ? {} : { departamentoIds }),
        });
        const orden = Math.max(0, ...table(ruta).map((i) => i.orden)) + 1;
        const item = withTipo({ id: `i${state.nextId++}`, nombre, orden, activo: true }, tipoId);
        if (descripcion !== undefined) item.descripcion = descripcion;
        withDepartamentos(item, departamentoIds);
        table(ruta).push(item);
        return item;
      },
    ),
    update: procedure(
      ({
        itemId,
        ...fields
      }: {
        itemId: string;
        nombre: string;
        tipoId?: string;
        departamentoIds?: string[];
      }) => {
        state.updates.push({ itemId, ...fields });
        const item = table(ruta).find((i) => i.id === itemId) as Item;
        const { departamentoIds, ...rest } = fields;
        Object.assign(item, rest);
        withDepartamentos(item, departamentoIds);
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
  return { state, table, api, departments };
});

vi.mock("@/lib/orpc-client", () => ({
  orpc: {
    catalogs: new Proxy({}, { get: (_target, ruta: string) => fake.api(ruta) }),
    organizations: {
      list: {
        queryOptions: () => ({
          queryKey: ["organizations", "list"],
          queryFn: async () => structuredClone(fake.departments),
        }),
      },
    },
  },
}));

import { CatalogsAdmin } from "@/features/catalogs/components/CatalogsAdmin";

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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <CatalogsAdmin ruta={ruta} />
    </QueryClientProvider>,
  );
  const show = (next: CatalogRuta) =>
    view.rerender(
      <QueryClientProvider client={client}>
        <CatalogsAdmin ruta={next} />
      </QueryClientProvider>,
    );
  return { show };
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

  it("no tiene pestañas: el catálogo lo elige el menú lateral", async () => {
    renderAdmin();

    expect(await screen.findByRole("heading", { level: 1, name: "Áreas" })).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
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
    await userEvent.click(within(row("Oficina")).getByRole("button", { name: /^Editar/ }));
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
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: /^Desactivar/ }));
    expect(await within(row("Bloque")).findByText("Desactivado")).toBeInTheDocument();
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: /^Reactivar/ }));
    expect(await within(row("Bloque")).findByText("Activo")).toBeInTheDocument();

    // Eliminar, con confirmación
    await userEvent.click(within(row("Bloque")).getByRole("button", { name: /^Eliminar/ }));
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
      "Orden",
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
    await userEvent.click(screen.getByRole("combobox", { name: "Tipo de área" }));
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

    await userEvent.click(
      within(row("Comisión de salud")).getByRole("button", { name: /^Editar/ }),
    );
    const tipo = screen.getByRole("combobox", { name: "Tipo de área" });
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

  describe("Tipos de ticket con descripción (SPEC 12)", () => {
    beforeEach(() => {
      fake.table("tipos").push({
        id: "tk1",
        nombre: "Incidente",
        orden: 1,
        activo: true,
        descripcion: "Algo que funcionaba dejó de funcionar.",
      });
    });

    it("la tabla muestra la descripción", async () => {
      renderAdmin("tipos");

      expect(await screen.findByText("Algo que funcionaba dejó de funcionar.")).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
    });

    it("el alta envía la descripción y el tipo aparece en la tabla", async () => {
      renderAdmin("tipos");
      await screen.findByText("Incidente");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo tipo" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "Consulta");
      await userEvent.type(screen.getByLabelText("Descripción"), "Pedir que revisen algo.");
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      expect(await screen.findByText("Pedir que revisen algo.")).toBeInTheDocument();
      expect(fake.state.creates).toEqual([
        { nombre: "Consulta", descripcion: "Pedir que revisen algo." },
      ]);
    });

    it("editar precarga el texto entero y vaciarlo envía null", async () => {
      renderAdmin("tipos");
      await screen.findByText("Incidente");

      await userEvent.click(screen.getByRole("button", { name: "Editar «Incidente»" }));
      const campo = screen.getByLabelText("Descripción");
      expect(campo).toHaveValue("Algo que funcionaba dejó de funcionar.");
      await userEvent.clear(campo);
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() =>
        expect(fake.state.updates).toEqual([
          { itemId: "tk1", nombre: "Incidente", descripcion: null },
        ]),
      );
    });

    it("un error del servidor se muestra dentro del panel", async () => {
      fake.state.createError = new ORPCError("CONFLICT", {
        status: 409,
        message: "Ya existe un tipo de ticket con ese nombre",
      });
      renderAdmin("tipos");
      await screen.findByText("Incidente");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo tipo" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "incidente");
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Ya existe un tipo de ticket con ese nombre",
      );
    });
  });

  it("muestra el error 409 de la API dentro del panel", async () => {
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

    await userEvent.click(within(row("Acme")).getByRole("button", { name: /^Editar/ }));
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

  describe("Módulos con departamentos (SPEC 11)", () => {
    const desarrollo = { id: "d1", nombre: "Desarrollo" };
    const redes = { id: "d2", nombre: "Redes" };

    it("la tabla suma la columna «Departamentos» con los nombres separados por coma", async () => {
      fake.table("modulos").push(
        {
          id: "m1",
          nombre: "Servidores",
          orden: 1,
          activo: true,
          departamentos: [desarrollo, redes],
        },
        { id: "m2", nombre: "Sin asignar", orden: 2, activo: true, departamentos: [] },
      );
      renderAdmin("modulos");
      await screen.findByText("Servidores");

      expect(screen.getByRole("columnheader", { name: "Departamentos" })).toBeInTheDocument();
      expect(within(row("Servidores")).getByText("Desarrollo, Redes")).toBeInTheDocument();
      expect(within(row("Sin asignar")).getByText("—")).toBeInTheDocument();
    });

    it("las otras pestañas no tienen la columna", async () => {
      renderAdmin("edificios");
      await screen.findByText("Sistemas");

      expect(screen.queryByRole("columnheader", { name: "Departamentos" })).toBeNull();
    });

    it("el alta sin ninguna casilla muestra el error y no envía", async () => {
      renderAdmin("modulos");
      await screen.findByText("Todavía no hay registros.");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo módulo" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "Servidores");
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      expect(await screen.findByText("Elegí al menos un departamento.")).toBeInTheDocument();
      expect(fake.state.creates).toHaveLength(0);
    });

    it("el panel ofrece una casilla por departamento activo y no los desactivados", async () => {
      renderAdmin("modulos");
      await screen.findByText("Todavía no hay registros.");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo módulo" }));

      expect(await screen.findByRole("checkbox", { name: "Desarrollo" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Redes" })).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Técnico" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /Archivo/ })).toBeNull();
    });

    it("el alta con casillas tildadas manda departamentoIds y la fila aparece", async () => {
      renderAdmin("modulos");
      await screen.findByText("Todavía no hay registros.");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo módulo" }));
      await userEvent.type(screen.getByLabelText("Nombre"), "Servidores");
      await userEvent.click(await screen.findByRole("checkbox", { name: "Redes" }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Desarrollo" }));
      await userEvent.click(screen.getByRole("button", { name: "Crear" }));

      await waitFor(() => expect(fake.state.creates).toHaveLength(1));
      expect(fake.state.creates[0]).toEqual({
        nombre: "Servidores",
        departamentoIds: ["d2", "d1"],
      });
      expect(
        await within(await screen.findByTestId("catalog-row-Servidores")).findByText(
          "Desarrollo, Redes",
        ),
      ).toBeInTheDocument();
    });

    it("al editar, un departamento desactivado ya asignado aparece tildado y marcado «(inactivo)»", async () => {
      const archivo = { id: "d4", nombre: "Archivo" };
      fake.table("modulos").push({
        id: "m1",
        nombre: "Servidores",
        orden: 1,
        activo: true,
        departamentos: [archivo, desarrollo],
      });
      renderAdmin("modulos");
      await screen.findByText("Servidores");

      await userEvent.click(within(row("Servidores")).getByRole("button", { name: /^Editar/ }));

      expect(await screen.findByRole("checkbox", { name: "Archivo (inactivo)" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Desarrollo" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Redes" })).not.toBeChecked();
    });

    it("editar conservando el departamento desactivado lo manda junto con los demás", async () => {
      const archivo = { id: "d4", nombre: "Archivo" };
      fake.table("modulos").push({
        id: "m1",
        nombre: "Servidores",
        orden: 1,
        activo: true,
        departamentos: [archivo, desarrollo],
      });
      renderAdmin("modulos");
      await screen.findByText("Servidores");

      await userEvent.click(within(row("Servidores")).getByRole("button", { name: /^Editar/ }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Redes" }));
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(fake.state.updates).toHaveLength(1));
      expect(fake.state.updates[0]).toEqual({
        itemId: "m1",
        nombre: "Servidores",
        departamentoIds: ["d4", "d1", "d2"],
      });
    });

    it("destildar todas las casillas al editar bloquea el envío", async () => {
      fake.table("modulos").push({
        id: "m1",
        nombre: "Servidores",
        orden: 1,
        activo: true,
        departamentos: [desarrollo],
      });
      renderAdmin("modulos");
      await screen.findByText("Servidores");

      await userEvent.click(within(row("Servidores")).getByRole("button", { name: /^Editar/ }));
      await userEvent.click(await screen.findByRole("checkbox", { name: "Desarrollo" }));
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText("Elegí al menos un departamento.")).toBeInTheDocument();
      expect(fake.state.updates).toHaveLength(0);
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
    expect(within(row("Cerrado")).queryByRole("button", { name: /^Eliminar/ })).toBeNull();
    expect(within(row("Pendiente")).getByRole("button", { name: /^Eliminar/ })).toBeInTheDocument();
  });
});

describe("CatalogsAdmin: encabezado, búsqueda, filtros y paginación", () => {
  const seed = (count: number, inactive: number[] = []) => {
    fake.state.tables.clear();
    fake.state.nextId = 1000;
    for (let i = 1; i <= count; i++) {
      fake.table("edificios").push({
        id: `e${i}`,
        nombre: `Edificio ${String(i).padStart(2, "0")}`,
        orden: i,
        activo: !inactive.includes(i),
      });
    }
  };
  const names = () =>
    screen
      .queryAllByTestId(/^catalog-row-/)
      .map((r) => r.getAttribute("data-testid")?.replace("catalog-row-", ""));

  beforeEach(() => {
    fake.state.createError = null;
    fake.state.updates = [];
    fake.state.creates = [];
  });

  it("el encabezado trae el nombre del catálogo, su descripción y la acción de alta", async () => {
    seed(2);
    renderAdmin("edificios");

    expect(await screen.findByRole("heading", { level: 1, name: "Edificios" })).toBeInTheDocument();
    expect(screen.getByText("Edificios y sedes de la organización.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo edificio" })).toBeInTheDocument();
  });

  describe("filtros de estado", () => {
    it("muestran la cantidad de cada uno, sobre la lista completa", async () => {
      seed(5, [2, 4]);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      expect(screen.getByRole("button", { name: "Todos 5" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("button", { name: "Activos 3" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("button", { name: "Desactivados 2" })).toBeInTheDocument();
    });

    it("«Desactivados» deja solo los desactivados, y «Activos» los activos", async () => {
      seed(5, [2, 4]);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(screen.getByRole("button", { name: "Desactivados 2" }));
      expect(names()).toEqual(["Edificio 02", "Edificio 04"]);
      expect(screen.getByRole("button", { name: "Desactivados 2" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      await userEvent.click(screen.getByRole("button", { name: "Activos 3" }));
      expect(names()).toEqual(["Edificio 01", "Edificio 03", "Edificio 05"]);

      await userEvent.click(screen.getByRole("button", { name: "Todos 5" }));
      expect(names()).toHaveLength(5);
    });

    it("las cantidades no cambian al buscar: cuentan sobre la lista completa", async () => {
      seed(5, [2]);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }), "03");

      expect(names()).toEqual(["Edificio 03"]);
      expect(screen.getByRole("button", { name: "Todos 5" })).toBeInTheDocument();
    });

    it("forman un grupo con nombre", async () => {
      seed(1);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      expect(screen.getByRole("group", { name: "Filtrar por estado" })).toBeInTheDocument();
    });
  });

  describe("búsqueda", () => {
    it("filtra por nombre sin distinguir mayúsculas ni acentos", async () => {
      fake.state.tables.clear();
      fake
        .table("edificios")
        .push(
          { id: "e1", nombre: "Anexo Córdoba", orden: 1, activo: true },
          { id: "e2", nombre: "Central", orden: 2, activo: true },
        );
      renderAdmin("edificios");
      await screen.findByText("Central");

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Buscar en el catálogo" }),
        "CORDOBA",
      );

      expect(names()).toEqual(["Anexo Córdoba"]);
    });

    it("sin coincidencias lo dice y no deja la tabla ni el pie", async () => {
      seed(3);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en el catálogo" }), "zzz");

      expect(
        screen.getByText("No hay registros que coincidan con los filtros."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Paginación" })).not.toBeInTheDocument();
    });

    it("borrar la búsqueda vuelve a mostrar todo", async () => {
      seed(3);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      const campo = screen.getByRole("searchbox", { name: "Buscar en el catálogo" });

      await userEvent.type(campo, "02");
      expect(names()).toEqual(["Edificio 02"]);
      await userEvent.clear(campo);

      expect(names()).toHaveLength(3);
    });

    it("en Áreas también busca por el tipo", async () => {
      fake.state.tables.clear();
      const diputado = { id: "t1", nombre: "Diputado" };
      fake
        .table("tiposArea")
        .push(
          { ...diputado, orden: 1, activo: true },
          { id: "t2", nombre: "Bloque", orden: 2, activo: true },
        );
      fake.table("areas").push(
        { id: "a1", nombre: "Sistemas", orden: 1, activo: true, tipo: diputado },
        { id: "a2", nombre: "Redes", orden: 2, activo: true, tipo: diputado },
        {
          id: "a3",
          nombre: "Archivo",
          orden: 3,
          activo: true,
          tipo: { id: "t2", nombre: "Bloque" },
        },
      );
      renderAdmin("areas");
      await screen.findByText("Archivo");

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Buscar en el catálogo" }),
        "diputado",
      );

      expect(names()).toEqual(["Sistemas", "Redes"]);
    });
  });

  describe("paginación", () => {
    it("muestra de a 10, con el tramo y el total de páginas", async () => {
      seed(25);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      expect(names()).toHaveLength(10);
      expect(screen.getByText("Mostrando 1–10 de 25 · Página 1 de 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
    });

    it("«Siguiente» y «Anterior» recorren las páginas", async () => {
      seed(25);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(names()?.[0]).toBe("Edificio 11");
      expect(screen.getByText("Mostrando 11–20 de 25 · Página 2 de 3")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(names()).toHaveLength(5);
      expect(screen.getByText("Mostrando 21–25 de 25 · Página 3 de 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Anterior" }));
      expect(names()?.[0]).toBe("Edificio 11");
    });

    it("buscar o filtrar vuelve a la primera página", async () => {
      seed(25, [20]);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Buscar en el catálogo" }),
        "Edificio",
      );

      expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await userEvent.click(screen.getByRole("button", { name: "Desactivados 1" }));

      expect(names()).toEqual(["Edificio 20"]);
      expect(screen.getByText("Mostrando 1–1 de 1 · Página 1 de 1")).toBeInTheDocument();
    });

    it("con 10 o menos no hay una segunda página", async () => {
      seed(10);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      expect(screen.getByText("Mostrando 1–10 de 10 · Página 1 de 1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    });

    it("sin registros dice que todavía no hay y no muestra el pie", async () => {
      fake.state.tables.clear();
      renderAdmin("edificios");

      expect(await screen.findByText("Todavía no hay registros.")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Paginación" })).not.toBeInTheDocument();
    });

    it("al eliminar el único ítem de la última página, vuelve a la anterior", async () => {
      seed(11);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      expect(names()).toEqual(["Edificio 11"]);

      await userEvent.click(within(row("Edificio 11")).getByRole("button", { name: /^Eliminar/ }));
      await userEvent.click(
        within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }),
      );

      await waitFor(() => expect(names()).toHaveLength(10));
      expect(screen.getByText("Mostrando 1–10 de 10 · Página 1 de 1")).toBeInTheDocument();
    });
  });

  describe("orden", () => {
    it("en la segunda página la primera fila sí puede subir: la lista completa tiene otras antes", async () => {
      seed(15);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));

      expect(within(row("Edificio 11")).getByRole("button", { name: /^Subir/ })).toBeEnabled();
      expect(within(row("Edificio 15")).getByRole("button", { name: /^Bajar/ })).toBeDisabled();
    });

    it("mover la última fila de una página la pasa a la siguiente", async () => {
      seed(15);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(within(row("Edificio 10")).getByRole("button", { name: /^Bajar/ }));

      await waitFor(() =>
        expect(screen.queryByTestId("catalog-row-Edificio 10")).not.toBeInTheDocument(),
      );
      expect(names()?.[9]).toBe("Edificio 11");
    });

    it("con una búsqueda activa las flechas se deshabilitan en todas las filas", async () => {
      seed(5);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      expect(within(row("Edificio 03")).getByRole("button", { name: /^Subir/ })).toBeEnabled();

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Buscar en el catálogo" }),
        "Edificio 0",
      );

      for (const nombre of names()) {
        expect(
          within(row(nombre as string)).getByRole("button", { name: /^Subir/ }),
        ).toBeDisabled();
        expect(
          within(row(nombre as string)).getByRole("button", { name: /^Bajar/ }),
        ).toBeDisabled();
      }
    });

    it("con un filtro de estado activo también, y al volver a «Todos» se habilitan", async () => {
      seed(5, [4]);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(screen.getByRole("button", { name: "Activos 4" }));
      expect(within(row("Edificio 03")).getByRole("button", { name: /^Subir/ })).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Todos 5" }));
      expect(within(row("Edificio 03")).getByRole("button", { name: /^Subir/ })).toBeEnabled();
    });
  });

  describe("cambiar de catálogo", () => {
    it("reinicia la búsqueda, el filtro y la página", async () => {
      seed(25);
      fake.table("tiposArea").push({ id: "t1", nombre: "Diputado", orden: 1, activo: true });
      const { show } = renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      await userEvent.type(
        screen.getByRole("searchbox", { name: "Buscar en el catálogo" }),
        "Edificio",
      );
      await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
      await userEvent.click(screen.getByRole("button", { name: /^Activos/ }));

      show("tiposArea");

      expect(
        await screen.findByRole("heading", { level: 1, name: "Tipos de área" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("searchbox", { name: "Buscar en el catálogo" })).toHaveValue("");
      expect(screen.getByRole("button", { name: /^Todos/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });
  });

  describe("panel y confirmación", () => {
    it("«Nuevo …» abre el panel con su título, y Escape lo cierra sin crear", async () => {
      seed(2);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(screen.getByRole("button", { name: "Nuevo edificio" }));
      expect(await screen.findByRole("dialog", { name: "Nuevo edificio" })).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fake.state.creates).toEqual([]);
    });

    it("«Cancelar» cierra el panel sin guardar", async () => {
      seed(2);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");
      await userEvent.click(within(row("Edificio 01")).getByRole("button", { name: /^Editar/ }));
      expect(await screen.findByRole("dialog", { name: "Editar edificio" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fake.state.updates).toEqual([]);
    });

    it("la confirmación de eliminar tiene el botón relleno en rojo", async () => {
      seed(2);
      renderAdmin("edificios");
      await screen.findByText("Edificio 01");

      await userEvent.click(within(row("Edificio 01")).getByRole("button", { name: /^Eliminar/ }));

      const confirmar = within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Eliminar",
      });
      expect(confirmar).toHaveClass("bg-destructive", "text-destructive-foreground");
    });
  });
});
