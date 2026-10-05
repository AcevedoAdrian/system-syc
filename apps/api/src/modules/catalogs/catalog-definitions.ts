import type { CatalogRuta } from "@syc/contracts";

// Clave del cliente Prisma (`db.area`, `db.tipoTicket`, ...). Cada catálogo sigue siendo su propio
// modelo: este registro solo evita copiar siete veces el mismo ABM.
export type CatalogModel =
  | "area"
  | "edificio"
  | "tipoTicket"
  | "prioridad"
  | "modulo"
  | "proveedor"
  | "estadoTicket";

export interface CatalogDefinition {
  ruta: CatalogRuta;
  entityType: string; // `AuditLog.entityType`
  model: CatalogModel;
  messages: { notFound: string; duplicate: string };
  // Campos que el cliente puede escribir en el alta y la edición. Todo lo demás (`orden`,
  // `nombreNormalizado`, `clave`, `createdBy`, `updatedBy`) lo decide el servidor.
  inputFields: readonly string[];
  // Foto auditable (SPEC 03): solo estos campos entran en el diff. También son los que se leen de
  // la base y se devuelven al cliente, además de `id`.
  snapshotFields: readonly string[];
}

const BASE_FIELDS = ["nombre", "orden", "activo"] as const;
const PROVEEDOR_FIELDS = ["contacto", "telefono", "correo", "sitioWeb"] as const;

function simple(
  ruta: CatalogRuta,
  entityType: string,
  model: CatalogModel,
  messages: CatalogDefinition["messages"],
): CatalogDefinition {
  return {
    ruta,
    entityType,
    model,
    messages,
    inputFields: ["nombre"],
    snapshotFields: BASE_FIELDS,
  };
}

export const CATALOG_DEFINITIONS: Record<CatalogRuta, CatalogDefinition> = {
  areas: simple("areas", "Area", "area", {
    notFound: "El área no existe",
    duplicate: "Ya existe un área con ese nombre",
  }),
  edificios: simple("edificios", "Edificio", "edificio", {
    notFound: "El edificio no existe",
    duplicate: "Ya existe un edificio con ese nombre",
  }),
  tipos: simple("tipos", "TipoTicket", "tipoTicket", {
    notFound: "El tipo de ticket no existe",
    duplicate: "Ya existe un tipo de ticket con ese nombre",
  }),
  prioridades: simple("prioridades", "Prioridad", "prioridad", {
    notFound: "La prioridad no existe",
    duplicate: "Ya existe una prioridad con ese nombre",
  }),
  modulos: simple("modulos", "Modulo", "modulo", {
    notFound: "El módulo no existe",
    duplicate: "Ya existe un módulo con ese nombre",
  }),
  proveedores: {
    ruta: "proveedores",
    entityType: "Proveedor",
    model: "proveedor",
    messages: {
      notFound: "El proveedor no existe",
      duplicate: "Ya existe un proveedor con ese nombre",
    },
    inputFields: ["nombre", ...PROVEEDOR_FIELDS],
    snapshotFields: [...BASE_FIELDS, ...PROVEEDOR_FIELDS],
  },
  estados: {
    ...simple("estados", "EstadoTicket", "estadoTicket", {
      notFound: "El estado no existe",
      duplicate: "Ya existe un estado con ese nombre",
    }),
    // `clave` se lee y se audita, pero no está en `inputFields`: ninguna entrada la acepta.
    snapshotFields: [...BASE_FIELDS, "clave"],
  },
};
