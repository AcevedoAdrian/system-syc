import { describe, expect, it } from "vitest";
import { describeChanges, formatHistoryValue, formatTimestamp } from "./ticket-fields";

describe("formatHistoryValue", () => {
  it("una referencia se muestra por su nombre, el que guardó la foto", () => {
    expect(formatHistoryValue("estado", { id: "e1", nombre: "En progreso" })).toBe("En progreso");
    expect(formatHistoryValue("area", { id: "a1", nombre: "Sistemas" })).toBe("Sistemas");
  });

  it("sin valor es un guion", () => {
    expect(formatHistoryValue("area", null)).toBe("—");
    expect(formatHistoryValue("descripcion", undefined)).toBe("—");
    expect(formatHistoryValue("descripcion", "")).toBe("—");
  });

  it("las fechas van como dd/mm/aaaa", () => {
    expect(formatHistoryValue("fechaCierre", "2026-10-03")).toBe("03/10/2026");
    expect(formatHistoryValue("fechaRecepcion", "2026-01-31")).toBe("31/01/2026");
    expect(formatHistoryValue("fechaReabierto", null)).toBe("—");
  });

  it("un booleano es Sí o No", () => {
    expect(formatHistoryValue("notificado", true)).toBe("Sí");
    expect(formatHistoryValue("notificado", false)).toBe("No");
  });

  it("un texto largo se acorta, y uno corto queda igual", () => {
    expect(formatHistoryValue("titulo", "Impresora rota")).toBe("Impresora rota");
    const largo = "a".repeat(200);
    expect(formatHistoryValue("descripcion", largo)).toBe(`${"a".repeat(80)}…`);
  });

  it("una fecha escrita en otro campo no se toma por fecha", () => {
    expect(formatHistoryValue("titulo", "2026-10-03")).toBe("2026-10-03");
  });
});

describe("describeChanges", () => {
  it("un cambio de estado se lee 'Estado: Pendiente → En progreso'", () => {
    const changes = describeChanges(
      { estado: { id: "e1", nombre: "Pendiente" } },
      { estado: { id: "e2", nombre: "En progreso" } },
    );

    expect(changes).toEqual([
      { field: "estado", label: "Estado", before: "Pendiente", after: "En progreso" },
    ]);
  });

  it("solo describe lo que cambió, en el orden de la foto, con varias líneas si hay varios cambios", () => {
    const changes = describeChanges(
      { estado: { id: "e1", nombre: "Pendiente" }, fechaCierre: null, solucionDescripcion: null },
      {
        estado: { id: "e2", nombre: "Resuelto" },
        fechaCierre: "2026-10-05",
        solucionDescripcion: "Se reinició",
      },
    );

    expect(changes.map((c) => `${c.label}: ${c.before} → ${c.after}`)).toEqual([
      "Estado: Pendiente → Resuelto",
      "Fecha de cierre: — → 05/10/2026",
      "Solución: — → Se reinició",
    ]);
  });

  it("quitar un valor muestra el anterior y un guion", () => {
    const changes = describeChanges(
      { proveedor: { id: "p1", nombre: "Acme" }, referenciaExterna: "19092/2026" },
      { proveedor: null, referenciaExterna: null },
    );

    expect(changes.map((c) => `${c.label}: ${c.before} → ${c.after}`)).toEqual([
      "Proveedor: Acme → —",
      "Referencia externa: 19092/2026 → —",
    ]);
  });

  it("ignora los campos que no conoce y tolera un payload sin `before`", () => {
    expect(describeChanges(undefined, { campoNuevo: 1 })).toEqual([]);
    expect(describeChanges(undefined, { titulo: "Impresora" })).toEqual([
      { field: "titulo", label: "Título", before: "—", after: "Impresora" },
    ]);
    expect(describeChanges(undefined, undefined)).toEqual([]);
  });
});

describe("formatTimestamp", () => {
  it("usa la hora de Argentina, no la del navegador ni UTC", () => {
    // 17:32 UTC son las 14:32 en Argentina (UTC-3).
    expect(formatTimestamp("2026-10-06T17:32:00.000Z")).toBe("06/10/2026 14:32");
  });

  it("la medianoche es 00:00, no 24:00", () => {
    expect(formatTimestamp("2026-10-06T03:00:00.000Z")).toBe("06/10/2026 00:00");
  });

  it("a las 02:00 UTC todavía es el día anterior en Argentina", () => {
    expect(formatTimestamp("2026-10-07T02:00:00.000Z")).toBe("06/10/2026 23:00");
  });
});
