import { oc } from "@orpc/contract";
import { z } from "zod";
import { auditHistorySchema } from "./audit.js";
import { blankToNull } from "./fields.js";

const nombreSchema = z.string().trim().min(1).max(120);

export const catalogItemInputSchema = z.object({ nombre: nombreSchema });

// SPEC 08: el tipo es obligatorio; el service valida que exista y esté activo.
export const areaInputSchema = catalogItemInputSchema.extend({ tipoId: z.string().min(1) });

// SPEC 11: un módulo pertenece a uno o más departamentos; el service valida que existan y estén activos.
export const moduloInputSchema = catalogItemInputSchema.extend({
  departamentoIds: z.array(z.string().min(1)).min(1, "Elegí al menos un departamento"),
});

export const proveedorInputSchema = z.object({
  nombre: nombreSchema,
  contacto: blankToNull(z.string().max(120)),
  telefono: blankToNull(z.string().max(50)),
  correo: blankToNull(z.email().max(254)),
  sitioWeb: blankToNull(z.url({ protocol: /^https?$/ }).max(500)),
});

export const catalogItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  orden: z.number().int(),
  activo: z.boolean(),
});

export const areaSchema = catalogItemSchema.extend({
  tipo: z.object({ id: z.string(), nombre: z.string() }),
});

export const moduloSchema = catalogItemSchema.extend({
  departamentos: z.array(z.object({ id: z.string(), nombre: z.string() })),
});

// «Diputado · Acosta»: lo comparten la API (foto auditable del ticket) y la web.
export const areaLabel = (area: { nombre: string; tipo: { nombre: string } }) =>
  `${area.tipo.nombre} · ${area.nombre}`;

export const proveedorSchema = catalogItemSchema.extend({
  contacto: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  sitioWeb: z.string().nullable(),
});

export const claveEstadoSchema = z.enum(["FINALIZADO", "CERRADO", "CANCELADO", "REABIERTO"]);

// `clave` es de solo lectura: ninguna entrada la acepta.
export const estadoTicketSchema = catalogItemSchema.extend({ clave: claveEstadoSchema.nullable() });

export const moveCatalogItemInputSchema = z.object({
  itemId: z.string(),
  direccion: z.enum(["subir", "bajar"]),
});

export const catalogItemIdInputSchema = z.object({ itemId: z.string() });

export const setCatalogItemActiveInputSchema = z.object({
  itemId: z.string(),
  activo: z.boolean(),
});

// Rutas de los 8 catálogos, en el orden de las pestañas de la pantalla de administración.
export const catalogRutas = [
  "areas",
  "tiposArea",
  "edificios",
  "tipos",
  "prioridades",
  "modulos",
  "proveedores",
  "estados",
] as const;

export const catalogRutaSchema = z.enum(catalogRutas);

export type CatalogRuta = z.infer<typeof catalogRutaSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;
export type Area = z.infer<typeof areaSchema>;
export type AreaInput = z.infer<typeof areaInputSchema>;
export type Modulo = z.infer<typeof moduloSchema>;
export type ModuloInput = z.infer<typeof moduloInputSchema>;
export type Proveedor = z.infer<typeof proveedorSchema>;
export type ProveedorInput = z.infer<typeof proveedorInputSchema>;
export type ClaveEstado = z.infer<typeof claveEstadoSchema>;
export type EstadoTicket = z.infer<typeof estadoTicketSchema>;
export type MoveCatalogItemInput = z.infer<typeof moveCatalogItemInputSchema>;
export type SetCatalogItemActiveInput = z.infer<typeof setCatalogItemActiveInputSchema>;

// Los 7 procedimientos de un catálogo. Cada catálogo valida con su propio esquema: Áreas nunca
// acepta los campos de Proveedor.
const catalogContract = <TShape extends z.ZodRawShape, TItem extends z.ZodType>(
  ruta: CatalogRuta,
  inputSchema: z.ZodObject<TShape>,
  itemSchema: TItem,
) => ({
  list: oc.route({ method: "GET", path: `/catalogs/${ruta}` }).output(z.array(itemSchema)),
  create: oc
    .route({ method: "POST", path: `/catalogs/${ruta}` })
    .input(inputSchema)
    .output(itemSchema),
  update: oc
    .route({ method: "PATCH", path: `/catalogs/${ruta}/{itemId}` })
    .input(inputSchema.extend({ itemId: z.string() }))
    .output(itemSchema),
  move: oc
    .route({ method: "POST", path: `/catalogs/${ruta}/{itemId}/move` })
    .input(moveCatalogItemInputSchema)
    .output(z.void()),
  setActive: oc
    .route({ method: "POST", path: `/catalogs/${ruta}/{itemId}/active` })
    .input(setCatalogItemActiveInputSchema)
    .output(itemSchema),
  remove: oc
    .route({ method: "DELETE", path: `/catalogs/${ruta}/{itemId}` })
    .input(catalogItemIdInputSchema)
    .output(z.void()),
  history: oc
    .route({ method: "GET", path: `/catalogs/${ruta}/{itemId}/history` })
    .input(catalogItemIdInputSchema)
    .output(auditHistorySchema),
});

export const catalogsContract = {
  areas: catalogContract("areas", areaInputSchema, areaSchema),
  tiposArea: catalogContract("tiposArea", catalogItemInputSchema, catalogItemSchema),
  edificios: catalogContract("edificios", catalogItemInputSchema, catalogItemSchema),
  tipos: catalogContract("tipos", catalogItemInputSchema, catalogItemSchema),
  prioridades: catalogContract("prioridades", catalogItemInputSchema, catalogItemSchema),
  modulos: catalogContract("modulos", moduloInputSchema, moduloSchema),
  proveedores: catalogContract("proveedores", proveedorInputSchema, proveedorSchema),
  estados: catalogContract("estados", catalogItemInputSchema, estadoTicketSchema),
};
