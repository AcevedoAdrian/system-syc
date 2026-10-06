import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import {
  type CreateTicketInput,
  formatTicketNumber,
  type Ticket,
  type TicketSummary,
  type UpdateTicketInput,
} from "@syc/contracts";
import type { AuthenticatedUser, UserScope } from "../../common/authenticated-request";
import { computeDiff } from "../audit/audit-diff";
import { snapshotOf } from "./ticket-audit-snapshot";
import {
  type ReferenceMatch,
  type ReferenceRow,
  STALE_TICKET_MESSAGE,
  type TicketCatalog,
  TicketsRepository,
} from "./tickets.repository";

const ENTITY_TYPE = "Ticket";

// La lista mínima de SPEC 05: los más recientes, sin filtros ni paginación (la bandeja es SPEC 06).
const RECENT_LIMIT = 50;

// El guard deja `user.scope` en todo endpoint con `@RequirePermission`. Sin él, un endpoint olvidó
// declararlo: se falla en vez de listar sin filtro.
function scopeOf(actor: AuthenticatedUser): UserScope {
  if (!actor.scope) {
    throw new Error("Falta el scope del usuario: el endpoint debe declarar @RequirePermission");
  }
  return actor.scope;
}

type Ref = { id: string; nombre: string };

// "Referencia válida" de un valor nuevo: existe (no eliminado) y está activo.
function assertUsable(row: ReferenceRow | null, message: string): asserts row is ReferenceRow {
  if (!row?.activo) throw new ORPCError("BAD_REQUEST", { message });
}

// `fechaCierre` y `fechaReabierto` se corrigen en la edición solo si ya tienen valor: cargarlas o
// borrarlas es parte de cambiar de estado (Feature 5.4).
function assertDateCorrectable(label: string, current: string | null, next: string | null): void {
  if ((current === null) !== (next === null)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `${label} se carga al cambiar el estado; acá solo se corrige una que ya existe`,
    });
  }
}

// Compara instantes, no cadenas: el cliente puede mandar el mismo instante con otro formato.
const sameInstant = (a: string, b: string): boolean =>
  new Date(a).getTime() === new Date(b).getTime();

@Injectable()
export class TicketsService {
  constructor(private readonly repository: TicketsRepository) {}

  // El alcance es un filtro obligatorio: el agente ve su departamento y el admin todos.
  async list(actor: AuthenticatedUser): Promise<TicketSummary[]> {
    return this.repository.findRecent(scopeOf(actor).departmentId, RECENT_LIMIT);
  }

  // El guard ya acota a un agente a su departamento (404 si es ajeno); acá solo falta el caso del
  // admin, para quien un id inexistente o eliminado también es 404.
  async get(ticketId: string): Promise<Ticket> {
    const ticket = await this.repository.findDetail(ticketId);
    if (!ticket) throw new ORPCError("NOT_FOUND", { message: "El ticket no existe" });
    return ticket;
  }

  async create(input: CreateTicketInput, actor: AuthenticatedUser): Promise<Ticket> {
    const scope = scopeOf(actor);

    const departamento = await this.repository.findDepartment(input.departamentoId);
    if (!departamento) {
      throw new ORPCError("BAD_REQUEST", { message: "El departamento no existe" });
    }
    if (!departamento.activo) {
      throw new ORPCError("CONFLICT", {
        message: "El departamento está desactivado: no admite tickets nuevos",
      });
    }

    await this.resolveReference("prioridad", input.prioridadId, null, MESSAGES.prioridad);
    await this.resolveOptional("proveedor", input.proveedorId, null, MESSAGES.proveedor);
    if (input.proveedorId && input.referenciaExterna) {
      const duplicate = await this.repository.findByReferencia(
        input.proveedorId,
        input.referenciaExterna,
      );
      if (duplicate) throw duplicateReference(duplicate, scope);
    }

    // Nace en el primer estado activo según el orden de `catalogs.estados.list` (Q17).
    const initial = (await this.repository.findEstados()).find((estado) => estado.activo);
    if (!initial) {
      throw new ORPCError("CONFLICT", {
        message: "No hay ningún estado activo para crear el ticket",
      });
    }

    return this.repository.create(
      {
        departamentoId: input.departamentoId,
        prioridadId: input.prioridadId,
        estadoId: initial.id,
        proveedorId: input.proveedorId,
        titulo: input.titulo,
        descripcion: input.descripcion,
        actuacionSimple: input.actuacionSimple,
        referenciaExterna: input.referenciaExterna,
        fechaRecepcion: input.fechaRecepcion,
      },
      actor.id,
      (created) => ({
        entityType: ENTITY_TYPE,
        action: "create",
        actorId: actor.id,
        payload: { after: snapshotOf(created) },
      }),
    );
  }

