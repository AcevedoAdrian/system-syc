import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "../hooks/catalog-api";
import { CatalogTable } from "./CatalogTable";

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
      expect(within(row(nombre)).queryByRole("button", { name: "Eliminar" })).toBeNull();
      // Pero sí se pueden editar, mover y desactivar.
      expect(within(row(nombre)).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    }
    expect(within(row("Pendiente")).queryByText("De sistema")).toBeNull();
    expect(within(row("Pendiente")).getByRole("button", { name: "Eliminar" })).toBeInTheDocument();
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
    expect(within(row("Cerrado")).getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
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

  it("los catálogos simples solo tienen Nombre y Estado", () => {
    render(<CatalogTable ruta="areas" items={estados} {...handlers} />);

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Nombre",
      "Estado",
      "Acciones",
    ]);
  });
});
