import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { AuditHistory, CatalogItem, EstadoTicket, Proveedor } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { normalizeName } from "../../common/text";
import type { AuditEntry } from "../audit/audit.repository";
import { AuditService } from "../audit/audit.service";
import { type AuditSnapshot, computeDiff, pickSnapshot } from "../audit/audit-diff";
import type { CatalogDefinition } from "./catalog-definitions";
import {
  type CatalogRow,
  CatalogsRepository,
  type CatalogWrite,
  type OrdenChange,
} from "./catalogs.repository";

// Lo que devuelve cualquiera de los 7 catálogos; cada controller lo ajusta a su esquema de salida.
export type CatalogItemView = CatalogItem | Proveedor | EstadoTicket;

// Entrada de alta y edición: el service solo lee los campos de `def.inputFields`, así que un campo
// de más (por ejemplo `clave` en un alta) nunca llega a la base.
type CatalogInput = { nombre: string } & Record<string, string | null | undefined>;

// Foto auditable (SPEC 03): solo los campos de la definición entran en el diff.
function snapshotOf(def: CatalogDefinition, values: Record<string, unknown>): AuditSnapshot {
  const snapshot = {} as AuditSnapshot;
  for (const field of def.snapshotFields) snapshot[field] = (values[field] ?? null) as never;
  return snapshot;
}

function toItem(def: CatalogDefinition, row: CatalogRow): CatalogItemView {
  return { id: row.id, ...pickSnapshot(row, def.snapshotFields) } as CatalogItemView;
}

