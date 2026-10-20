// Color del punto de cada estado y prioridad (SPEC 09, etapa 9.4). Se deriva en la web de los catálogos
// que ya se cargan; no se guarda en la base. Las clases están escritas completas para que Tailwind las
// encuentre: no se arman con texto.
const DOT = {
  ringInk: "border-2 border-foreground bg-transparent",
  ringNeutral: "border-2 border-neutral-dot bg-transparent",
  ink: "bg-foreground",
  neutral: "bg-neutral-dot",
  brand: "bg-brand",
  teal: "bg-teal",
  amber: "bg-amber",
  blue: "bg-blue",
  violet: "bg-violet",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

// Los estados de sistema tienen siempre el mismo color (se identifican por su `clave`, no por el nombre).
const BY_CLAVE: Record<string, string> = {
  FINALIZADO: DOT.ink,
  CERRADO: DOT.ringNeutral,
  CANCELADO: DOT.neutral,
  REABIERTO: DOT.brand,
};

// Los estados que crea el admin (sin clave) toman el color de su posición entre ellos; del sexto en
// adelante se vuelve a empezar.
const BY_POSITION = [DOT.ringInk, DOT.teal, DOT.amber, DOT.blue, DOT.violet];

// Las prioridades, contadas desde la última (la más urgente): rojo, naranja, ámbar y, el resto, neutro.
const FROM_LAST = [DOT.destructive, DOT.brand, DOT.warning];

interface CatalogEntry {
  id: string;
  orden: number;
  clave?: string | null;
}

const byOrder = <T extends { orden: number }>(items: readonly T[]) =>
  [...items].sort((a, b) => a.orden - b.orden);

/**
 * Clases del punto de un estado. `estados` es el catálogo completo (activos e inactivos); mientras no
 * llegó, o si el estado ya no está en él, el punto es neutro.
 */
export function estadoDotClass(
  estado: { id: string; clave: string | null },
  estados: readonly CatalogEntry[] | undefined,
): string {
  if (estado.clave !== null) return BY_CLAVE[estado.clave] ?? DOT.neutral;
  if (!estados) return DOT.neutral;

  const sinClave = byOrder(estados.filter((e) => !e.clave));
  const position = sinClave.findIndex((e) => e.id === estado.id);
  return position === -1 ? DOT.neutral : (BY_POSITION[position % BY_POSITION.length] as string);
}

/**
 * Clases del punto de una prioridad. El catálogo va de la menos a la más urgente (así lo ordena el
 * admin): la última es la más urgente. Con una sola prioridad no hay con qué comparar y el punto es
 * neutro, igual que si el catálogo no llegó o la prioridad ya no está en él.
 */
export function prioridadDotClass(
  prioridadId: string,
  prioridades: readonly CatalogEntry[] | undefined,
): string {
  if (!prioridades || prioridades.length < 2) return DOT.neutral;

  const ordered = byOrder(prioridades);
  const position = ordered.findIndex((p) => p.id === prioridadId);
  if (position === -1) return DOT.neutral;
  return FROM_LAST[ordered.length - 1 - position] ?? DOT.neutral;
}
