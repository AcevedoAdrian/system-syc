import { normalizeSearch as normalize } from "@/lib/search";
import type { CatalogEntry } from "./hooks/catalog-api";

export type StatusFilter = "todos" | "activos" | "desactivados";

// 10 filas por página, como la maqueta.
export const CATALOG_PAGE_SIZE = 10;

/**
 * Las filas que cumplen la búsqueda y el filtro de estado. La búsqueda mira el nombre y, en las áreas,
 * también el tipo (se muestran juntas como «Tipo · Nombre»). Conserva el orden de la lista.
 */
export function filterCatalog(
  items: readonly CatalogEntry[],
  search: string,
  status: StatusFilter,
): CatalogEntry[] {
  const needle = normalize(search);
  return items.filter((item) => {
    if (status === "activos" && !item.activo) return false;
    if (status === "desactivados" && item.activo) return false;
    if (needle === "") return true;
    return normalize(`${item.tipo?.nombre ?? ""} ${item.nombre}`).includes(needle);
  });
}

/** Cuántos ítems hay en cada filtro de estado, sobre la lista completa. */
export function statusCounts(items: readonly CatalogEntry[]): Record<StatusFilter, number> {
  const activos = items.filter((item) => item.activo).length;
  return { todos: items.length, activos, desactivados: items.length - activos };
}

export interface CatalogPage {
  rows: CatalogEntry[];
  page: number; // la página mostrada, ya corregida al rango válido
  pages: number;
  from: number; // 1-based; 0 si no hay filas
  to: number;
  total: number;
}

/** Una página de `items`. Una página fuera de rango se corrige a la más cercana. */
export function paginate(
  items: readonly CatalogEntry[],
  requestedPage: number,
  size = CATALOG_PAGE_SIZE,
): CatalogPage {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const start = (page - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page,
    pages,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
    total,
  };
}
