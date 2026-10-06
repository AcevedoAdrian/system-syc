import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import {
  type CatalogRuta,
  type ClaveEstado,
  type ListTicketsInput,
  STALE_TICKET_MESSAGE,
  TICKETS_PAGE_SIZE,
  type Ticket,
  type TicketSummary,
} from "@syc/contracts";
import { getPrismaClient, Prisma } from "@syc/db";
import { notDeleted, softDeleteData } from "../../common/soft-delete";
import type { TicketUsageReader } from "../../common/ticket-usage-reader";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { type AuditEntry, writeAuditEntry } from "../audit/audit.repository";

// Filas con la forma exacta del contrato: las fechas ya son "YYYY-MM-DD" y los instantes, ISO.
export type TicketRow = Ticket;
export type TicketSummaryRow = TicketSummary;

// Un ítem de catálogo, o un departamento, tal como lo necesita el service para validar una
// referencia: existe (no eliminado) y si está activo.
export interface ReferenceRow {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface EstadoRow extends ReferenceRow {
  clave: ClaveEstado | null;
}

// Los catálogos que un ticket puede referenciar de forma opcional u obligatoria, salvo `estado`,
// que se lee aparte porque trae la `clave`.
export type TicketCatalog =
  | "area"
  | "edificio"
  | "tipoTicket"
  | "prioridad"
  | "modulo"
  | "proveedor";

export interface ReferenceMatch {
  id: string;
  numero: number;
  departamentoId: string;
}

// Lo que el service decide escribir en el alta. Las fechas llegan como "YYYY-MM-DD".
export interface TicketCreateData {
  departamentoId: string;
  prioridadId: string;
  estadoId: string;
  proveedorId: string | null;
  titulo: string;
  descripcion: string | null;
  actuacionSimple: string | null;
  referenciaExterna: string | null;
  fechaRecepcion: string;
}

// Lo que el service decide escribir en la edición: reemplaza todos los campos editables (las fechas
// como "YYYY-MM-DD" o `null`). No incluye estado ni departamento: tienen su propio procedimiento.
export interface TicketUpdateData {
  titulo: string;
  descripcion: string | null;
  actuacionSimple: string | null;
  prioridadId: string;
  areaId: string | null;
  edificioId: string | null;
  tipoId: string | null;
  moduloId: string | null;
  proveedorId: string | null;
  referenciaExterna: string | null;
  fechaRecepcion: string;
  fechaCierre: string | null;
  fechaReabierto: string | null;
  solucionDescripcion: string | null;
  notificado: boolean;
}

// Lo que escribe el cambio de estado (Feature 5.4). Una fecha o la solución ausente (`undefined`) no
// se toca; `null` la borra. El service decide cuáles manda según la `clave` del estado destino.
export interface TicketStatusData {
  estadoId: string;
  fechaCierre?: string | null;
  fechaReabierto?: string | null;
  solucionDescripcion?: string | null;
}

// Los campos que una escritura con bloqueo optimista puede tocar (la unión de las anteriores).
type TicketWrite = Partial<TicketUpdateData> & { estadoId?: string; departamentoId?: string };

const ref = { select: { id: true, nombre: true } } as const;
const user = { select: { id: true, name: true } } as const;

const detailSelect = {
  id: true,
  numero: true,
  departamento: { select: { id: true, name: true } },
  area: ref,
  edificio: ref,
  tipo: ref,
  modulo: ref,
  prioridad: ref,
  proveedor: ref,
  estado: { select: { id: true, nombre: true, clave: true } },
  titulo: true,
  descripcion: true,
  actuacionSimple: true,
  referenciaExterna: true,
  solucionDescripcion: true,
  notificado: true,
  fechaRecepcion: true,
  fechaCierre: true,
  fechaReabierto: true,
  creador: user,
  editor: user,
  createdAt: true,
  updatedAt: true,
} as const;

const summarySelect = {
  id: true,
  numero: true,
  titulo: true,
  departamento: { select: { id: true, name: true } },
  estado: { select: { id: true, nombre: true, clave: true } },
  prioridad: ref,
  area: ref,
  fechaRecepcion: true,
} as const;

interface DbRef {
  id: string;
  nombre: string;
}
interface DbUser {
  id: string;
  name: string;
}
interface DbEstado extends DbRef {
  clave: string | null;
}

interface DbTicketSummary {
  id: string;
  numero: number;
  titulo: string;
  departamento: DbUser;
  estado: DbEstado;
  prioridad: DbRef;
  area: DbRef | null;
  fechaRecepcion: Date;
}

interface DbTicket extends DbTicketSummary {
  edificio: DbRef | null;
  tipo: DbRef | null;
  modulo: DbRef | null;
  proveedor: DbRef | null;
  descripcion: string | null;
  actuacionSimple: string | null;
  referenciaExterna: string | null;
  solucionDescripcion: string | null;
  notificado: boolean;
  fechaCierre: Date | null;
  fechaReabierto: Date | null;
  creador: DbUser;
  editor: DbUser;
  createdAt: Date;
  updatedAt: Date;
}

// Las columnas `date` salen como `Date` a medianoche UTC: el día es la parte de la fecha ISO.
const toDay = (date: Date): string => date.toISOString().slice(0, 10);
const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

const fromUser = (u: DbUser): DbRef => ({ id: u.id, nombre: u.name });
// La base guarda `clave` como texto; solo se escribe desde el seed, con las 4 claves del contrato.
const fromEstado = <T extends DbEstado>(e: T) => ({ ...e, clave: e.clave as ClaveEstado | null });

function toSummary(row: DbTicketSummary): TicketSummaryRow {
  return {
    id: row.id,
    numero: row.numero,
    titulo: row.titulo,
    departamento: fromUser(row.departamento),
    estado: fromEstado(row.estado),
    prioridad: row.prioridad,
    area: row.area,
    fechaRecepcion: toDay(row.fechaRecepcion),
  };
}

function toRow(row: DbTicket): TicketRow {
  return {
    ...toSummary(row),
    edificio: row.edificio,
    tipo: row.tipo,
    modulo: row.modulo,
    proveedor: row.proveedor,
    descripcion: row.descripcion,
    actuacionSimple: row.actuacionSimple,
    referenciaExterna: row.referenciaExterna,
    solucionDescripcion: row.solucionDescripcion,
    notificado: row.notificado,
    fechaCierre: row.fechaCierre && toDay(row.fechaCierre),
    fechaReabierto: row.fechaReabierto && toDay(row.fechaReabierto),
    creador: fromUser(row.creador),
    editor: fromUser(row.editor),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// La columna del ticket que referencia a cada catálogo, para contar el uso de un ítem.
const CATALOG_COLUMN: Record<CatalogRuta, (itemId: string) => object> = {
  areas: (id) => ({ areaId: id }),
  edificios: (id) => ({ edificioId: id }),
  tipos: (id) => ({ tipoId: id }),
  prioridades: (id) => ({ prioridadId: id }),
  modulos: (id) => ({ moduloId: id }),
  proveedores: (id) => ({ proveedorId: id }),
  estados: (id) => ({ estadoId: id }),
};

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

// Única capa que toca `Ticket`. También lee las filas de catálogo y de departamento que referencia
// (son sus FK): validar que un valor nuevo esté activo es parte de escribir un ticket.
@Injectable()
export class TicketsRepository implements TicketUsageReader {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  // Uso de un ítem de catálogo (`TicketUsageReader`): solo cuentan los tickets no eliminados.
  async countByCatalogItem(ruta: CatalogRuta, itemId: string): Promise<number> {
    return this.db.ticket.count({ where: { ...CATALOG_COLUMN[ruta](itemId), ...notDeleted } });
  }

  // Uso de un departamento (`TicketUsageReader`): cuentan también los eliminados.
  async countByDepartment(departmentId: string): Promise<number> {
    return this.db.ticket.count({ where: { departamentoId: departmentId } });
  }

  // No eliminado, con sus referencias resueltas (nombre incluido, aunque el ítem esté inactivo o
  // eliminado después: los `include` de una referencia ya cargada no filtran, SPEC 03 Feature 3.4).
  async findDetail(id: string): Promise<TicketRow | null> {
    const row = await this.db.ticket.findFirst({
      where: { id, ...notDeleted },
      select: detailSelect,
    });
    return row && toRow(row);
  }

  // Una página de la bandeja (SPEC 06). `departmentId` es el alcance ya resuelto por el service: el del
  // agente, o el filtro del admin (`null` = todos); el `departamentoId` de `filters` se ignora acá.
  // Los filtros por igualdad y de fecha van por Prisma. El texto libre, por SQL a mano (Prisma no
  // expresa `unaccent`), que solo devuelve los ids que coinciden. `count` y la página usan el mismo
  // `where`. Orden fijo: `fechaRecepcion` y `numero` descendentes (Q34).
  async findPage(
    departmentId: string | null,
    filters: ListTicketsInput,
  ): Promise<{ items: TicketSummaryRow[]; total: number }> {
    const matchingIds = filters.q ? await this.searchIds(departmentId, filters.q) : undefined;
    if (matchingIds?.length === 0) return { items: [], total: 0 };

    // Un filtro `undefined` no se aplica: Prisma lo ignora.
    const where: Prisma.TicketWhereInput = {
      ...notDeleted,
      id: matchingIds && { in: matchingIds },
      departamentoId: departmentId ?? undefined,
      estadoId: filters.estadoId,
      areaId: filters.areaId,
      edificioId: filters.edificioId,
      tipoId: filters.tipoId,
      prioridadId: filters.prioridadId,
      proveedorId: filters.proveedorId,
      moduloId: filters.moduloId,
      fechaRecepcion:
        filters.fechaRecepcionDesde || filters.fechaRecepcionHasta
          ? {
              gte: filters.fechaRecepcionDesde ? toDate(filters.fechaRecepcionDesde) : undefined,
              lte: filters.fechaRecepcionHasta ? toDate(filters.fechaRecepcionHasta) : undefined,
            }
          : undefined,
    };

    const [total, rows] = await this.db.$transaction([
      this.db.ticket.count({ where }),
      this.db.ticket.findMany({
        where,
        orderBy: [{ fechaRecepcion: "desc" }, { numero: "desc" }],
        skip: (filters.page - 1) * TICKETS_PAGE_SIZE,
        take: TICKETS_PAGE_SIZE,
        select: summarySelect,
      }),
    ]);
    return { items: rows.map(toSummary), total };
  }

  // Ids de los tickets cuyo título, descripción, solución o algún comentario no eliminado contiene `q`,
  // sin distinguir mayúsculas ni acentos (D3): "tecnico" encuentra "Técnico". Es SQL escrito a mano y
  // por eso repite lo que Prisma pone solo: `"deletedAt" IS NULL`, del ticket y del comentario, y el
  // alcance. `q` siempre va como parámetro, nunca interpolado; se escapan `\`, `%` y `_` para que
  // "50%" busque el texto literal. No busca en nombres de catálogo, número ni historial (Q33).
  private async searchIds(departmentId: string | null, q: string): Promise<string[]> {
    const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const matches = (column: Prisma.Sql) =>
      Prisma.sql`lower(unaccent(${column})) LIKE lower(unaccent(${pattern}::text)) ESCAPE '\\'`;
    const scope = departmentId
      ? Prisma.sql`AND t."departamentoId" = ${departmentId}`
      : Prisma.empty;

    const rows = await this.db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT t."id"
      FROM "ticket" t
      WHERE t."deletedAt" IS NULL
        ${scope}
        AND (
          ${matches(Prisma.sql`t."titulo"`)}
          OR ${matches(Prisma.sql`t."descripcion"`)}
          OR ${matches(Prisma.sql`t."solucionDescripcion"`)}
          OR EXISTS (
            SELECT 1
            FROM "ticket_comentario" c
            WHERE c."ticketId" = t."id"
              AND c."deletedAt" IS NULL
              AND ${matches(Prisma.sql`c."texto"`)}
          )
        )
    `);
    return rows.map((row) => row.id);
  }

  // Departamento de un ticket no eliminado, o `null`. Lo usan los resolvers del guard.
  async findDepartmentId(id: string): Promise<string | null> {
    const row = await this.db.ticket.findFirst({
      where: { id, ...notDeleted },
      select: { departamentoId: true },
    });
    return row?.departamentoId ?? null;
  }

  async findDepartment(id: string): Promise<ReferenceRow | null> {
    const row = await this.db.organization.findUnique({
      where: { id },
      select: { id: true, name: true, activo: true },
    });
    return row && { id: row.id, nombre: row.name, activo: row.activo };
  }

  // Un ítem de catálogo no eliminado, o `null`.
  async findCatalogItem(catalog: TicketCatalog, id: string): Promise<ReferenceRow | null> {
    const where = { id, ...notDeleted };
    const select = { id: true, nombre: true, activo: true } as const;
    switch (catalog) {
      case "area":
        return this.db.area.findFirst({ where, select });
      case "edificio":
        return this.db.edificio.findFirst({ where, select });
      case "tipoTicket":
        return this.db.tipoTicket.findFirst({ where, select });
      case "prioridad":
        return this.db.prioridad.findFirst({ where, select });
      case "modulo":
        return this.db.modulo.findFirst({ where, select });
      case "proveedor":
        return this.db.proveedor.findFirst({ where, select });
    }
  }

  // Todos los estados no eliminados, en el orden de `catalogs.estados.list`.
  async findEstados(): Promise<EstadoRow[]> {
    const rows = await this.db.estadoTicket.findMany({
      where: notDeleted,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, activo: true, clave: true },
    });
    return rows.map(fromEstado);
  }

  // Un ticket no eliminado con esa referencia para ese proveedor, salvo `exceptId` (el que se edita).
  async findByReferencia(
    proveedorId: string,
    referenciaExterna: string,
    exceptId?: string,
  ): Promise<ReferenceMatch | null> {
    return this.db.ticket.findFirst({
      where: {
        proveedorId,
        referenciaExterna,
        ...notDeleted,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true, numero: true, departamentoId: true },
    });
  }

  // El alta y su `AuditLog` van en la misma transacción. El `numero` lo toma la secuencia de
  // Postgres al insertar, así que la auditoría se arma a partir de la fila ya creada (`auditOf`).
  async create(
    data: TicketCreateData,
    actorId: string,
    auditOf: (created: TicketRow) => Omit<AuditEntry, "entityId">,
  ): Promise<TicketRow> {
    try {
      return await this.db.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data: {
            ...data,
            fechaRecepcion: toDate(data.fechaRecepcion),
            createdBy: actorId,
            updatedBy: actorId,
          },
          select: detailSelect,
        });
        const row = toRow(created);
        await writeAuditEntry(tx, { ...auditOf(row), entityId: row.id });
        return row;
      });
    } catch (error) {
      return translate(error);
    }
  }

  async update(
    id: string,
    expectedUpdatedAt: string,
    data: TicketUpdateData,
    actorId: string,
    audit: AuditEntry,
  ): Promise<TicketRow> {
    return this.writeLocked(id, expectedUpdatedAt, data, actorId, audit);
  }

  async changeStatus(
    id: string,
    expectedUpdatedAt: string,
    data: TicketStatusData,
    actorId: string,
    audit: AuditEntry,
  ): Promise<TicketRow> {
    return this.writeLocked(id, expectedUpdatedAt, data, actorId, audit);
  }

  async changeDepartment(
    id: string,
    expectedUpdatedAt: string,
    departamentoId: string,
    actorId: string,
    audit: AuditEntry,
  ): Promise<TicketRow> {
    return this.writeLocked(id, expectedUpdatedAt, { departamentoId }, actorId, audit);
  }

  // Eliminación lógica: nunca hay `DELETE` físico. El número no se reutiliza y la referencia externa
  // queda libre (el índice único parcial solo cuenta los no eliminados). Un ticket que ya no existe
  // o ya está eliminado es 404, también si otro lo eliminó entre la lectura y esta escritura.
  async softDelete(id: string, actorId: string, audit: AuditEntry): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id, ...notDeleted },
        data: softDeleteData(actorId),
      });
      if (count === 0) throw new ORPCError("NOT_FOUND", { message: "El ticket no existe" });
      await writeAuditEntry(tx, audit);
    });
  }

  // Bloqueo optimista: la escritura exige que `updatedAt` siga siendo el que el cliente leyó. Si no
  // actualiza ninguna fila, o lo modificó otro (409) o ya no existe (404), y no se guarda nada. La
  // escritura y su `AuditLog` van en la misma transacción.
  private async writeLocked(
    id: string,
    expectedUpdatedAt: string,
    write: TicketWrite,
    actorId: string,
    audit: AuditEntry,
  ): Promise<TicketRow> {
    const { fechaRecepcion, fechaCierre, fechaReabierto, ...rest } = write;
    // `undefined` no se toca; `null` borra; un día se guarda como `date`.
    const dateOf = (day: string | null | undefined) => (day ? toDate(day) : day);
    try {
      return await this.db.$transaction(async (tx) => {
        const { count } = await tx.ticket.updateMany({
          where: { id, updatedAt: new Date(expectedUpdatedAt), ...notDeleted },
          data: {
            ...rest,
            fechaRecepcion: dateOf(fechaRecepcion) ?? undefined,
            fechaCierre: dateOf(fechaCierre),
            fechaReabierto: dateOf(fechaReabierto),
            updatedBy: actorId,
          },
        });
        if (count === 0) {
          const exists = (await tx.ticket.count({ where: { id, ...notDeleted } })) > 0;
          throw exists
            ? new ORPCError("CONFLICT", { message: STALE_TICKET_MESSAGE })
            : new ORPCError("NOT_FOUND", { message: "El ticket no existe" });
        }
        const row = await tx.ticket.findFirstOrThrow({ where: { id }, select: detailSelect });
        await writeAuditEntry(tx, audit);
        return toRow(row);
      });
    } catch (error) {
      return translate(error);
    }
  }
}

// La violación del índice único parcial de la referencia externa (carrera entre dos altas con el
// mismo proveedor y la misma referencia) llega como P2002. El mensaje no nombra el ticket: acá no
// se sabe si quien lo recibe puede verlo.
function translate(error: unknown): never {
  if (hasCode(error, "P2002")) {
    throw new ORPCError("CONFLICT", {
      message: "Esa referencia ya está cargada en otro ticket de ese proveedor",
    });
  }
  throw error;
}
