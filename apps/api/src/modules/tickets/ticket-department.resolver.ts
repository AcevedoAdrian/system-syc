import { Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../common/authenticated-request";
import type { DepartmentResolver } from "../../common/department-reader";
import { TicketsRepository } from "./tickets.repository";

// Departamento de un ticket existente (id en la URL). `null` si no existe o está eliminado: el guard
// responde igual que para uno de otro departamento (404 en los endpoints de tickets, Feature 5.8).
//
// oRPC arma el input como `{ ...params, ...body }` (`...query` en los GET), así que un `ticketId` en el
// cuerpo o en la query pisaría al de la URL: el guard aprobaría el ticket propio y el handler operaría
// sobre el ajeno. El cliente legítimo nunca lo manda ahí (quita los parámetros de ruta del cuerpo), por
// eso cualquier `ticketId` que no sea el de la URL se rechaza con el mismo `null`.
@Injectable()
export class TicketDepartmentResolver implements DepartmentResolver {
  constructor(private readonly repository: TicketsRepository) {}

  resolve(request: AuthenticatedRequest): Promise<string | null> | null {
    const ticketId = request.params?.ticketId;
    if (!ticketId) return null;
    const override = [request.query, request.body].some((source) => {
      const sent = (source as { ticketId?: unknown } | undefined)?.ticketId;
      return sent !== undefined && sent !== ticketId;
    });
    return override ? null : this.repository.findDepartmentId(ticketId);
  }
}

// Un ticket de otro departamento y uno que no existe son indistinguibles para un agente: 404 en los dos
// casos (SPEC 05, Feature 5.8). El admin no pasa por el resolver; su 404 lo da el service. Lo usan los
// endpoints de un ticket existente: `tickets.*` y `comments.*`.
export const ownTicket = {
  departmentFrom: TicketDepartmentResolver,
  outOfScope: "not-found",
  notFoundMessage: "El ticket no existe",
} as const;

// Departamento del ticket que se va a crear: el que viene en el cuerpo. Un agente solo puede crear en
// el suyo; si manda otro, o ninguno, el guard responde 403 (un payload manipulado no revela nada).
@Injectable()
export class TicketCreateDepartmentResolver implements DepartmentResolver {
  resolve(request: AuthenticatedRequest): string | null {
    const body = request.body as { departamentoId?: unknown } | undefined;
    return typeof body?.departamentoId === "string" ? body.departamentoId : null;
  }
}
