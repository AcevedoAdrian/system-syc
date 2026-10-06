import { z } from "zod";

// El router parsea cada valor de la URL como JSON: `?q=123` llega como número. Por eso el texto acepta
// las dos formas y un valor vacío equivale a no filtrar.
const text = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(z.string().max(max))
    .transform((value) => value || undefined)
    .optional()
    .catch(undefined);

const day = z.iso.date().optional().catch(undefined);

// Lo que vive en la URL de la bandeja (SPEC 06, Feature 6.3): búsqueda, filtros y página. Un valor
// inválido se descarta (`.catch`), no rompe la pantalla. Sin `page` es la página 1.
export const ticketsSearchSchema = z.object({
  q: text(200),
  estadoId: text(100),
  areaId: text(100),
  edificioId: text(100),
  tipoId: text(100),
  prioridadId: text(100),
  proveedorId: text(100),
  moduloId: text(100),
  departamentoId: text(100),
  fechaRecepcionDesde: day,
  fechaRecepcionHasta: day,
  page: z
    .union([z.string(), z.number()])
    .transform(Number)
    .pipe(z.number().int().min(1))
    .optional()
    .catch(undefined),
});

export type TicketsSearch = z.infer<typeof ticketsSearchSchema>;

// Cada selector de la bandeja, con la clave de la URL que filtra.
export type TicketsFilterKey = Exclude<keyof TicketsSearch, "page">;

// La búsqueda y los filtros activos (la página no cuenta): decide si "Limpiar filtros" tiene algo que
// limpiar y qué mensaje se muestra cuando no hay tickets.
export function hasActiveFilters(search: TicketsSearch): boolean {
  const { page: _page, ...filters } = search;
  return Object.values(filters).some((value) => value !== undefined);
}

// Cambiar un filtro o la búsqueda vuelve a la página 1.
export function withFilter(
  search: TicketsSearch,
  key: TicketsFilterKey,
  value: string | undefined,
): TicketsSearch {
  return { ...search, [key]: value || undefined, page: undefined };
}
