import { ZONA_HORARIA } from "@syc/contracts";
import { formatDay } from "./ticket-format";

// Etiquetas de los campos de la foto auditable del ticket (`ticket-audit-snapshot.ts` de la API), para
// mostrar el historial: "Estado: Pendiente → En progreso".
export const FIELD_LABELS: Record<string, string> = {
  numero: "Número",
  titulo: "Título",
  descripcion: "Descripción",
  actuacionSimple: "Actuación simple",
  referenciaExterna: "Referencia externa",
  solucionDescripcion: "Solución",
  notificado: "Notificado",
  fechaRecepcion: "Fecha de recepción",
  fechaCierre: "Fecha de cierre",
  fechaReabierto: "Fecha de reapertura",
  departamento: "Departamento",
  area: "Área",
  edificio: "Edificio",
  tipo: "Tipo",
  prioridad: "Prioridad",
  modulo: "Módulo",
  estado: "Estado",
  proveedor: "Proveedor",
};

const DATE_FIELDS = new Set(["fechaRecepcion", "fechaCierre", "fechaReabierto"]);
const MAX_TEXT = 80;
const EMPTY = "—";

// Un valor de la foto como texto: una referencia `{ id, nombre }` es su nombre (el historial lo
// guarda en la foto, así sigue legible aunque el ítem se renombre o se elimine), una fecha va como
// dd/mm/aaaa, un booleano como Sí/No y un texto largo se acorta.
export function formatHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") {
    const nombre = (value as { nombre?: unknown }).nombre;
    return typeof nombre === "string" ? nombre : EMPTY;
  }
  const text = String(value);
  if (DATE_FIELDS.has(field)) return formatDay(text);
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

export interface FieldChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

type Snapshot = Record<string, unknown>;

// Un `update` guarda solo lo que cambió: `before` y `after` con los mismos campos. Un `create` solo
// trae `after`. Los campos que la pantalla no conoce se ignoran.
export function describeChanges(
  before: Snapshot | undefined,
  after: Snapshot | undefined,
): FieldChange[] {
  const fields = Object.keys(after ?? before ?? {}).filter((field) => field in FIELD_LABELS);
  return fields.map((field) => ({
    field,
    label: FIELD_LABELS[field] as string,
    before: formatHistoryValue(field, before?.[field]),
    after: formatHistoryValue(field, after?.[field]),
  }));
}

// "06/10/2026 14:32", siempre en hora de Argentina (como las fechas de cierre y recepción). Se arma
// con las partes y no con el formato de `es-AR`, que cambia entre versiones de ICU.
export function formatTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}
