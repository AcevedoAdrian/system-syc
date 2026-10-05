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

// Reglas propias de un catálogo (Feature 4.4). Cada una existe solo si la definición la declara, así
// que el service genérico no necesita saber qué catálogo es.
export interface CatalogRules {
  // Siempre queda al menos un ítem activo: desactivar o eliminar el último activo se rechaza con
  // 409. Con estos mensajes.
  lastActive?: { deactivate: string; remove: string };
  // Un ítem con `clave` (estado de sistema, D1) nunca se elimina, esté o no en uso. Es el mensaje
  // del 409.
  keyedNotRemovable?: string;
}

export interface CatalogDefinition {
  ruta: CatalogRuta;
  entityType: string; // `AuditLog.entityType`
  model: CatalogModel;
  messages: { notFound: string; duplicate: string };
  rules: CatalogRules;
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
    rules: {},
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
  // Siempre queda una prioridad activa: SPEC 05 la exige para crear un ticket.
  prioridades: {
    ...simple("prioridades", "Prioridad", "prioridad", {
      notFound: "La prioridad no existe",
      duplicate: "Ya existe una prioridad con ese nombre",
    }),
    rules: {
      lastActive: {
        deactivate: "No se puede desactivar la última prioridad activa",
        remove: "No se puede eliminar la última prioridad activa",
      },
    },
  },
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
    rules: {},
    inputFields: ["nombre", ...PROVEEDOR_FIELDS],
    snapshotFields: [...BASE_FIELDS, ...PROVEEDOR_FIELDS],
  },
  estados: {
    ...simple("estados", "EstadoTicket", "estadoTicket", {
      notFound: "El estado no existe",
      duplicate: "Ya existe un estado con ese nombre",
    }),
    rules: {
      lastActive: {
        deactivate: "No se puede desactivar el último estado activo",
        remove: "No se puede eliminar el último estado activo",
      },
      keyedNotRemovable:
        "Es un estado de sistema: se puede renombrar o desactivar, pero no eliminar",
    },
    // `clave` se lee y se audita, pero no está en `inputFields`: ninguna entrada la acepta.
    snapshotFields: [...BASE_FIELDS, "clave"],
  },
};
