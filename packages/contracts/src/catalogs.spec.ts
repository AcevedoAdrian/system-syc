import type { AnyContractRouter, InferContractRouterInputs } from "@orpc/contract";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  catalogItemInputSchema,
  catalogRutas,
  catalogsContract,
  proveedorInputSchema,
} from "./catalogs.js";

describe("proveedorInputSchema", () => {
  it("guarda como null un campo opcional en blanco", () => {
    const result = proveedorInputSchema.parse({
      nombre: "Acme",
      contacto: "  ",
      telefono: "",
      correo: " ",
      sitioWeb: "   ",
    });

    expect(result).toEqual({
      nombre: "Acme",
      contacto: null,
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
  });

  it("deja en null los campos opcionales que no vienen", () => {
    expect(proveedorInputSchema.parse({ nombre: "Acme" })).toEqual({
      nombre: "Acme",
      contacto: null,
      telefono: null,
      correo: null,
      sitioWeb: null,
    });
  });

  it("recorta los campos opcionales con valor", () => {
    const result = proveedorInputSchema.parse({
      nombre: " Acme ",
      contacto: " Ana ",
      telefono: " +54 11 5555-0000 ",
      correo: " soporte@acme.com ",
      sitioWeb: " https://acme.com ",
    });

    expect(result).toEqual({
      nombre: "Acme",
      contacto: "Ana",
      telefono: "+54 11 5555-0000",
      correo: "soporte@acme.com",
      sitioWeb: "https://acme.com",
    });
  });

  it("rechaza un sitio web sin esquema o con otro esquema", () => {
    expect(proveedorInputSchema.safeParse({ nombre: "Acme", sitioWeb: "www.x.com" }).success).toBe(
      false,
    );
    expect(
      proveedorInputSchema.safeParse({ nombre: "Acme", sitioWeb: "ftp://proveedor.com" }).success,
    ).toBe(false);
    expect(
      proveedorInputSchema.safeParse({ nombre: "Acme", sitioWeb: "http://proveedor.com" }).success,
    ).toBe(true);
  });

  it("rechaza un correo inválido", () => {
    expect(proveedorInputSchema.safeParse({ nombre: "Acme", correo: "soporte@" }).success).toBe(
      false,
    );
  });

  it("rechaza un nombre vacío o con solo espacios", () => {
    expect(proveedorInputSchema.safeParse({ nombre: "   " }).success).toBe(false);
  });
});

describe("catalogItemInputSchema", () => {
  it("ignora los campos que el cliente no puede mandar", () => {
    const result = catalogItemInputSchema.parse({
      nombre: "Sistemas",
      orden: 9,
      nombreNormalizado: "x",
      clave: "CERRADO",
      createdBy: "otro",
    });

    expect(result).toEqual({ nombre: "Sistemas" });
  });
});

describe("catalogsContract", () => {
  it("tiene un contrato por cada ruta, en el orden de las pestañas", () => {
    expect(Object.keys(catalogsContract)).toEqual([...catalogRutas]);
  });
});

describe("tipos del contrato", () => {
  // `tsc` es quien verifica estas aserciones: si el genérico de `catalogContract` pierde la forma
  // de la entrada, `update` queda como `Record<string, unknown>` y el controller no compila.
  it("la entrada de update conserva los campos de cada catálogo", () => {
    type Inputs<T extends AnyContractRouter> = InferContractRouterInputs<T>;

    expectTypeOf<Inputs<typeof catalogsContract.areas.update>>().toEqualTypeOf<{
      nombre: string;
      itemId: string;
    }>();
    expectTypeOf<Inputs<typeof catalogsContract.proveedores.update>>().toHaveProperty("itemId");
    expectTypeOf<Inputs<typeof catalogsContract.proveedores.update>>().toHaveProperty("correo");
  });
});
