import type { CatalogRuta } from "@syc/contracts";

// Dice cuántos tickets usan un ítem de catálogo o un departamento. Lo implementa el módulo `tickets`;
// `catalogs` y `organizations` solo conocen este contrato, no la tabla `ticket` (SPEC 05, Feature 5.9).
// Mismo patrón que `DEPARTMENT_READER`.
export const TICKET_USAGE_READER = Symbol("TICKET_USAGE_READER");

export interface TicketUsageReader {
  // Tickets **no eliminados** que usan el ítem. Eliminar un ítem de catálogo es lógico y la FK sigue
  // válida, así que un ítem que solo usan tickets eliminados se puede eliminar.
  countByCatalogItem(ruta: CatalogRuta, itemId: string): Promise<number>;
  // Tickets del departamento, **incluidos los eliminados**: `Organization` se borra físicamente y la
  // FK del ticket es `Restrict`, así que cualquier fila (eliminada o no) lo impide (SPEC 02 D2).
  countByDepartment(departmentId: string): Promise<number>;
}
