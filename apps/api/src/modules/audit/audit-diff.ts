// Valor JSON que puede llegar al `payload` de un `AuditLog`.
export type AuditValue =
  | string
  | number
  | boolean
  | null
  | AuditValue[]
  | { [key: string]: AuditValue };

// Foto auditable: solo los campos de la lista explícita de la entidad (SPEC 03, "Foto auditable").
export type AuditSnapshot = Record<string, AuditValue>;

export interface AuditDiff {
  before: AuditSnapshot;
  after: AuditSnapshot;
}

// Copia solo los campos de `fields`: lo que no está en la lista nunca llega al `payload`.
export function pickSnapshot<T extends object, K extends keyof T & string>(
  source: T,
  fields: readonly K[],
): Pick<T, K> {
  const picked = {} as Pick<T, K>;
  for (const field of fields) picked[field] = source[field];
  return picked;
}

function isEqual(a: AuditValue | undefined, b: AuditValue | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => isEqual(item, b[index]))
    );
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => isEqual(a[key], b[key]));
}

// Devuelve solo los campos que cambiaron, o `null` si no cambió ninguno (no se audita).
export function computeDiff(before: AuditSnapshot, after: AuditSnapshot): AuditDiff | null {
  const changedBefore: AuditSnapshot = {};
  const changedAfter: AuditSnapshot = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (isEqual(before[key], after[key])) continue;
    if (key in before) changedBefore[key] = before[key] as AuditValue;
    if (key in after) changedAfter[key] = after[key] as AuditValue;
  }
  return Object.keys(changedAfter).length === 0 && Object.keys(changedBefore).length === 0
    ? null
    : { before: changedBefore, after: changedAfter };
}
