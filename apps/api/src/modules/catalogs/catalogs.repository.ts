import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { getPrismaClient } from "@syc/db";
import { notDeleted, softDeleteData } from "../../common/soft-delete";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { type AuditEntry, type AuditTransaction, writeAuditEntry } from "../audit/audit.repository";
import type { CatalogDefinition } from "./catalog-definitions";

type CatalogValue = string | number | boolean | null;

// Fila de cualquiera de los 7 catálogos: la base más los campos extra de su definición
// (`contacto`, `clave`, ...), que dependen del catálogo.
export interface CatalogRow {
  id: string;
  nombre: string;
  nombreNormalizado: string;
  orden: number;
  activo: boolean;
  [campo: string]: CatalogValue;
}

// Campos que el service decide escribir (los de `inputFields` más `nombreNormalizado` y `orden`).
export type CatalogWrite = Record<string, CatalogValue>;

export interface OrdenChange {
  id: string;
  orden: number;
  audit: AuditEntry;
}

// Los 7 delegados de Prisma tienen la misma forma para lo que se usa acá, pero TypeScript no los
// unifica. Esta interfaz es el único punto donde se afloja el tipado: los datos que entran ya los
// armó el service a partir de los campos de la definición.
interface CatalogDelegate {
  findMany(args: { where: object; orderBy: object[]; select: object }): Promise<CatalogRow[]>;
  create(args: { data: object; select: object }): Promise<CatalogRow>;
  update(args: { where: object; data: object; select: object }): Promise<CatalogRow>;
}

function selectOf(def: CatalogDefinition): Record<string, true> {
  const select: Record<string, true> = { id: true, nombreNormalizado: true };
  for (const field of def.snapshotFields) select[field] = true;
  return select;
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

  // No eliminados, activos e inactivos, en el orden de `list`.
  async findAll(def: CatalogDefinition): Promise<CatalogRow[]> {
    return this.delegate(def, this.db).findMany({
      where: notDeleted,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      select: selectOf(def),
    });
  }

  // Cada mutación escribe su `AuditLog` en la misma transacción: si falla la auditoría, falla la
  // mutación. En el alta el id lo genera la base, por eso la entrada no trae `entityId`.
  async create(
    def: CatalogDefinition,
    data: CatalogWrite,
    actorId: string,
    audit: Omit<AuditEntry, "entityId">,
  ): Promise<CatalogRow> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await this.delegate(def, tx).create({
          data: { ...data, createdBy: actorId, updatedBy: actorId },
          select: selectOf(def),
        });
        await writeAuditEntry(tx, { ...audit, entityId: row.id });
        return row;
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
  ): Promise<CatalogRow> {
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await this.delegate(def, tx).update({
          where: { id, ...notDeleted },
          data: { ...data, updatedBy: actorId },
          select: selectOf(def),
        });
        await writeAuditEntry(tx, audit);
        return row;
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

  // Nunca hay `DELETE` físico sobre un catálogo.
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
        await writeAuditEntry(tx, audit);
      });
    } catch (error) {
      translate(def, error);
    }
  }
}
