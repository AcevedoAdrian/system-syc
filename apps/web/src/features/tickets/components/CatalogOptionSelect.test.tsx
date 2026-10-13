import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type OptionItem = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  tipo?: { id: string; nombre: string };
};

const options = vi.hoisted(() => ({
  // Mientras el catálogo carga, `useQuery` no trae datos y `isPending` es verdadero.
  pending: false,
  data: [
    { id: "a1", nombre: "Sistemas", activo: true, orden: 1 },
    { id: "a2", nombre: "Archivo", activo: true, orden: 2 },
  ] as OptionItem[],
}));
vi.mock("@/features/catalogs/hooks/useCatalogOptions", () => ({
  useCatalogOptions: () => ({
    data: options.pending ? undefined : options.data,
    isPending: options.pending,
  }),
}));

// Los tipos de área, en el orden de la administración (el 3.º está desactivado).
const tipos = vi.hoisted(() => ({
  data: [
    { id: "dip", nombre: "Diputado", activo: true, orden: 1 },
    { id: "blo", nombre: "Bloque", activo: true, orden: 2 },
    { id: "com", nombre: "Comisión", activo: false, orden: 3 },
    { id: "ofi", nombre: "Oficina", activo: true, orden: 4 },
  ],
}));
vi.mock("@/features/catalogs/hooks/useCatalog", () => ({
  useCatalog: () => ({ data: tipos.data }),
}));

import { CatalogOptionSelect } from "./CatalogOptionSelect";

// jsdom no implementa lo que Radix Select pide para abrirse.
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

const initialOptions = [...options.data];

