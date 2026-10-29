import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CatalogTable } from "@/features/catalogs/components/CatalogTable";
import type { CatalogEntry } from "@/features/catalogs/hooks/catalog-api";

const handlers = {
  onMove: vi.fn(),
  onEdit: vi.fn(),
  onToggleActive: vi.fn(),
  onRemove: vi.fn(),
};

const estados: CatalogEntry[] = [
  { id: "e1", nombre: "Pendiente", orden: 1, activo: true, clave: null },
  { id: "e4", nombre: "Finalizado", orden: 2, activo: true, clave: "FINALIZADO" },
  { id: "e5", nombre: "Cerrado", orden: 3, activo: false, clave: "CERRADO" },
  { id: "e6", nombre: "Cancelado", orden: 4, activo: true, clave: "CANCELADO" },
  { id: "e7", nombre: "Reabierto", orden: 5, activo: true, clave: "REABIERTO" },
];

const row = (nombre: string) => screen.getByTestId(`catalog-row-${nombre}`);

describe("CatalogTable: estados", () => {
  it("las 4 filas de sistema muestran 'De sistema' y no tienen Eliminar", () => {
    render(<CatalogTable ruta="estados" items={estados} {...handlers} />);

    for (const nombre of ["Finalizado", "Cerrado", "Cancelado", "Reabierto"]) {
      expect(within(row(nombre)).getByText("De sistema")).toBeInTheDocument();
      expect(within(row(nombre)).queryByRole("button", { name: /^Eliminar/ })).toBeNull();
      // Pero sí se pueden editar, mover y desactivar.
      expect(within(row(nombre)).getByRole("button", { name: /^Editar/ })).toBeInTheDocument();
    }
    expect(within(row("Pendiente")).queryByText("De sistema")).toBeNull();
    expect(within(row("Pendiente")).getByRole("button", { name: /^Eliminar/ })).toBeInTheDocument();
  });

  it("no muestra la clave como texto", () => {
    render(<CatalogTable ruta="estados" items={estados} {...handlers} />);

    for (const clave of ["FINALIZADO", "CERRADO", "CANCELADO", "REABIERTO"]) {
      expect(screen.queryByText(clave)).toBeNull();
    }
  });

  it("muestra Reactivar en un estado desactivado", () => {
    render(<CatalogTable ruta="estados" items={estados} {...handlers} />);

    expect(within(row("Cerrado")).getByText("Desactivado")).toBeInTheDocument();
    expect(within(row("Cerrado")).getByRole("button", { name: /^Reactivar/ })).toBeInTheDocument();
  });
});

describe("CatalogTable: proveedores", () => {
  const proveedores: CatalogEntry[] = [
    {
      id: "p1",
      nombre: "Acme",
      orden: 1,
      activo: true,
      contacto: "Ana",
      telefono: "+54 11 5555-0000",
      correo: "soporte@acme.com",
      sitioWeb: "https://acme.com",
    },
    {
      id: "p2",
      nombre: "Solo nombre",
      orden: 2,
      activo: true,
      contacto: null,
      telefono: null,
      correo: null,
      sitioWeb: null,
    },
  ];

  it("suma las columnas de contacto y muestra — donde no hay dato", () => {
    render(<CatalogTable ruta="proveedores" items={proveedores} {...handlers} />);

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "Orden",
      "Nombre",
      "Contacto",
      "Teléfono",
      "Correo",
      "Sitio web",
      "Estado",
      "Acciones",
    ]);
    expect(within(row("Acme")).getByText("soporte@acme.com")).toBeInTheDocument();
    expect(within(row("Acme")).getByText("https://acme.com")).toBeInTheDocument();
    expect(within(row("Solo nombre")).getAllByText("—")).toHaveLength(4);
  });

  it("los catálogos simples solo tienen Orden, Nombre y Estado", () => {
    render(<CatalogTable ruta="edificios" items={estados} {...handlers} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Orden",
      "Nombre",
      "Estado",
      "Acciones",
    ]);
  });
});

describe("CatalogTable: tipos de ticket", () => {
  const larga = "Texto largo. ".repeat(40).trim();
  const tipos: CatalogEntry[] = [
    { id: "k1", nombre: "Incidente", orden: 1, activo: true, descripcion: "Algo falló." },
    { id: "k2", nombre: "Sin texto", orden: 2, activo: true, descripcion: null },
    { id: "k3", nombre: "Larga", orden: 3, activo: true, descripcion: larga },
  ];

  it("suma la columna Descripción después del nombre y muestra — si falta", () => {
    render(<CatalogTable ruta="tipos" items={tipos} {...handlers} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Orden",
      "Nombre",
      "Descripción",
      "Estado",
      "Acciones",
    ]);
    expect(within(row("Incidente")).getByText("Algo falló.")).toBeInTheDocument();
    expect(within(row("Sin texto")).getByText("—")).toBeInTheDocument();
  });

  it("una descripción larga se corta en la tabla pero conserva el texto entero", () => {
    render(<CatalogTable ruta="tipos" items={tipos} {...handlers} />);

    const celda = within(row("Larga")).getByText(larga);
    expect(celda).toHaveClass("truncate");
    expect(celda).toHaveAttribute("title", larga);
  });
});

