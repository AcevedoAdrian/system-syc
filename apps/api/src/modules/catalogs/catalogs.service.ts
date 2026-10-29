import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type { AuditHistory, CatalogItem, EstadoTicket, Modulo, Proveedor } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { DEPARTMENT_READER, type DepartmentReader } from "../../common/department-reader";
import { normalizeName } from "../../common/text";
import { TICKET_USAGE_READER, type TicketUsageReader } from "../../common/ticket-usage-reader";
import type { AuditEntry } from "../audit/audit.repository";
import { AuditService } from "../audit/audit.service";
import { type AuditSnapshot, computeDiff, pickSnapshot } from "../audit/audit-diff";
import type { CatalogDefinition } from "./catalog-definitions";
import {
  type CatalogRow,
  CatalogsRepository,
  type CatalogWrite,
  type OrdenChange,
  type RelatedItem,
  type SeedEntry,
  sortRelated,
} from "./catalogs.repository";

// Lo que devuelve cualquiera de los 8 catálogos; cada controller lo ajusta a su esquema de salida.
export type CatalogItemView = CatalogItem | Proveedor | EstadoTicket | Modulo;

// Entrada de alta y edición: el service solo lee los campos de `def.inputFields`, así que un campo
// de más (por ejemplo `clave` en un alta) nunca llega a la base.
// La lista de ids de un vínculo (`departamentoIds`) es la única entrada que no es texto.
type CatalogInput = { nombre: string } & Record<string, string | string[] | null | undefined>;

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
    @Inject(TICKET_USAGE_READER) private readonly tickets: TicketUsageReader,
    @Inject(DEPARTMENT_READER) private readonly departments: DepartmentReader,
  ) {}

  // Cualquier usuario con sesión lo lee. Un catálogo con `links.scopeAgentList` (Módulos) le devuelve
  // a un agente solo los ítems de su departamento, con todos sus departamentos; el admin recibe todos.
  // Un agente sin departamento recibe `[]`. El recorte es de la API, no de la pantalla (SPEC 11).
  async list(def: CatalogDefinition, actor: AuthenticatedUser): Promise<CatalogItemView[]> {
    const rows = await this.repository.findAll(def);
    if (!def.links?.scopeAgentList || actor.role === "admin") {
      return rows.map((row) => toItem(def, row));
    }
    const departmentId = await this.departments.findDepartmentIdOf(actor.id);
    if (!departmentId) return [];
    return rows
      .filter((row) => this.relatedOf(def, row).some((item) => item.id === departmentId))
      .map((row) => toItem(def, row));
  }

  // Todos los ítems, sin recorte por usuario: para código del sistema sin sesión (el seed). Nunca
  // desde un endpoint.
  async listAll(def: CatalogDefinition): Promise<CatalogItemView[]> {
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
    const fields = this.writableFields(def, input);
    const relation = await this.resolveReference(def, fields);
    const links = await this.resolveLinks(def, input);
    this.assertNameIsFree(def, all, input.nombre, fields);
    const orden = all.reduce((max, row) => Math.max(max, row.orden), 0) + 1;
    const data = { ...fields, orden, activo: true };
    const created = await this.repository.create(
      def,
      data,
      actor.id,
      {
        entityType: def.entityType,
        action: "create",
        actorId: actor.id,
        payload: { after: snapshotOf(def, { ...data, ...relation, ...links.relation }) },
      },
      links.ids,
    );
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
    const data = this.writableFields(def, input);
    const relation = await this.resolveReference(def, data, current);
    const links = await this.resolveLinks(def, input, current);
    this.assertNameIsFree(def, all, input.nombre, data, itemId);
    const audit = this.updateEntry(
      def,
      current,
      { ...current, ...data, ...relation, ...links.relation },
      actor,
    );
    if (!audit) return toItem(def, current);
    // La unión solo se reescribe si el conjunto cambió; `move` y `setActive` nunca la tocan.
    const linkIds = this.linksChanged(def, current, links.ids) ? links.ids : undefined;
    return toItem(def, await this.repository.update(def, itemId, data, actor.id, audit, linkIds));
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

  // Un ítem que usa algún ticket no eliminado no se elimina (409): se desactiva (Q13, PRD §6.2). Los
  // tickets eliminados no cuentan: su FK sigue válida porque el borrado es lógico.
  async remove(def: CatalogDefinition, itemId: string, actor: AuthenticatedUser): Promise<void> {
    const all = await this.repository.findAll(def);
    const current = this.requireIn(def, all, itemId);
    if (def.rules.keyedNotRemovable && current.clave) {
      throw new ORPCError("CONFLICT", { message: def.rules.keyedNotRemovable });
    }
    if (def.rules.lastActive && this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", { message: def.rules.lastActive.remove });
    }
    const usedBy = def.rules.usedBy;
    if (
      usedBy &&
      (await this.repository.countReferencing(usedBy.model, usedBy.field, itemId)) > 0
    ) {
      throw new ORPCError("CONFLICT", { message: usedBy.message });
    }
    if ((await this.tickets.countByCatalogItem(def.ruta, itemId)) > 0) {
      throw new ORPCError("CONFLICT", {
        message: "Lo usa al menos un ticket: desactivalo en lugar de eliminarlo",
      });
    }
    await this.repository.softDelete(def, itemId, actor.id, {
      entityType: def.entityType,
      entityId: itemId,
      action: "delete",
      actorId: actor.id,
      payload: {},
    });
  }

  // Lo usa el seed para validar antes de cargar; `seedIfEmpty` vuelve a comprobarlo en su transacción.
  async isEmpty(def: CatalogDefinition): Promise<boolean> {
    return this.repository.isEmpty(def);
  }

  // Carga `items` con `orden` 1..N solo si la tabla del catálogo está vacía (Feature 4.5). Lo que
  // crea queda como `create` con `actorId: null` (null = sistema); `adminId` es solo el
  // `createdBy` obligatorio de la fila. Devuelve cuántas filas creó.
  async seedIfEmpty(
    def: CatalogDefinition,
    items: readonly { nombre: string; clave?: string; tipo?: { id: string; nombre: string } }[],
    adminId: string,
  ): Promise<number> {
    const entries: SeedEntry[] = items.map((item, index) => {
      const data: CatalogWrite = {
        nombre: item.nombre,
        nombreNormalizado: normalizeName(item.nombre),
        orden: index + 1,
        activo: true,
      };
      if (item.clave) data.clave = item.clave;
      const reference = def.reference;
      if (reference && item.tipo) data[reference.field] = item.tipo.id;
      return {
        data,
        audit: {
          entityType: def.entityType,
          action: "create",
          actorId: null,
          payload: {
            after: snapshotOf(
              def,
              reference && item.tipo ? { ...data, [reference.as]: item.tipo } : data,
            ),
          },
        },
      };
    });
    return this.repository.seedIfEmpty(def, entries, adminId);
  }

  // Los campos del cliente según la definición, más `nombreNormalizado`, que nunca llega de afuera.
  private writableFields(def: CatalogDefinition, input: CatalogInput): CatalogWrite {
    const data: CatalogWrite = { nombreNormalizado: normalizeName(input.nombre) };
    for (const field of def.inputFields) {
      const value = input[field];
      data[field] = typeof value === "string" ? value : null;
    }
    return data;
  }

  // Valida la referencia de la definición (SPEC 08, Feature 8.2) y devuelve la relación `{ id,
  // nombre }` para la foto auditable. El destino tiene que existir y estar activo, salvo que sea el
  // que el ítem ya tenía: así se puede renombrar un área de un tipo desactivado (misma "referencia
  // válida" que SPEC 05). Sin referencia en la definición no hace nada.
  private async resolveReference(
    def: CatalogDefinition,
    data: CatalogWrite,
    current?: CatalogRow,
  ): Promise<Record<string, { id: string; nombre: string }>> {
    const reference = def.reference;
    if (!reference) return {};
    const id = data[reference.field];
    const kept = current?.[reference.as];
    if (
      typeof id === "string" &&
      kept &&
      !Array.isArray(kept) &&
      typeof kept === "object" &&
      kept.id === id
    ) {
      return { [reference.as]: kept };
    }
    const target =
      typeof id === "string" ? await this.repository.findReference(reference.model, id) : null;
    if (!target?.activo) throw new ORPCError("BAD_REQUEST", { message: reference.invalid });
    return { [reference.as]: { id: target.id, nombre: target.nombre } };
  }

  // Valida la lista de un vínculo (SPEC 11, Feature 11.1) y devuelve los ids sin repetir y la relación
  // `[{ id, nombre }]` ordenada para la foto auditable. Cada destino tiene que existir y estar activo,
  // salvo que el ítem ya lo tuviera (misma "referencia válida"). Sin vínculo en la definición no hace
  // nada.
  private async resolveLinks(
    def: CatalogDefinition,
    input: CatalogInput,
    current?: CatalogRow,
  ): Promise<{ ids: string[]; relation: Record<string, RelatedItem[]> }> {
    const links = def.links;
    if (!links) return { ids: [], relation: {} };
    const raw = input[links.field];
    const ids = Array.isArray(raw) ? [...new Set(raw)] : [];
    if (ids.length === 0) throw new ORPCError("BAD_REQUEST", { message: links.empty });
    const had = new Map(this.relatedOf(def, current).map((item) => [item.id, item]));
    const toCheck = ids.filter((id) => !had.has(id));
    const found = new Map(
      (toCheck.length > 0 ? await this.repository.findLinkTargets(links, toCheck) : []).map(
        (target) => [target.id, target],
      ),
    );
    const related = ids.map((id): RelatedItem => {
      const kept = had.get(id);
      if (kept) return kept;
      const target = found.get(id);
      if (!target?.activo) throw new ORPCError("BAD_REQUEST", { message: links.invalid });
      return { id: target.id, nombre: target.nombre };
    });
    return { ids, relation: { [links.as]: sortRelated(related) } };
  }

  private relatedOf(def: CatalogDefinition, row?: CatalogRow): RelatedItem[] {
    const value = def.links && row ? row[def.links.as] : undefined;
    return Array.isArray(value) ? value : [];
  }

  // ¿Cambió el conjunto de ids? El orden en que llegan no importa.
  private linksChanged(def: CatalogDefinition, current: CatalogRow, ids: readonly string[]) {
    const before = new Set(this.relatedOf(def, current).map((item) => item.id));
    return before.size !== ids.length || ids.some((id) => !before.has(id));
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

  // Cuentan activos e inactivos; los eliminados no están en `all` y liberan el nombre (Q14). Con
  // `uniqueWithin` solo compite con los del mismo valor de ese campo (el tipo).
  private assertNameIsFree(
    def: CatalogDefinition,
    all: CatalogRow[],
    nombre: string,
    data: CatalogWrite,
    exceptId?: string,
  ): void {
    const key = normalizeName(nombre);
    const scope = def.uniqueWithin;
    const taken = all.some(
      (row) =>
        row.id !== exceptId &&
        row.nombreNormalizado === key &&
        (!scope || row[scope] === data[scope]),
    );
    if (taken) {
      throw new ORPCError("CONFLICT", { message: def.messages.duplicate });
    }
  }
}