afterEach(() => {
  options.pending = false;
  options.data = [...initialOptions];
});

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("CatalogOptionSelect", () => {
  it("ofrece los ítems activos que le da useCatalogOptions, en su orden", async () => {
    render(<CatalogOptionSelect id="area" ruta="edificios" value="" onChange={() => undefined} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(optionNames()).toEqual(["Sistemas", "Archivo"]);
  });

  it("elegir una opción avisa con su id", async () => {
    const onChange = vi.fn();
    render(<CatalogOptionSelect id="area" ruta="edificios" value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Archivo" }));

    expect(onChange).toHaveBeenCalledWith("a2");
  });

  it("muestra el valor elegido en el botón", () => {
    render(
      <CatalogOptionSelect id="area" ruta="edificios" value="a1" onChange={() => undefined} />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Sistemas");
  });

  it("con `emptyLabel` ofrece «sin valor» primero, y elegirlo avisa con una cadena vacía", async () => {
    const onChange = vi.fn();
    render(
      <CatalogOptionSelect
        id="prov"
        ruta="proveedores"
        value="a1"
        onChange={onChange}
        emptyLabel="Sin proveedor"
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    expect(optionNames()).toEqual(["Sin proveedor", "Sistemas", "Archivo"]);
    await userEvent.click(screen.getByRole("option", { name: "Sin proveedor" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("sin valor y con `emptyLabel` muestra «sin valor» elegido", () => {
    render(
      <CatalogOptionSelect
        id="prov"
        ruta="proveedores"
        value=""
        onChange={() => undefined}
        emptyLabel="Sin proveedor"
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Sin proveedor");
  });

  describe("valor actual del ticket que ya no está entre las opciones", () => {
    it("lo sigue mostrando, marcado como inactivo, para que guardar sin tocarlo no lo borre", async () => {
      render(
        <CatalogOptionSelect
          id="area"
          ruta="edificios"
          value="viejo"
          onChange={() => undefined}
          current={{ id: "viejo", nombre: "Mantenimiento" }}
        />,
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("Mantenimiento (inactivo)");
      await userEvent.click(screen.getByRole("combobox"));
      expect(optionNames()).toEqual(["Sistemas", "Archivo", "Mantenimiento (inactivo)"]);
    });

    it("mientras carga el catálogo lo muestra sin marca: todavía no se sabe si sigue activo", () => {
      options.pending = true;
      render(
        <CatalogOptionSelect
          id="area"
          ruta="edificios"
          value="a1"
          onChange={() => undefined}
          current={{ id: "a1", nombre: "Sistemas" }}
        />,
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("Sistemas");
      expect(screen.getByRole("combobox")).not.toHaveTextContent("(inactivo)");
    });

    it("al llegar el catálogo, un valor que ya no está activo pasa a mostrarse marcado", () => {
      options.pending = true;
      const props = {
        id: "area",
        ruta: "edificios" as const,
        value: "viejo",
        onChange: () => undefined,
        current: { id: "viejo", nombre: "Mantenimiento" },
      };
      const { rerender } = render(<CatalogOptionSelect {...props} />);
      expect(screen.getByRole("combobox")).toHaveTextContent(/^Mantenimiento$/);

      options.pending = false;
      rerender(<CatalogOptionSelect {...props} />);

      expect(screen.getByRole("combobox")).toHaveTextContent("Mantenimiento (inactivo)");
    });

    it("no lo repite si todavía está activo", async () => {
      render(
        <CatalogOptionSelect
          id="area"
          ruta="edificios"
          value="a1"
          onChange={() => undefined}
          current={{ id: "a1", nombre: "Sistemas" }}
        />,
      );

      await userEvent.click(screen.getByRole("combobox"));

      expect(optionNames()).toEqual(["Sistemas", "Archivo"]);
    });
  });

  it("`excludeId` quita un ítem de las opciones (el estado actual al cambiar de estado)", async () => {
    render(
      <CatalogOptionSelect
        id="estado"
        ruta="estados"
        value=""
        onChange={() => undefined}
        excludeId="a1"
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));

    expect(optionNames()).toEqual(["Archivo"]);
  });

  it("pasa al botón del selector lo que entrega `Field`: error, ayuda y campo obligatorio", () => {
    render(
      <>
        <p id="prio-error">Elegí una prioridad.</p>
        <CatalogOptionSelect
          id="prio"
          ruta="prioridades"
          value=""
          onChange={() => undefined}
          aria-invalid
          aria-describedby="prio-error"
          aria-required
        />
      </>,
    );

    const combobox = screen.getByRole("combobox");
    expect(combobox).toHaveAttribute("aria-invalid", "true");
    expect(combobox).toHaveAttribute("aria-required", "true");
    expect(combobox).toHaveAccessibleDescription("Elegí una prioridad.");
  });

  it("sin esos atributos el botón no los lleva", () => {
    render(<CatalogOptionSelect id="area" ruta="edificios" value="" onChange={() => undefined} />);

    const combobox = screen.getByRole("combobox");
    expect(combobox).not.toHaveAttribute("aria-invalid");
    expect(combobox).not.toHaveAttribute("aria-describedby");
  });

  it("deshabilitado no se abre", async () => {
    render(
      <CatalogOptionSelect
        id="area"
        ruta="edificios"
        value=""
        onChange={() => undefined}
        disabled
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});

describe("CatalogOptionSelect: áreas agrupadas por tipo", () => {
  const diputado = { id: "dip", nombre: "Diputado" };
  const bloque = { id: "blo", nombre: "Bloque" };
  const comision = { id: "com", nombre: "Comisión" };

  // El orden de Áreas es uno solo para todo el catálogo: las del mismo tipo no son contiguas.
  const areasActivas = () => [
    { id: "a1", nombre: "UCR", activo: true, orden: 1, tipo: bloque },
    { id: "a2", nombre: "Acosta", activo: true, orden: 2, tipo: diputado },
    { id: "a3", nombre: "Salud", activo: true, orden: 3, tipo: comision },
    { id: "a4", nombre: "Benitez", activo: true, orden: 4, tipo: diputado },
  ];

  it("muestra un título por tipo, en el orden de los tipos, con las áreas en su orden", async () => {
    options.data = areasActivas();
    render(<CatalogOptionSelect id="area" ruta="areas" value="" onChange={() => undefined} />);

    await userEvent.click(screen.getByRole("combobox"));

    const groups = screen.getAllByRole("group").map((g) => g.textContent);
    expect(groups).toEqual(["DiputadoAcostaBenitez", "BloqueUCR", "ComisiónSalud"]);
  });

  it("no muestra un grupo sin áreas activas, pero un tipo desactivado conserva sus áreas", async () => {
    options.data = [{ id: "a3", nombre: "Salud", activo: true, orden: 1, tipo: comision }];
    render(<CatalogOptionSelect id="area" ruta="areas" value="" onChange={() => undefined} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(screen.getAllByRole("group").map((g) => g.textContent)).toEqual(["ComisiónSalud"]);
  });

  it("el valor elegido se ve como «Tipo · Nombre» y elegir avisa con el id", async () => {
    options.data = areasActivas();
    const onChange = vi.fn();
    const { rerender } = render(
      <CatalogOptionSelect id="area" ruta="areas" value="" onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Acosta" }));
    expect(onChange).toHaveBeenCalledWith("a2");

    rerender(<CatalogOptionSelect id="area" ruta="areas" value="a2" onChange={onChange} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Diputado · Acosta");
  });

  it("con `emptyLabel` ofrece «sin valor» antes de los grupos", async () => {
    options.data = areasActivas();
    render(
      <CatalogOptionSelect
        id="area"
        ruta="areas"
        value=""
        onChange={() => undefined}
        emptyLabel="Sin asignar"
      />,
    );

    // Abierto, Radix oculta el botón del árbol de accesibilidad: se lee antes.
    expect(screen.getByRole("combobox")).toHaveTextContent("Sin asignar");
    await userEvent.click(screen.getByRole("combobox"));

    expect(optionNames()[0]).toBe("Sin asignar");
  });

  it("un área actual desactivada se sigue mostrando, con su tipo y marcada", async () => {
    options.data = areasActivas();
    render(
      <CatalogOptionSelect
        id="area"
        ruta="areas"
        value="vieja"
        onChange={() => undefined}
        current={{ id: "vieja", nombre: "Archivo", tipo: diputado }}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveTextContent("Diputado · Archivo (inactivo)");
    await userEvent.click(screen.getByRole("combobox"));
    expect(optionNames()).toContain("Diputado · Archivo (inactivo)");
  });
});
