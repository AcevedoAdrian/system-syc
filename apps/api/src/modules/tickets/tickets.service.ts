import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import {
  type AuditHistory,
  type ChangeTicketDepartmentInput,
  type ChangeTicketStatusInput,
  CLAVES_DE_CIERRE,
  type CreateTicketInput,
  formatTicketNumber,
  type ListTicketsInput,
  STALE_TICKET_MESSAGE,
  TICKETS_PAGE_SIZE,
  type Ticket,
  type TicketsPage,
  type UpdateTicketInput,
} from "@syc/contracts";
import type { AuthenticatedUser, UserScope } from "../../common/authenticated-request";
import { AuditService } from "../audit/audit.service";
import { computeDiff } from "../audit/audit-diff";
import { snapshotOf } from "./ticket-audit-snapshot";
import {
  type ReferenceMatch,
  type ReferenceRow,
  type TicketCatalog,
  type TicketStatusData,
  TicketsRepository,
} from "./tickets.repository";

const ENTITY_TYPE = "Ticket";

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
  constructor(
    private readonly repository: TicketsRepository,
    private readonly audit: AuditService,
  ) {}

  // El alcance es un filtro obligatorio: el agente ve su departamento y el admin todos. El filtro
  // `departamentoId` solo lo aplica el admin; si lo manda un agente se ignora, su alcance siempre gana.
  async list(actor: AuthenticatedUser, filters: ListTicketsInput): Promise<TicketsPage> {
    const { departmentId } = scopeOf(actor);
    const { items, total } = await this.repository.findPage(
      departmentId ?? filters.departamentoId ?? null,
      filters,
    );
    return { items, total, page: filters.page, pageSize: TICKETS_PAGE_SIZE };
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

  // Cambia el estado (Feature 5.4). Cualquier estado activo puede pasar a cualquier otro. Las fechas y la
  // solución que acepta la request dependen de la `clave` del estado destino: un estado de cierre pide
  // `fechaCierre`, `REABIERTO` pide `fechaReabierto`, y cualquier otro no admite ninguna. Lo que la
  // request no manda no se toca (al reabrir se conservan `fechaCierre` y la solución).
  async changeStatus(input: ChangeTicketStatusInput, actor: AuthenticatedUser): Promise<Ticket> {
    const current = await this.get(input.ticketId);
    if (!sameInstant(input.updatedAt, current.updatedAt)) {
      throw new ORPCError("CONFLICT", { message: STALE_TICKET_MESSAGE });
    }

    const destino = (await this.repository.findEstados()).find((e) => e.id === input.estadoId);
    if (!destino) throw new ORPCError("BAD_REQUEST", { message: "El estado no existe" });
    // Como en el resto de las referencias, el estado que el ticket ya tiene se acepta aunque se
    // haya desactivado después; uno nuevo debe estar activo.
    if (!destino.activo && destino.id !== current.estado.id) {
      throw new ORPCError("BAD_REQUEST", { message: "El estado está desactivado" });
    }

    const cierra = destino.clave !== null && CLAVES_DE_CIERRE.includes(destino.clave);
    const reabre = destino.clave === "REABIERTO";
    if (cierra && input.fechaCierre === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Para pasar a un estado de cierre hay que indicar la fecha de cierre",
      });
    }
    if (reabre && input.fechaReabierto === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Para reabrir el ticket hay que indicar la fecha de reapertura",
      });
    }
    if (!cierra && input.fechaCierre !== undefined) {
      throw new ORPCError("BAD_REQUEST", { message: "Este estado no admite fecha de cierre" });
    }
    if (!reabre && input.fechaReabierto !== undefined) {
      throw new ORPCError("BAD_REQUEST", { message: "Este estado no admite fecha de reapertura" });
    }
    if (!cierra && input.solucionDescripcion !== undefined) {
      throw new ORPCError("BAD_REQUEST", { message: "Este estado no admite una solución" });
    }

    const write: TicketStatusData = { estadoId: destino.id };
    if (cierra) {
      write.fechaCierre = input.fechaCierre;
      if (input.solucionDescripcion !== undefined) {
        write.solucionDescripcion = input.solucionDescripcion;
      }
    }
    if (reabre) write.fechaReabierto = input.fechaReabierto;

    const next: Ticket = {
      ...current,
      estado: { id: destino.id, nombre: destino.nombre, clave: destino.clave },
      fechaCierre: write.fechaCierre !== undefined ? write.fechaCierre : current.fechaCierre,
      fechaReabierto:
        write.fechaReabierto !== undefined ? write.fechaReabierto : current.fechaReabierto,
      solucionDescripcion:
        write.solucionDescripcion !== undefined
          ? write.solucionDescripcion
          : current.solucionDescripcion,
    };
    const diff = computeDiff(snapshotOf(current), snapshotOf(next));
    if (!diff) return current;

    return this.repository.changeStatus(current.id, input.updatedAt, write, actor.id, {
      entityType: ENTITY_TYPE,
      entityId: current.id,
      action: "update",
      actorId: actor.id,
      payload: { ...diff },
    });
  }

  // Solo el admin (el guard lo exige). Conserva número, historial y, desde SPEC 06, comentarios; desde
  // el cambio editan los agentes del departamento nuevo, que debe existir y estar activo.
  async changeDepartment(
    input: ChangeTicketDepartmentInput,
    actor: AuthenticatedUser,
  ): Promise<Ticket> {
    const current = await this.get(input.ticketId);
    if (!sameInstant(input.updatedAt, current.updatedAt)) {
      throw new ORPCError("CONFLICT", { message: STALE_TICKET_MESSAGE });
    }
    // El mismo departamento no cambia nada, ni siquiera si hoy está desactivado.
    if (input.departamentoId === current.departamento.id) return current;

    const destino = await this.repository.findDepartment(input.departamentoId);
    if (!destino) throw new ORPCError("BAD_REQUEST", { message: "El departamento no existe" });
    if (!destino.activo) {
      throw new ORPCError("CONFLICT", {
        message: "El departamento está desactivado: no puede recibir tickets",
      });
    }

    const next: Ticket = { ...current, departamento: { id: destino.id, nombre: destino.nombre } };
    const diff = computeDiff(snapshotOf(current), snapshotOf(next));
    if (!diff) return current;

    return this.repository.changeDepartment(current.id, input.updatedAt, destino.id, actor.id, {
      entityType: ENTITY_TYPE,
      entityId: current.id,
      action: "update",
      actorId: actor.id,
      payload: { ...diff },
    });
  }

  // Solo el admin (el guard lo exige), también sobre un ticket de su propio departamento. Eliminar
  // algo ya eliminado o inexistente es 404.
  async remove(ticketId: string, actor: AuthenticatedUser): Promise<void> {
    await this.get(ticketId);
    await this.repository.softDelete(ticketId, actor.id, {
      entityType: ENTITY_TYPE,
      entityId: ticketId,
      action: "delete",
      actorId: actor.id,
      payload: {},
    });
  }

  // Del más reciente al más antiguo. Sin chequear que el ticket exista: el de uno eliminado se sigue
  // leyendo (solo el admin llega acá, porque para un agente el guard ya responde 404), y un id sin
  // registros devuelve `[]`. No hay una tabla de historial propia: es `AuditLog`.
  async history(ticketId: string): Promise<AuditHistory> {
    return this.audit.history(ENTITY_TYPE, ticketId);
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
