import { oc } from "@orpc/contract";
import { z } from "zod";
import { auditHistorySchema } from "./audit.js";
import { type ClaveEstado, claveEstadoSchema } from "./catalogs.js";
import { blankToNull, blankToNullValue, fechaNoFuturaSchema } from "./fields.js";

// Bloqueo optimista (Q22): la versión (`updatedAt`) que el cliente leyó ya no es la de la base. Es un 409,
// igual que una referencia externa duplicada: la web compara este texto para ofrecer "Recargar" solo
// en el primer caso, que es el que descarta lo escrito.
export const STALE_TICKET_MESSAGE =
  "Otro usuario modificó este ticket. Recargá para ver los cambios.";

// Los estados que cierran un ticket y exigen fecha de cierre (Feature 5.4). Siempre se compara la `clave`,
// nunca el nombre: el admin puede renombrar "Finalizado" sin que la regla deje de aplicarse (D1).
export const CLAVES_DE_CIERRE: readonly ClaveEstado[] = ["FINALIZADO", "CERRADO", "CANCELADO"];

// `TE-000013`: 6 dígitos con ceros hasta `TE-999999`; desde `TE-1000000` sin relleno (Q21, P9, P12).
// `numero` se guarda como entero y solo se muestra así.
export const formatTicketNumber = (numero: number): string =>
  `TE-${String(numero).padStart(6, "0")}`;

// "número/año": el número solo con dígitos y distinto de 0, el año de 4 dígitos entre 2000 y 2100.
// Quita los ceros a la izquierda del número ("019092/2026" → "19092/2026") (Q29).
export const referenciaExternaSchema = z
  .string()
  .trim()
  .regex(/^\d+\/\d{4}$/, "La referencia debe tener el formato número/año, por ejemplo 19092/2026")
  .refine(
    (v) => /[1-9]/.test(v.split("/")[0] as string),
    "El número de la referencia no puede ser 0",
  )
  .refine((v) => {
    const year = Number(v.split("/")[1]);
    return year >= 2000 && year <= 2100;
  }, "El año de la referencia debe estar entre 2000 y 2100")
  .transform((v) => v.replace(/^0+(?=\d)/, ""));

const tituloSchema = z.string().trim().min(1).max(200);
const actuacionSimpleSchema = blankToNull(z.string().max(500));
const textoLargoSchema = blankToNull(z.string().max(5000));
const idOpcionalSchema = blankToNull(z.string());
const referenciaSchema = blankToNull(referenciaExternaSchema);

// La referencia externa no puede existir sin proveedor (Q29, Feature 5.5). Al quitar el proveedor, la
// referencia se borra en la misma operación: mandar una sin la otra es un error del formulario.
const referenciaRequiereProveedor = {
  check: (v: { proveedorId: string | null; referenciaExterna: string | null }) =>
    !(v.referenciaExterna && !v.proveedorId),
  options: {
    path: ["referenciaExterna"],
    message: "La referencia externa requiere un proveedor",
  },
};

export const createTicketInputSchema = z
  .object({
    departamentoId: z.string(), // obligatorio para todos; el agente manda el suyo (Feature 5.1)
    titulo: tituloSchema,
    descripcion: textoLargoSchema,
    prioridadId: z.string(),
    fechaRecepcion: fechaNoFuturaSchema,
    actuacionSimple: actuacionSimpleSchema,
    proveedorId: idOpcionalSchema,
    referenciaExterna: referenciaSchema,
  })
  .refine(referenciaRequiereProveedor.check, referenciaRequiereProveedor.options);

// Reemplaza todos los campos editables (como `update` de catálogos): un campo que no viene o viene en
// blanco se guarda como null. `fechaCierre` y `fechaReabierto` solo se corrigen si el ticket ya
// tiene valor (Feature 5.3): esa regla la aplica el service, que conoce el ticket.
export const updateTicketInputSchema = z
  .object({
    ticketId: z.string(),
    updatedAt: z.iso.datetime(), // bloqueo optimista
    titulo: tituloSchema,
    descripcion: textoLargoSchema,
    actuacionSimple: actuacionSimpleSchema,
    prioridadId: z.string(),
    areaId: idOpcionalSchema,
    edificioId: idOpcionalSchema,
    tipoId: idOpcionalSchema,
    moduloId: idOpcionalSchema,
    proveedorId: idOpcionalSchema,
    referenciaExterna: referenciaSchema,
    fechaRecepcion: fechaNoFuturaSchema,
    fechaCierre: fechaNoFuturaSchema.nullable(),
    fechaReabierto: fechaNoFuturaSchema.nullable(),
    solucionDescripcion: textoLargoSchema,
    notificado: z.boolean(),
  })
  .refine(referenciaRequiereProveedor.check, referenciaRequiereProveedor.options);

// `fechaCierre`, `fechaReabierto` y `solucionDescripcion` no vienen por defecto: ausentes significan
// "no tocar", y el service rechaza las que el estado destino no admite (Feature 5.4). Por eso la
// solución usa `blankToNullValue` (sin default): en blanco la borra, ausente la deja como está.
export const changeTicketStatusInputSchema = z.object({
  ticketId: z.string(),
  updatedAt: z.iso.datetime(),
  estadoId: z.string(),
  fechaCierre: fechaNoFuturaSchema.optional(), // obligatoria si el destino tiene clave de cierre
  fechaReabierto: fechaNoFuturaSchema.optional(), // obligatoria si el destino tiene clave REABIERTO
  solucionDescripcion: blankToNullValue(z.string().max(5000)).optional(),
});

