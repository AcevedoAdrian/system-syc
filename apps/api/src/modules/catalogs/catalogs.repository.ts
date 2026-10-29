import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { getPrismaClient } from "@syc/db";
import { notDeleted, softDeleteData } from "../../common/soft-delete";
import { normalizeName } from "../../common/text";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { type AuditEntry, type AuditTransaction, writeAuditEntry } from "../audit/audit.repository";
import type { CatalogDefinition, CatalogLinks, CatalogModel } from "./catalog-definitions";

export interface RelatedItem {
  id: string;
  nombre: string;
}

// `{ id, nombre }` es la relación de una referencia (`tipo` de un área); la lista, la de un vínculo
// muchos a muchos (`departamentos` de un módulo).
type CatalogValue = string | number | boolean | null | RelatedItem | RelatedItem[];

// Fila de cualquiera de los 8 catálogos: la base más los campos extra de su definición
// (`contacto`, `clave`, ...), que dependen del catálogo.
export interface CatalogRow {
  id: string;
  nombre: string;
  nombreNormalizado: string;
  orden: number;
  activo: boolean;
  [campo: string]: CatalogValue;
}

// El destino de una referencia, para validar que exista y esté activo.
export interface ReferenceRow {
  id: string;
  nombre: string;
  activo: boolean;
}

// Campos que el service decide escribir (los de `inputFields` más `nombreNormalizado` y `orden`).
export type CatalogWrite = Record<string, CatalogValue>;

// Una fila del seed con la auditoría de su alta (el id lo genera la base).
export interface SeedEntry {
  data: CatalogWrite;
  audit: Omit<AuditEntry, "entityId">;
}

export interface OrdenChange {
  id: string;
  orden: number;
  audit: AuditEntry;
}

// Los 7 delegados de Prisma tienen la misma forma para lo que se usa acá, pero TypeScript no los
// unifica. Esta interfaz es el único punto donde se afloja el tipado: los datos que entran ya los
// armó el service a partir de los campos de la definición.
// El destino de un vínculo y su tabla de unión, con lo mismo: el único punto donde se afloja el tipado
// de esas dos tablas.
interface LinkTargetDelegate {
  findMany(args: { where: object; select: object }): Promise<Record<string, unknown>[]>;
}

interface LinkJoinDelegate {
  deleteMany(args: { where: object }): Promise<unknown>;
}

interface CatalogDelegate {
  findFirst(args: { where: object; select: object }): Promise<ReferenceRow | null>;
  findMany(args: { where: object; orderBy: object[]; select: object }): Promise<CatalogRow[]>;
  count(args: { where?: object }): Promise<number>;
  create(args: { data: object; select: object }): Promise<CatalogRow>;
  update(args: { where: object; data: object; select: object }): Promise<CatalogRow>;
}

function selectOf(def: CatalogDefinition): Record<string, unknown> {
  const select: Record<string, unknown> = { id: true, nombreNormalizado: true };
  for (const field of def.snapshotFields) select[field] = true;
  // La FK se lee siempre (el service compara contra ella) y la relación sale como `{ id, nombre }`.
  if (def.reference) {
    select[def.reference.field] = true;
    select[def.reference.as] = { select: { id: true, nombre: true } };
  }
  // Las filas de la unión con el destino de cada una; `readLinks` las aplana a `{ id, nombre }`.
  if (def.links) {
    const { as, target, targetName } = def.links;
    select[as] = { select: { [target]: { select: { id: true, [targetName]: true } } } };
  }
  return select;
}

// Por nombre normalizado y, si empatan, por id: el orden de la salida y del diff de la auditoría.
export function sortRelated(items: readonly RelatedItem[]): RelatedItem[] {
  return [...items].sort(
    (a, b) =>
      normalizeName(a.nombre).localeCompare(normalizeName(b.nombre)) || a.id.localeCompare(b.id),
  );
}

// Aplana la relación de un vínculo (`[{ organization: { id, name } }]`) a `[{ id, nombre }]` ordenada.
function readLinks(def: CatalogDefinition, row: CatalogRow): CatalogRow {
  const links = def.links;
  if (!links) return row;
  const joins = row[links.as] as unknown as Record<string, Record<string, string>>[];
  const items = joins.map((join) => {
    const target = join[links.target] as Record<string, string>;
    return { id: target.id as string, nombre: target[links.targetName] as string };
  });
  return { ...row, [links.as]: sortRelated(items) };
}

