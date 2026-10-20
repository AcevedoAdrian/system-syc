import { describe, expect, it } from "vitest";
import { estadoDotClass, prioridadDotClass } from "@/features/tickets/ticket-colors";

const estados = [
  { id: "pend", nombre: "Pendiente", orden: 1, clave: null },
  { id: "prog", nombre: "En progreso", orden: 2, clave: null },
  { id: "espera", nombre: "En espera", orden: 3, clave: null },
  { id: "fin", nombre: "Finalizado", orden: 4, clave: "FINALIZADO" },
  { id: "cer", nombre: "Cerrado", orden: 5, clave: "CERRADO" },
  { id: "can", nombre: "Cancelado", orden: 6, clave: "CANCELADO" },
  { id: "rea", nombre: "Reabierto", orden: 7, clave: "REABIERTO" },
];

const sinClave = (id: string, clave: string | null = null) => ({ id, clave });

describe("estadoDotClass", () => {
  it("los estados de sistema tienen su color por la clave, no por el nombre ni la posición", () => {
    expect(estadoDotClass(sinClave("fin", "FINALIZADO"), estados)).toBe("bg-foreground");
    expect(estadoDotClass(sinClave("cer", "CERRADO"), estados)).toBe(
      "border-2 border-neutral-dot bg-transparent",
    );
    expect(estadoDotClass(sinClave("can", "CANCELADO"), estados)).toBe("bg-neutral-dot");
    expect(estadoDotClass(sinClave("rea", "REABIERTO"), estados)).toBe("bg-brand");
  });

  it("los estados de sistema no necesitan el catálogo", () => {
    expect(estadoDotClass(sinClave("fin", "FINALIZADO"), undefined)).toBe("bg-foreground");
  });

  it("una clave desconocida cae en neutro", () => {
    expect(estadoDotClass(sinClave("x", "OTRA"), estados)).toBe("bg-neutral-dot");
  });

  it("los demás toman el color de su posición entre los estados sin clave", () => {
    expect(estadoDotClass(sinClave("pend"), estados)).toBe(
      "border-2 border-foreground bg-transparent",
    );
    expect(estadoDotClass(sinClave("prog"), estados)).toBe("bg-teal");
    expect(estadoDotClass(sinClave("espera"), estados)).toBe("bg-amber");
  });

  it("los estados de sistema no cuentan para la posición", () => {
    const mezclados = [
      { id: "fin", orden: 1, clave: "FINALIZADO" },
      { id: "a", orden: 2, clave: null },
      { id: "rea", orden: 3, clave: "REABIERTO" },
      { id: "b", orden: 4, clave: null },
    ];

    expect(estadoDotClass(sinClave("a"), mezclados)).toBe(
      "border-2 border-foreground bg-transparent",
    );
    expect(estadoDotClass(sinClave("b"), mezclados)).toBe("bg-teal");
  });

  it("sigue el orden del catálogo (`orden`), no el de la lista recibida", () => {
    const desordenado = [
      { id: "b", orden: 2, clave: null },
      { id: "a", orden: 1, clave: null },
    ];

    expect(estadoDotClass(sinClave("a"), desordenado)).toBe(
      "border-2 border-foreground bg-transparent",
    );
    expect(estadoDotClass(sinClave("b"), desordenado)).toBe("bg-teal");
  });

  it("a partir del sexto estado sin clave los colores vuelven a empezar", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i + 1}`,
      orden: i + 1,
      clave: null,
    }));

    expect(estadoDotClass(sinClave("e4"), seis)).toBe("bg-blue");
    expect(estadoDotClass(sinClave("e5"), seis)).toBe("bg-violet");
    expect(estadoDotClass(sinClave("e6"), seis)).toBe("border-2 border-foreground bg-transparent");
  });

  it("un estado inactivo conserva su posición", () => {
    // El catálogo trae los inactivos: desactivar uno no recolorea a los que le siguen.
    expect(estadoDotClass(sinClave("espera"), estados)).toBe("bg-amber");
  });

  it("sin catálogo, o con un estado que ya no está en él, el punto es neutro", () => {
    expect(estadoDotClass(sinClave("pend"), undefined)).toBe("bg-neutral-dot");
    expect(estadoDotClass(sinClave("borrado"), estados)).toBe("bg-neutral-dot");
  });
});

describe("prioridadDotClass", () => {
  const prioridades = [
    { id: "baja", orden: 1 },
    { id: "media", orden: 2 },
    { id: "alta", orden: 3 },
    { id: "urgente", orden: 4 },
  ];

  it("cuenta desde la más urgente: rojo, naranja, ámbar y neutro", () => {
    expect(prioridadDotClass("urgente", prioridades)).toBe("bg-destructive");
    expect(prioridadDotClass("alta", prioridades)).toBe("bg-brand");
    expect(prioridadDotClass("media", prioridades)).toBe("bg-warning");
    expect(prioridadDotClass("baja", prioridades)).toBe("bg-neutral-dot");
  });

  it("con más de cuatro, todas las anteriores a la tercera desde el final son neutras", () => {
    const seis = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, orden: i + 1 }));

    expect(prioridadDotClass("a", seis)).toBe("bg-neutral-dot");
    expect(prioridadDotClass("c", seis)).toBe("bg-neutral-dot");
    expect(prioridadDotClass("d", seis)).toBe("bg-warning");
    expect(prioridadDotClass("e", seis)).toBe("bg-brand");
    expect(prioridadDotClass("f", seis)).toBe("bg-destructive");
  });

  it("con dos prioridades, la última es roja y la otra naranja", () => {
    const dos = [
      { id: "normal", orden: 1 },
      { id: "urgente", orden: 2 },
    ];

    expect(prioridadDotClass("urgente", dos)).toBe("bg-destructive");
    expect(prioridadDotClass("normal", dos)).toBe("bg-brand");
  });

  it("con una sola prioridad el punto es neutro: no hay con qué compararla", () => {
    expect(prioridadDotClass("unica", [{ id: "unica", orden: 1 }])).toBe("bg-neutral-dot");
  });

  it("sigue el orden del catálogo (`orden`), no el de la lista recibida", () => {
    const desordenado = [...prioridades].reverse();

    expect(prioridadDotClass("urgente", desordenado)).toBe("bg-destructive");
    expect(prioridadDotClass("baja", desordenado)).toBe("bg-neutral-dot");
  });

  it("una prioridad inactiva sigue ocupando su lugar", () => {
    // El catálogo trae los inactivos: desactivar «Media» no recolorea a «Alta» ni a «Urgente».
    expect(prioridadDotClass("alta", prioridades)).toBe("bg-brand");
  });

  it("sin catálogo, o con una prioridad que ya no está, el punto es neutro", () => {
    expect(prioridadDotClass("alta", undefined)).toBe("bg-neutral-dot");
    expect(prioridadDotClass("borrada", prioridades)).toBe("bg-neutral-dot");
  });
});
