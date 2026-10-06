import { z } from "zod";

// Campo opcional de texto: en blanco, ya recortado, se guarda como null. Union en vez de
// `z.preprocess`: preprocess deja el tipo de entrada en `unknown` y se perdería el tipado de los
// formularios. Sin `default`: si el campo no viene queda `undefined`, para los procedimientos donde
// "no viene" significa "no tocar" (por ejemplo la solución en `tickets.changeStatus`).
export const blankToNullValue = <T extends z.ZodType<string, string>>(schema: T) =>
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(schema.nullable()),
  ]);

// Igual, pero si el campo no viene vale null: los esquemas que reemplazan todos los campos
// editables (`update` de catálogos y de tickets) usan este, así omitirlo borra el valor.
export const blankToNull = <T extends z.ZodType<string, string>>(schema: T) =>
  blankToNullValue(schema).default(null);

export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";

// "Hoy" como "YYYY-MM-DD" en la zona de Argentina, sin importar la zona del navegador o del contenedor
// (a las 22:30 de Argentina ya es mañana en UTC). `ahora` existe para poder fijarlo en los tests.
export function hoyArgentina(ahora: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Hoy o anterior, en hora de Argentina. Se evalúa al validar (no al cargar el módulo), y la web y la
// API usan este mismo esquema, así que aplican la misma regla.
export const fechaNoFuturaSchema = z.iso
  .date()
  .refine((fecha) => fecha <= hoyArgentina(), "La fecha no puede ser futura");
