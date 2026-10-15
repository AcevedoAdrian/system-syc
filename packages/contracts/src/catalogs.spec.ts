import type { AnyContractRouter, InferContractRouterInputs } from "@orpc/contract";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  areaInputSchema,
  areaLabel,
  catalogItemConColorInputSchema,
  catalogItemInputSchema,
  catalogRutas,
  catalogsContract,
  estadoTicketSchema,
  prioridadSchema,
  proveedorInputSchema,
  tonoSchema,
  tonos,
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

describe("areaInputSchema", () => {
  it("exige el tipo", () => {
    expect(areaInputSchema.safeParse({ nombre: "Acosta" }).success).toBe(false);
    expect(areaInputSchema.safeParse({ nombre: "Acosta", tipoId: "" }).success).toBe(false);
    expect(areaInputSchema.parse({ nombre: " Acosta ", tipoId: "t1" })).toEqual({
      nombre: "Acosta",
      tipoId: "t1",
    });
  });
});

describe("tonos", () => {
  it("son los 16 de la base visual: los 8 del SPEC 09 y los 8 de la ampliación, en ese orden", () => {
    expect([...tonos]).toEqual([
      "gris",
      "rojo",
      "naranja",
      "amarillo",
      "verde",
      "azul",
      "violeta",
      "rosa",
      "celeste",
      "turquesa",
      "lima",
      "marron",
      "indigo",
      "magenta",
      "bordo",
      "pizarra",
    ]);
    expect(new Set(tonos).size).toBe(16);
  });

  it("los valores son identificadores simples: minúsculas ASCII, sin acentos", () => {
    for (const tono of tonos) expect(tono).toMatch(/^[a-z]+$/);
  });

  it("tonoSchema acepta cada tono y rechaza cualquier otro valor", () => {
    for (const tono of tonos) expect(tonoSchema.safeParse(tono).success).toBe(true);
    expect(tonoSchema.safeParse("fucsia").success).toBe(false);
    expect(tonoSchema.safeParse("Marrón").success).toBe(false); // el valor es `marron`; el acento es solo de la etiqueta
    expect(tonoSchema.safeParse("Rojo").success).toBe(false);
    expect(tonoSchema.safeParse("").success).toBe(false);
    expect(tonoSchema.safeParse(null).success).toBe(false);
  });
});

describe("catalogItemConColorInputSchema", () => {
  it("exige el color", () => {
    expect(catalogItemConColorInputSchema.safeParse({ nombre: "Alta" }).success).toBe(false);
  });

  it("rechaza un color que no es uno de los 16 tonos", () => {
    expect(
      catalogItemConColorInputSchema.safeParse({ nombre: "Alta", color: "fucsia" }).success,
    ).toBe(false);
  });

  it("recorta el nombre y conserva el color", () => {
    expect(catalogItemConColorInputSchema.parse({ nombre: " Alta ", color: "naranja" })).toEqual({
      nombre: "Alta",
      color: "naranja",
    });
  });

  it("ignora los campos que el cliente no puede mandar", () => {
    const result = catalogItemConColorInputSchema.parse({
      nombre: "Hecho",
      color: "verde",
      clave: "FINALIZADO",
      orden: 3,
    });

    expect(result).toEqual({ nombre: "Hecho", color: "verde" });
  });
});

describe("salida de Prioridades y Estados", () => {
  const base = { id: "x", nombre: "Alta", orden: 1, activo: true };

  it("incluye el color", () => {
    expect(prioridadSchema.parse({ ...base, color: "naranja" }).color).toBe("naranja");
    expect(estadoTicketSchema.parse({ ...base, clave: null, color: "azul" }).color).toBe("azul");
  });

  it("rechaza un ítem sin color", () => {
    expect(prioridadSchema.safeParse(base).success).toBe(false);
    expect(estadoTicketSchema.safeParse({ ...base, clave: null }).success).toBe(false);
  });
});

describe("areaLabel", () => {
  it("formatea «Tipo · Nombre»", () => {
    expect(areaLabel({ nombre: "Acosta", tipo: { nombre: "Diputado" } })).toBe("Diputado · Acosta");
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
      tipoId: string;
      itemId: string;
    }>();
    expectTypeOf<Inputs<typeof catalogsContract.prioridades.update>>().toEqualTypeOf<{
      nombre: string;
      color: (typeof tonos)[number];
      itemId: string;
    }>();
    expectTypeOf<Inputs<typeof catalogsContract.estados.create>>().toHaveProperty("color");
    expectTypeOf<Inputs<typeof catalogsContract.proveedores.update>>().toHaveProperty("itemId");
    expectTypeOf<Inputs<typeof catalogsContract.proveedores.update>>().toHaveProperty("correo");
  });
});