// Escribe la lista entera de la unión dentro del `create` o el `update` del ítem (una sola operación).
function writeLinks(links: CatalogLinks, ids: readonly string[], replace: boolean) {
  const create = ids.map((id) => ({ [links.targetFk]: id }));
  return { [links.as]: replace ? { deleteMany: {}, create } : { create } };
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

// La violación del índice único parcial (carrera entre dos altas con el mismo nombre) llega como
// P2002; un `update` sobre un ítem que otro acaba de eliminar, como P2025.
function translate(def: CatalogDefinition, error: unknown): never {
  if (hasCode(error, "P2002")) {
    throw new ORPCError("CONFLICT", { message: def.messages.duplicate });
  }
  if (hasCode(error, "P2025")) {
    throw new ORPCError("NOT_FOUND", { message: def.messages.notFound });
  }
  throw error;
}

@Injectable()
export class CatalogsRepository {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get db() {
    return getPrismaClient(this.env.DATABASE_URL);
  }

  private delegate(def: CatalogDefinition, client: AuditTransaction | typeof this.db) {
    return client[def.model] as unknown as CatalogDelegate;
  }

  // Filas no eliminadas de `model` cuya FK `field` apunta a `id` (regla `usedBy` de la definición).
  async countReferencing(model: CatalogModel, field: string, id: string): Promise<number> {
    const delegate = this.db[model] as unknown as CatalogDelegate;
    return delegate.count({ where: { [field]: id, ...notDeleted } });
  }

  // El destino no eliminado de una referencia (`null` si no existe), activo o no.
  async findReference(model: CatalogModel, id: string): Promise<ReferenceRow | null> {
    const delegate = this.db[model] as unknown as CatalogDelegate;
    return delegate.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, nombre: true, activo: true },
    });
  }

  // Los destinos de un vínculo que existen (activos o no), para validar la lista que llega.
  async findLinkTargets(links: CatalogLinks, ids: readonly string[]): Promise<ReferenceRow[]> {
    const delegate = this.db[links.target] as unknown as LinkTargetDelegate;
    const rows = await delegate.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, [links.targetName]: true, activo: true },
    });
    return rows.map((found) => ({
      id: found.id as string,
      nombre: found[links.targetName] as string,
      activo: found.activo as boolean,
    }));
  }

  // No eliminados, activos e inactivos, en el orden de `list`.
  async findAll(def: CatalogDefinition): Promise<CatalogRow[]> {
    const rows = await this.delegate(def, this.db).findMany({
      where: notDeleted,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: selectOf(def),
    });
    return rows.map((row) => readLinks(def, row));
  }

  // Cada mutación escribe su `AuditLog` en la misma transacción: si falla la auditoría, falla la
  // mutación. En el alta el id lo genera la base, por eso la entrada no trae `entityId`.
  async create(
    def: CatalogDefinition,
    data: CatalogWrite,
    actorId: string,
    audit: Omit<AuditEntry, "entityId">,
    linkIds: readonly string[] = [],
  ): Promise<CatalogRow> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await this.delegate(def, tx).create({
          data: {
            ...data,
            createdBy: actorId,
            updatedBy: actorId,
            ...(def.links ? writeLinks(def.links, linkIds, false) : {}),
          },
          select: selectOf(def),
        });
        await writeAuditEntry(tx, { ...audit, entityId: row.id });
        return readLinks(def, row);
      });
    } catch (error) {
      return translate(def, error);
    }
  }

  async update(
    def: CatalogDefinition,
    id: string,
    data: CatalogWrite,
    actorId: string,
    audit: AuditEntry,
    linkIds?: readonly string[],
  ): Promise<CatalogRow> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await this.delegate(def, tx).update({
          where: { id, ...notDeleted },
          // `linkIds` solo viene si el conjunto cambió: reemplaza la lista entera de la unión.
          data: {
            ...data,
            updatedBy: actorId,
            ...(def.links && linkIds ? writeLinks(def.links, linkIds, true) : {}),
          },
          select: selectOf(def),
        });
        await writeAuditEntry(tx, audit);
        return readLinks(def, row);
      });
    } catch (error) {
      return translate(def, error);
    }
  }

  async setActive(
    def: CatalogDefinition,
    id: string,
    activo: boolean,
    actorId: string,
    audit: AuditEntry,
  ): Promise<CatalogRow> {
    return this.update(def, id, { activo }, actorId, audit);
  }

  // Aplica varios cambios de `orden` (el intercambio de `move`, o la renumeración previa si hay
  // empates) y la auditoría de cada uno en una sola transacción.
  async swapOrden(def: CatalogDefinition, changes: OrdenChange[], actorId: string): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        for (const change of changes) {
          await this.delegate(def, tx).update({
            where: { id: change.id, ...notDeleted },
            data: { orden: change.orden, updatedBy: actorId },
            select: { id: true },
          });
          await writeAuditEntry(tx, change.audit);
        }
      });
    } catch (error) {
      translate(def, error);
    }
  }

  // Nunca hay `DELETE` físico sobre un catálogo, salvo las filas de su unión: un ítem eliminado no se
  // puede editar, y si las conservara bloquearía para siempre la eliminación de su destino (la FK
  // `Restrict`).
  async softDelete(
    def: CatalogDefinition,
    id: string,
    actorId: string,
    audit: AuditEntry,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await this.delegate(def, tx).update({
          where: { id, ...notDeleted },
          data: softDeleteData(actorId),
          select: { id: true },
        });
        if (def.links) {
          const join = tx[def.links.join] as unknown as LinkJoinDelegate;
          await join.deleteMany({ where: { [def.links.ownerFk]: id } });
        }
        await writeAuditEntry(tx, audit);
      });
    } catch (error) {
      translate(def, error);
    }
  }

  // Sin ninguna fila, ni siquiera eliminada (la misma condición que `seedIfEmpty`).
  async isEmpty(def: CatalogDefinition): Promise<boolean> {
    return (await this.delegate(def, this.db).count({})) === 0;
  }

  // Carga las filas solo si la tabla no tiene ninguna, ni siquiera eliminada: así el seed no recrea
  // un nombre que el admin cambió. El conteo, las altas y su auditoría van en una transacción.
  // Devuelve cuántas filas creó.
  async seedIfEmpty(
    def: CatalogDefinition,
    entries: SeedEntry[],
    actorId: string,
  ): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const delegate = this.delegate(def, tx);
      if ((await delegate.count({})) > 0) return 0;
      for (const entry of entries) {
        const row = await delegate.create({
          data: { ...entry.data, createdBy: actorId, updatedBy: actorId },
          select: { id: true },
        });
        await writeAuditEntry(tx, { ...entry.audit, entityId: row.id });
      }
      return entries.length;
    });
  }
}
