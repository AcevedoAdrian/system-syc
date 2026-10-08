import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

const options = vi.hoisted(() => ({
  data: [
    { id: "a1", nombre: "Sistemas", activo: true, orden: 1 },
    { id: "a2", nombre: "Archivo", activo: true, orden: 2 },
  ],
}));
vi.mock("@/features/catalogs/hooks/useCatalogOptions", () => ({
  useCatalogOptions: () => ({ data: options.data }),
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

const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

describe("CatalogOptionSelect", () => {
  it("ofrece los ítems activos que le da useCatalogOptions, en su orden", async () => {
    render(<CatalogOptionSelect id="area" ruta="areas" value="" onChange={() => undefined} />);

    await userEvent.click(screen.getByRole("combobox"));

    expect(optionNames()).toEqual(["Sistemas", "Archivo"]);
  });

  it("elegir una opción avisa con su id", async () => {
    const onChange = vi.fn();
    render(<CatalogOptionSelect id="area" ruta="areas" value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: "Archivo" }));

    expect(onChange).toHaveBeenCalledWith("a2");
  });

  it("muestra el valor elegido en el botón", () => {
    render(<CatalogOptionSelect id="area" ruta="areas" value="a1" onChange={() => undefined} />);

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
          ruta="areas"
          value="viejo"
          onChange={() => undefined}
          current={{ id: "viejo", nombre: "Mantenimiento" }}
        />,
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("Mantenimiento (inactivo)");
      await userEvent.click(screen.getByRole("combobox"));
      expect(optionNames()).toEqual(["Sistemas", "Archivo", "Mantenimiento (inactivo)"]);
    });

    it("no lo repite si todavía está activo", async () => {
      render(
        <CatalogOptionSelect
          id="area"
          ruta="areas"
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
    render(<CatalogOptionSelect id="area" ruta="areas" value="" onChange={() => undefined} />);

    const combobox = screen.getByRole("combobox");
    expect(combobox).not.toHaveAttribute("aria-invalid");
    expect(combobox).not.toHaveAttribute("aria-describedby");
  });

  it("deshabilitado no se abre", async () => {
    render(
      <CatalogOptionSelect id="area" ruta="areas" value="" onChange={() => undefined} disabled />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
