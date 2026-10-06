import { afterEach, describe, expect, it, vi } from "vitest";
import { fechaNoFuturaSchema, hoyArgentina } from "./fields.js";
import {
  changeTicketStatusInputSchema,
  createTicketInputSchema,
  formatTicketNumber,
  listTicketsInputSchema,
  referenciaExternaSchema,
  updateTicketInputSchema,
} from "./tickets.js";

// 2026-10-07T01:30Z son las 22:30 del 06/10 en Argentina (UTC-3): en UTC ya es mañana.
const MEDIANOCHE_UTC = new Date("2026-10-07T01:30:00Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("formatTicketNumber", () => {
  it("rellena con ceros hasta 6 dígitos", () => {
    expect(formatTicketNumber(13)).toBe("TE-000013");
    expect(formatTicketNumber(999999)).toBe("TE-999999");
  });

  it("no recorta ni rellena a partir de TE-1000000", () => {
    expect(formatTicketNumber(1000000)).toBe("TE-1000000");
  });
});

describe("referenciaExternaSchema", () => {
  it("quita los ceros a la izquierda del número", () => {
    expect(referenciaExternaSchema.parse("019092/2026")).toBe("19092/2026");
    expect(referenciaExternaSchema.parse("  7/2026 ")).toBe("7/2026");
  });

  it.each(["000/2026", "0/2026"])("rechaza un número que queda en 0: %s", (v) => {
    expect(referenciaExternaSchema.safeParse(v).success).toBe(false);
  });

  it.each(["5/1999", "5/2101"])("rechaza un año fuera de 2000 a 2100: %s", (v) => {
    expect(referenciaExternaSchema.safeParse(v).success).toBe(false);
  });

  it.each(["19092", "abc/2026", "19092/26", "1/2/2026", ""])("rechaza otro formato: %s", (v) => {
    expect(referenciaExternaSchema.safeParse(v).success).toBe(false);
  });

  it("acepta los extremos 2000 y 2100", () => {
    expect(referenciaExternaSchema.parse("1/2000")).toBe("1/2000");
    expect(referenciaExternaSchema.parse("1/2100")).toBe("1/2100");
  });
});

describe("hoyArgentina y fechaNoFuturaSchema", () => {
  it("calcula hoy en hora de Argentina, no en UTC", () => {
    expect(hoyArgentina(MEDIANOCHE_UTC)).toBe("2026-10-06");
  });

  it("rechaza mañana (en Argentina) y acepta hoy y ayer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(MEDIANOCHE_UTC);

    expect(fechaNoFuturaSchema.safeParse("2026-10-07").success).toBe(false); // "hoy" en UTC
    expect(fechaNoFuturaSchema.safeParse("2026-10-06").success).toBe(true);
    expect(fechaNoFuturaSchema.safeParse("2026-10-05").success).toBe(true);
  });

  it("rechaza lo que no es una fecha", () => {
    expect(fechaNoFuturaSchema.safeParse("2026-13-40").success).toBe(false);
    expect(fechaNoFuturaSchema.safeParse("06/10/2026").success).toBe(false);
  });
});