  // Reemplaza todos los campos editables (Feature 5.3). Estado y departamento tienen su propio
  // procedimiento. Sin cambios efectivos responde 200 y no escribe ni audita.
  async update(input: UpdateTicketInput, actor: AuthenticatedUser): Promise<Ticket> {
    const scope = scopeOf(actor);
    const current = await this.get(input.ticketId);
    // Antes de todo: con la versión vieja no se guarda nada, ni siquiera "sin cambios".
    if (!sameInstant(input.updatedAt, current.updatedAt)) {
      throw new ORPCError("CONFLICT", { message: STALE_TICKET_MESSAGE });
    }
    assertDateCorrectable("La fecha de cierre", current.fechaCierre, input.fechaCierre);
    assertDateCorrectable("La fecha de reapertura", current.fechaReabierto, input.fechaReabierto);

    const prioridad = await this.resolveReference(
      "prioridad",
      input.prioridadId,
      current.prioridad,
      MESSAGES.prioridad,
    );
    const area = await this.resolveOptional("area", input.areaId, current.area, MESSAGES.area);
    const edificio = await this.resolveOptional(
      "edificio",
      input.edificioId,
      current.edificio,
      MESSAGES.edificio,
    );
    const tipo = await this.resolveOptional(
      "tipoTicket",
      input.tipoId,
      current.tipo,
      MESSAGES.tipo,
    );
    const modulo = await this.resolveOptional(
      "modulo",
      input.moduloId,
      current.modulo,
      MESSAGES.modulo,
    );
    const proveedor = await this.resolveOptional(
      "proveedor",
      input.proveedorId,
      current.proveedor,
      MESSAGES.proveedor,
    );
    if (proveedor && input.referenciaExterna) {
      const duplicate = await this.repository.findByReferencia(
        proveedor.id,
        input.referenciaExterna,
        current.id,
      );
      if (duplicate) throw duplicateReference(duplicate, scope);
    }

    const next: Ticket = {
      ...current,
      titulo: input.titulo,
      descripcion: input.descripcion,
      actuacionSimple: input.actuacionSimple,
      prioridad,
      area,
      edificio,
      tipo,
      modulo,
      proveedor,
      referenciaExterna: input.referenciaExterna,
      fechaRecepcion: input.fechaRecepcion,
      fechaCierre: input.fechaCierre,
      fechaReabierto: input.fechaReabierto,
      solucionDescripcion: input.solucionDescripcion,
      notificado: input.notificado,
    };
    const diff = computeDiff(snapshotOf(current), snapshotOf(next));
    if (!diff) return current;

    return this.repository.update(
      current.id,
      input.updatedAt,
      {
        titulo: next.titulo,
        descripcion: next.descripcion,
        actuacionSimple: next.actuacionSimple,
        prioridadId: prioridad.id,
        areaId: area?.id ?? null,
        edificioId: edificio?.id ?? null,
        tipoId: tipo?.id ?? null,
        moduloId: modulo?.id ?? null,
        proveedorId: proveedor?.id ?? null,
        referenciaExterna: next.referenciaExterna,
        fechaRecepcion: next.fechaRecepcion,
        fechaCierre: next.fechaCierre,
        fechaReabierto: next.fechaReabierto,
        solucionDescripcion: next.solucionDescripcion,
        notificado: next.notificado,
      },
      actor.id,
      {
        entityType: ENTITY_TYPE,
        entityId: current.id,
        action: "update",
        actorId: actor.id,
        payload: { ...diff },
      },
    );
  }

  // "Referencia válida": un valor que el ticket ya tenía se acepta aunque hoy esté inactivo o
  // eliminado (si no, un área desactivada después impediría guardar cualquier cambio). Un valor
  // nuevo debe existir, no estar eliminado y estar activo.
  private async resolveReference(
    catalog: TicketCatalog,
    id: string,
    current: Ref | null,
    message: string,
  ): Promise<Ref> {
    if (current?.id === id) return current;
    const row = await this.repository.findCatalogItem(catalog, id);
    assertUsable(row, message);
    return { id: row.id, nombre: row.nombre };
  }

  private async resolveOptional(
    catalog: TicketCatalog,
    id: string | null,
    current: Ref | null,
    message: string,
  ): Promise<Ref | null> {
    return id === null ? null : this.resolveReference(catalog, id, current, message);
  }
}

const MESSAGES = {
  prioridad: "La prioridad no existe o está desactivada",
  area: "El área no existe o está desactivada",
  edificio: "El edificio no existe o está desactivado",
  tipo: "El tipo de ticket no existe o está desactivado",
  modulo: "El módulo no existe o está desactivado",
  proveedor: "El proveedor no existe o está desactivado",
} as const;

// Nombra el ticket existente solo si quien guarda puede verlo; si es de otro departamento, un agente
// no debe enterarse de que existe (coherente con el 404 de Feature 5.8).
function duplicateReference(
  existing: ReferenceMatch,
  scope: UserScope,
): ORPCError<string, unknown> {
  const canSee = scope.departmentId === null || scope.departmentId === existing.departamentoId;
  return new ORPCError("CONFLICT", {
    message: canSee
      ? `Esa referencia ya está cargada en el ticket ${formatTicketNumber(existing.numero)}`
      : "Esa referencia ya está cargada en otro ticket de ese proveedor",
  });
}