export const changeTicketDepartmentInputSchema = z.object({
  ticketId: z.string(),
  updatedAt: z.iso.datetime(),
  departamentoId: z.string(),
});

export const ticketIdInputSchema = z.object({ ticketId: z.string() });

// Tickets por página de la bandeja (Q34).
export const TICKETS_PAGE_SIZE = 20;

// Los filtros llegan en la query string de un GET: un valor vacío o ausente es "sin filtro".
const filtroId = z
  .string()
  .optional()
  .transform((v) => v || undefined);

// Filtros, búsqueda y página de la bandeja (SPEC 06). `departamentoId` solo lo aplica el admin: lo
// decide el service, que conoce el alcance. Las fechas son inclusivas. `page` llega como texto.
export const listTicketsInputSchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => v || undefined),
    estadoId: filtroId,
    areaId: filtroId,
    edificioId: filtroId,
    tipoId: filtroId,
    prioridadId: filtroId,
    proveedorId: filtroId,
    moduloId: filtroId,
    departamentoId: filtroId,
    fechaRecepcionDesde: z.iso.date().optional(),
    fechaRecepcionHasta: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
  })
  .refine(
    (v) =>
      !(v.fechaRecepcionDesde && v.fechaRecepcionHasta) ||
      v.fechaRecepcionDesde <= v.fechaRecepcionHasta,
    {
      path: ["fechaRecepcionHasta"],
      message: "La fecha «hasta» no puede ser anterior a la fecha «desde»",
    },
  );

const refSchema = z.object({ id: z.string(), nombre: z.string() });

export const ticketSchema = z.object({
  id: z.string(),
  numero: z.number().int(),
  departamento: refSchema,
  area: refSchema.nullable(),
  edificio: refSchema.nullable(),
  tipo: refSchema.nullable(),
  modulo: refSchema.nullable(),
  prioridad: refSchema,
  estado: refSchema.extend({ clave: claveEstadoSchema.nullable() }),
  proveedor: refSchema.nullable(),
  titulo: z.string(),
  descripcion: z.string().nullable(),
  actuacionSimple: z.string().nullable(),
  referenciaExterna: z.string().nullable(),
  solucionDescripcion: z.string().nullable(),
  notificado: z.boolean(),
  fechaRecepcion: z.iso.date(),
  fechaCierre: z.iso.date().nullable(),
  fechaReabierto: z.iso.date().nullable(),
  creador: refSchema, // `nombre` = nombre del usuario
  editor: refSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ticketSummarySchema = ticketSchema.pick({
  id: true,
  numero: true,
  titulo: true,
  departamento: true,
  estado: true,
  prioridad: true,
  area: true,
  fechaRecepcion: true,
});

export const ticketsPageSchema = z.object({
  items: z.array(ticketSummarySchema),
  total: z.number().int(), // tickets que cumplen los filtros, en el alcance del usuario
  page: z.number().int(),
  pageSize: z.number().int(), // siempre TICKETS_PAGE_SIZE
});

export type CreateTicketInput = z.infer<typeof createTicketInputSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketInputSchema>;
export type ChangeTicketStatusInput = z.infer<typeof changeTicketStatusInputSchema>;
export type ChangeTicketDepartmentInput = z.infer<typeof changeTicketDepartmentInputSchema>;
export type ListTicketsInput = z.infer<typeof listTicketsInputSchema>;
export type Ticket = z.infer<typeof ticketSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketsPage = z.infer<typeof ticketsPageSchema>;

export const ticketsContract = {
  list: oc
    .route({ method: "GET", path: "/tickets" })
    .input(listTicketsInputSchema)
    .output(ticketsPageSchema),
  get: oc
    .route({ method: "GET", path: "/tickets/{ticketId}" })
    .input(ticketIdInputSchema)
    .output(ticketSchema),
  create: oc
    .route({ method: "POST", path: "/tickets" })
    .input(createTicketInputSchema)
    .output(ticketSchema),
  update: oc
    .route({ method: "PUT", path: "/tickets/{ticketId}" })
    .input(updateTicketInputSchema)
    .output(ticketSchema),
  changeStatus: oc
    .route({ method: "POST", path: "/tickets/{ticketId}/status" })
    .input(changeTicketStatusInputSchema)
    .output(ticketSchema),
  changeDepartment: oc
    .route({ method: "POST", path: "/tickets/{ticketId}/department" })
    .input(changeTicketDepartmentInputSchema)
    .output(ticketSchema),
  remove: oc
    .route({ method: "DELETE", path: "/tickets/{ticketId}" })
    .input(ticketIdInputSchema)
    .output(z.void()),
  history: oc
    .route({ method: "GET", path: "/tickets/{ticketId}/history" })
    .input(ticketIdInputSchema)
    .output(auditHistorySchema),
};