describe("createTicketInputSchema", () => {
  const base = {
    departamentoId: "dep1",
    titulo: "  Impresora rota  ",
    prioridadId: "pri1",
    fechaRecepcion: "2026-10-01",
  };

  it("acepta el mínimo, recorta el título y deja los opcionales en null", () => {
    expect(createTicketInputSchema.parse(base)).toEqual({
      departamentoId: "dep1",
      titulo: "Impresora rota",
      descripcion: null,
      prioridadId: "pri1",
      fechaRecepcion: "2026-10-01",
      actuacionSimple: null,
      proveedorId: null,
      referenciaExterna: null,
    });
  });

  it("rechaza un título vacío tras el trim y uno de más de 200", () => {
    expect(createTicketInputSchema.safeParse({ ...base, titulo: "   " }).success).toBe(false);
    expect(createTicketInputSchema.safeParse({ ...base, titulo: "a".repeat(201) }).success).toBe(
      false,
    );
  });

  it("rechaza una referencia sin proveedor, con el error en `referenciaExterna`", () => {
    const result = createTicketInputSchema.safeParse({ ...base, referenciaExterna: "1/2026" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["referenciaExterna"]);
  });

  it("acepta la referencia con proveedor y la normaliza", () => {
    const result = createTicketInputSchema.parse({
      ...base,
      proveedorId: "prov1",
      referenciaExterna: "019092/2026",
    });

    expect(result.referenciaExterna).toBe("19092/2026");
  });

  it("trata una referencia en blanco como null, aun sin proveedor", () => {
    expect(createTicketInputSchema.parse({ ...base, referenciaExterna: "  " })).toMatchObject({
      referenciaExterna: null,
    });
  });

  it("rechaza una fecha de recepción futura y no acepta campos que decide el servidor", () => {
    expect(
      createTicketInputSchema.safeParse({ ...base, fechaRecepcion: "2999-01-01" }).success,
    ).toBe(false);
    const parsed = createTicketInputSchema.parse({
      ...base,
      numero: 1,
      estadoId: "e",
      createdBy: "u",
    });
    expect(parsed).not.toHaveProperty("numero");
    expect(parsed).not.toHaveProperty("estadoId");
    expect(parsed).not.toHaveProperty("createdBy");
  });
});

describe("updateTicketInputSchema", () => {
  const base = {
    ticketId: "t1",
    updatedAt: "2026-10-06T10:00:00.000Z",
    titulo: "Impresora",
    prioridadId: "pri1",
    fechaRecepcion: "2026-10-01",
    fechaCierre: null,
    fechaReabierto: null,
    notificado: false,
  };

  it("reemplaza todo: un campo que no viene o viene en blanco se guarda como null", () => {
    const result = updateTicketInputSchema.parse({ ...base, areaId: "  ", descripcion: "" });

    expect(result).toMatchObject({
      areaId: null,
      edificioId: null,
      tipoId: null,
      moduloId: null,
      proveedorId: null,
      descripcion: null,
      actuacionSimple: null,
      referenciaExterna: null,
      solucionDescripcion: null,
    });
  });

  it("rechaza una referencia sin proveedor", () => {
    const result = updateTicketInputSchema.safeParse({ ...base, referenciaExterna: "1/2026" });

    expect(result.success).toBe(false);
  });

  it("exige `updatedAt` para el bloqueo optimista", () => {
    const { updatedAt: _omitido, ...sinVersion } = base;

    expect(updateTicketInputSchema.safeParse(sinVersion).success).toBe(false);
  });

  it("no acepta cambiar el estado ni el departamento por esta vía", () => {
    const parsed = updateTicketInputSchema.parse({ ...base, estadoId: "e", departamentoId: "d" });

    expect(parsed).not.toHaveProperty("estadoId");
    expect(parsed).not.toHaveProperty("departamentoId");
  });
});

describe("changeTicketStatusInputSchema", () => {
  const base = { ticketId: "t1", updatedAt: "2026-10-06T10:00:00.000Z", estadoId: "e1" };

  it("deja ausentes (undefined) las fechas y la solución que no vienen", () => {
    const result = changeTicketStatusInputSchema.parse(base);

    expect(result.fechaCierre).toBeUndefined();
    expect(result.fechaReabierto).toBeUndefined();
    expect(result.solucionDescripcion).toBeUndefined();
  });

  it("distingue una solución en blanco (la borra: null) de una ausente (no la toca)", () => {
    expect(
      changeTicketStatusInputSchema.parse({ ...base, solucionDescripcion: "   " })
        .solucionDescripcion,
    ).toBeNull();
    expect(
      changeTicketStatusInputSchema.parse({ ...base, solucionDescripcion: " Se reinició " })
        .solucionDescripcion,
    ).toBe("Se reinició");
  });

  it("rechaza una fecha de cierre o de reapertura futura", () => {
    expect(
      changeTicketStatusInputSchema.safeParse({ ...base, fechaCierre: "2999-01-01" }).success,
    ).toBe(false);
    expect(
      changeTicketStatusInputSchema.safeParse({ ...base, fechaReabierto: "2999-01-01" }).success,
    ).toBe(false);
  });
});

describe("listTicketsInputSchema", () => {
  it("sin nada, pide la página 1 sin filtros", () => {
    expect(listTicketsInputSchema.parse({})).toEqual({ page: 1 });
  });

  it("convierte la página, que llega como texto en la query string", () => {
    expect(listTicketsInputSchema.parse({ page: "2" }).page).toBe(2);
  });

  it.each(["0", "-1", "1.5", "abc", ""])("rechaza una página inválida: %j", (page) => {
    expect(listTicketsInputSchema.safeParse({ page }).success).toBe(false);
  });

  it("una búsqueda de solo espacios equivale a no buscar", () => {
    expect(listTicketsInputSchema.parse({ q: "  " }).q).toBeUndefined();
    expect(listTicketsInputSchema.parse({ q: "" }).q).toBeUndefined();
  });

  it("recorta la búsqueda y rechaza más de 200 caracteres", () => {
    expect(listTicketsInputSchema.parse({ q: "  impresora " }).q).toBe("impresora");
    expect(listTicketsInputSchema.safeParse({ q: "a".repeat(201) }).success).toBe(false);
  });

  it("un filtro vacío equivale a no filtrar", () => {
    const parsed = listTicketsInputSchema.parse({ estadoId: "", areaId: "a1" });
    expect(parsed.estadoId).toBeUndefined();
    expect(parsed.areaId).toBe("a1");
  });

  it("acepta un rango de fechas inclusivo, también de un solo día", () => {
    const rango = { fechaRecepcionDesde: "2026-10-01", fechaRecepcionHasta: "2026-10-01" };
    expect(listTicketsInputSchema.safeParse(rango).success).toBe(true);
  });

  it("rechaza «desde» posterior a «hasta», con el error en «hasta»", () => {
    const result = listTicketsInputSchema.safeParse({
      fechaRecepcionDesde: "2026-10-05",
      fechaRecepcionHasta: "2026-10-01",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["fechaRecepcionHasta"]);
  });

  it("rechaza una fecha que no es YYYY-MM-DD", () => {
    expect(listTicketsInputSchema.safeParse({ fechaRecepcionDesde: "01/10/2026" }).success).toBe(
      false,
    );
  });
});
