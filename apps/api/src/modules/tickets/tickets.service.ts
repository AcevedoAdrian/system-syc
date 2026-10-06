import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import {
  type CreateTicketInput,
  formatTicketNumber,
  type Ticket,
  type TicketSummary,
} from "@syc/contracts";
import type { AuthenticatedUser, UserScope } from "../../common/authenticated-request";
import { snapshotOf } from "./ticket-audit-snapshot";
import {
  type ReferenceMatch,
  type ReferenceRow,
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

// "Referencia válida" de un valor nuevo: existe (no eliminado) y está activo.
function assertUsable(row: ReferenceRow | null, message: string): asserts row is ReferenceRow {
  if (!row?.activo) throw new ORPCError("BAD_REQUEST", { message });
}

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

    await this.assertCatalogUsable(
      "prioridad",
      input.prioridadId,
      "La prioridad no existe o está desactivada",
    );
    if (input.proveedorId) {
      await this.assertCatalogUsable(
        "proveedor",
        input.proveedorId,
        "El proveedor no existe o está desactivado",
      );
    }
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

  private async assertCatalogUsable(
    catalog: TicketCatalog,
    id: string,
    message: string,
  ): Promise<void> {
    assertUsable(await this.repository.findCatalogItem(catalog, id), message);
  }
}

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