describe("CatalogTable: áreas", () => {
  const areas: CatalogEntry[] = [
    { id: "a1", nombre: "Acosta", orden: 1, activo: true, tipo: { id: "t1", nombre: "Diputado" } },
    { id: "a2", nombre: "Sin tipo", orden: 2, activo: true },
  ];

  it("suma la columna Tipo antes del nombre (y después del orden) y muestra — si falta", () => {
    render(<CatalogTable ruta="areas" items={areas} {...handlers} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Orden",
      "Tipo",
      "Nombre",
      "Estado",
      "Acciones",
    ]);
    expect(within(row("Acosta")).getByText("Diputado")).toBeInTheDocument();
    expect(within(row("Sin tipo")).getByText("—")).toBeInTheDocument();
  });
});

describe("CatalogTable: acciones", () => {
  const edificios: CatalogEntry[] = [
    { id: "e1", nombre: "Anexo", orden: 1, activo: true },
    { id: "e2", nombre: "Central", orden: 2, activo: true },
    { id: "e3", nombre: "Depósito", orden: 3, activo: false },
  ];

  it("cada botón de ícono lleva el nombre del registro en su etiqueta y en su tooltip", () => {
    render(<CatalogTable ruta="edificios" items={edificios} {...handlers} />);

    const fila = within(row("Central"));
    for (const name of [
      "Subir «Central»",
      "Bajar «Central»",
      "Editar «Central»",
      "Desactivar «Central»",
      "Eliminar «Central»",
    ]) {
      expect(fila.getByRole("button", { name })).toHaveAttribute("title", name);
    }
    expect(
      within(row("Depósito")).getByRole("button", { name: "Reactivar «Depósito»" }),
    ).toBeInTheDocument();
  });

  it("cada acción avisa con su registro", async () => {
    const user = userEvent.setup();
    for (const fn of Object.values(handlers)) fn.mockReset();
    render(<CatalogTable ruta="edificios" items={edificios} {...handlers} />);
    const fila = within(row("Central"));

    await user.click(fila.getByRole("button", { name: "Subir «Central»" }));
    await user.click(fila.getByRole("button", { name: "Bajar «Central»" }));
    await user.click(fila.getByRole("button", { name: "Editar «Central»" }));
    await user.click(fila.getByRole("button", { name: "Desactivar «Central»" }));
    await user.click(fila.getByRole("button", { name: "Eliminar «Central»" }));

    expect(handlers.onMove).toHaveBeenNthCalledWith(1, edificios[1], "subir");
    expect(handlers.onMove).toHaveBeenNthCalledWith(2, edificios[1], "bajar");
    expect(handlers.onEdit).toHaveBeenCalledWith(edificios[1]);
    expect(handlers.onToggleActive).toHaveBeenCalledWith(edificios[1]);
    expect(handlers.onRemove).toHaveBeenCalledWith(edificios[1]);
  });

  it("la primera fila no puede subir y la última no puede bajar", () => {
    render(<CatalogTable ruta="edificios" items={edificios} {...handlers} />);

    expect(within(row("Anexo")).getByRole("button", { name: "Subir «Anexo»" })).toBeDisabled();
    expect(within(row("Anexo")).getByRole("button", { name: "Bajar «Anexo»" })).toBeEnabled();
    expect(
      within(row("Depósito")).getByRole("button", { name: "Bajar «Depósito»" }),
    ).toBeDisabled();
  });

  it("con `orderIds`, el primero y el último son los de la lista completa, no los de la página", () => {
    render(
      <CatalogTable
        ruta="edificios"
        items={[edificios[1] as CatalogEntry]}
        orderIds={["e1", "e2", "e3"]}
        {...handlers}
      />,
    );

    // «Central» está en el medio de la lista completa: puede subir y bajar aunque sea la única fila.
    expect(within(row("Central")).getByRole("button", { name: "Subir «Central»" })).toBeEnabled();
    expect(within(row("Central")).getByRole("button", { name: "Bajar «Central»" })).toBeEnabled();
  });

  it("con `canReorder` en falso, las flechas quedan deshabilitadas en todas las filas", () => {
    render(<CatalogTable ruta="edificios" items={edificios} canReorder={false} {...handlers} />);

    for (const nombre of ["Anexo", "Central", "Depósito"]) {
      expect(within(row(nombre)).getByRole("button", { name: `Subir «${nombre}»` })).toBeDisabled();
      expect(within(row(nombre)).getByRole("button", { name: `Bajar «${nombre}»` })).toBeDisabled();
    }
  });

  it("el estado es una píldora con su punto, que no se lee en voz alta", () => {
    render(<CatalogTable ruta="edificios" items={edificios} {...handlers} />);

    const activo = within(row("Anexo")).getByText("Activo");
    expect(activo).toHaveClass("rounded-full");
    expect(activo.firstElementChild).toHaveClass("bg-teal");
    expect(activo.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(within(row("Depósito")).getByText("Desactivado").firstElementChild).toHaveClass(
      "border-neutral-dot",
    );
  });
});