@Injectable()
export class CatalogsService {
  constructor(
    private readonly repository: CatalogsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(def: CatalogDefinition): Promise<CatalogItemView[]> {
    return (await this.repository.findAll(def)).map((row) => toItem(def, row));
  }

  // Sin chequear que el ítem exista: el de uno eliminado se sigue leyendo, y un id sin registros
  // devuelve `[]`.
  async history(def: CatalogDefinition, itemId: string): Promise<AuditHistory> {
    return this.audit.history(def.entityType, itemId);
  }

  async create(
    def: CatalogDefinition,
    input: CatalogInput,
    actor: AuthenticatedUser,
  ): Promise<CatalogItemView> {
    const all = await this.repository.findAll(def);
    this.assertNameIsFree(def, all, input.nombre);
    const orden = all.reduce((max, row) => Math.max(max, row.orden), 0) + 1;
    const data = { ...this.writableFields(def, input), orden, activo: true };
    const created = await this.repository.create(def, data, actor.id, {
      entityType: def.entityType,
      action: "create",
      actorId: actor.id,
      payload: { after: snapshotOf(def, data) },
    });
    return toItem(def, created);
  }

  // Reemplaza todos los campos editables. Sin cambios efectivos no se escribe nada y no queda
  // registro.
  async update(
    def: CatalogDefinition,
    itemId: string,
    input: CatalogInput,
    actor: AuthenticatedUser,
  ): Promise<CatalogItemView> {
    const all = await this.repository.findAll(def);
    const current = this.requireIn(def, all, itemId);
    this.assertNameIsFree(def, all, input.nombre, itemId);
    const data = this.writableFields(def, input);
    const audit = this.updateEntry(def, current, { ...current, ...data }, actor);
    if (!audit) return toItem(def, current);
    return toItem(def, await this.repository.update(def, itemId, data, actor.id, audit));
  }

  async setActive(
    def: CatalogDefinition,
    itemId: string,
    activo: boolean,
    actor: AuthenticatedUser,
  ): Promise<CatalogItemView> {
    const all = await this.repository.findAll(def);
    const current = this.requireIn(def, all, itemId);
    if (!activo && def.rules.lastActive && this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", { message: def.rules.lastActive.deactivate });
    }
    const audit = this.updateEntry(def, current, { ...current, activo }, actor);
    if (!audit) return toItem(def, current);
    return toItem(def, await this.repository.setActive(def, itemId, activo, actor.id, audit));
  }

  // Intercambia el `orden` con el vecino inmediato, en el orden de `list`. En un extremo no hay
  // vecino: responde sin cambios ni auditoría. Si dos ítems comparten `orden` (solo posible
  // editando la base a mano), renumera 1..N antes de intercambiar y audita solo lo que cambió.
  async move(
    def: CatalogDefinition,
    itemId: string,
    direccion: "subir" | "bajar",
    actor: AuthenticatedUser,
  ): Promise<void> {
    const all = await this.repository.findAll(def);
    const index = all.findIndex((row) => row.id === itemId);
    if (index === -1) throw new ORPCError("NOT_FOUND", { message: def.messages.notFound });
    const neighbor = index + (direccion === "subir" ? -1 : 1);
    if (neighbor < 0 || neighbor >= all.length) return;

    const hasTie = new Set(all.map((row) => row.orden)).size !== all.length;
    const ordenes = all.map((row, position) => (hasTie ? position + 1 : row.orden));
    [ordenes[index], ordenes[neighbor]] = [ordenes[neighbor] as number, ordenes[index] as number];

    const changes: OrdenChange[] = [];
    for (const [position, row] of all.entries()) {
      const orden = ordenes[position] as number;
      if (orden === row.orden) continue;
      const audit = this.updateEntry(def, row, { ...row, orden }, actor);
      if (audit) changes.push({ id: row.id, orden, audit });
    }
    if (changes.length > 0) await this.repository.swapOrden(def, changes, actor.id);
  }

  // En SPEC 05 este mismo método suma el chequeo de tickets (ni siquiera eliminados lógicamente).
  async remove(def: CatalogDefinition, itemId: string, actor: AuthenticatedUser): Promise<void> {
    const all = await this.repository.findAll(def);
    const current = this.requireIn(def, all, itemId);
    if (def.rules.keyedNotRemovable && current.clave) {
      throw new ORPCError("CONFLICT", { message: def.rules.keyedNotRemovable });
    }
    if (def.rules.lastActive && this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", { message: def.rules.lastActive.remove });
    }
    await this.repository.softDelete(def, itemId, actor.id, {
      entityType: def.entityType,
      entityId: itemId,
      action: "delete",
      actorId: actor.id,
      payload: {},
    });
  }

  // Los campos del cliente según la definición, más `nombreNormalizado`, que nunca llega de afuera.
  private writableFields(def: CatalogDefinition, input: CatalogInput): CatalogWrite {
    const data: CatalogWrite = { nombreNormalizado: normalizeName(input.nombre) };
    for (const field of def.inputFields) data[field] = input[field] ?? null;
    return data;
  }

  // `null` cuando la foto auditable no cambió: no hay nada que escribir ni auditar.
  private updateEntry(
    def: CatalogDefinition,
    before: CatalogRow,
    after: Record<string, unknown>,
    actor: AuthenticatedUser,
  ): AuditEntry | null {
    const diff = computeDiff(snapshotOf(def, before), snapshotOf(def, after));
    if (!diff) return null;
    return {
      entityType: def.entityType,
      entityId: before.id,
      action: "update",
      actorId: actor.id,
      payload: { ...diff },
    };
  }

  private requireIn(def: CatalogDefinition, all: CatalogRow[], id: string): CatalogRow {
    const found = all.find((row) => row.id === id);
    if (!found) throw new ORPCError("NOT_FOUND", { message: def.messages.notFound });
    return found;
  }

  // Eliminar o desactivar un ítem inactivo nunca deja a un catálogo sin activos.
  private isLastActive(all: CatalogRow[], current: CatalogRow): boolean {
    return current.activo && all.filter((row) => row.activo).length === 1;
  }

  // Cuentan activos e inactivos; los eliminados no están en `all` y liberan el nombre (Q14).
  private assertNameIsFree(
    def: CatalogDefinition,
    all: CatalogRow[],
    nombre: string,
    exceptId?: string,
  ): void {
    const key = normalizeName(nombre);
    if (all.some((row) => row.id !== exceptId && row.nombreNormalizado === key)) {
      throw new ORPCError("CONFLICT", { message: def.messages.duplicate });
    }
  }
}
