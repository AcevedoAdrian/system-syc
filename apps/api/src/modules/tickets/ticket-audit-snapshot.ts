import type { Ticket } from "@syc/contracts";
import type { AuditSnapshot } from "../audit/audit-diff";

type Ref = { id: string; nombre: string };

// Las referencias van como `{ id, nombre }`: el historial sigue legible aunque el ítem se renombre o
// se elimine después. La `clave` del estado no entra: es un detalle interno, no un dato del ticket.
function ref(value: Ref | null): AuditSnapshot[string] {
  return value ? { id: value.id, nombre: value.nombre } : null;
}

// Foto auditable (SPEC 03, SPEC 05 "Foto auditable"): solo estos campos entran en el diff. Las
// fechas van como "YYYY-MM-DD". Nunca `createdBy` ni `updatedBy` (son del `AuditLog`: `actorId`).
export function snapshotOf(ticket: Ticket): AuditSnapshot {
  return {
    numero: ticket.numero,
    titulo: ticket.titulo,
    descripcion: ticket.descripcion,
    actuacionSimple: ticket.actuacionSimple,
    referenciaExterna: ticket.referenciaExterna,
    solucionDescripcion: ticket.solucionDescripcion,
    notificado: ticket.notificado,
    fechaRecepcion: ticket.fechaRecepcion,
    fechaCierre: ticket.fechaCierre,
    fechaReabierto: ticket.fechaReabierto,
    departamento: ref(ticket.departamento),
    area: ref(ticket.area),
    edificio: ref(ticket.edificio),
    tipo: ref(ticket.tipo),
    prioridad: ref(ticket.prioridad),
    modulo: ref(ticket.modulo),
    estado: ref(ticket.estado),
    proveedor: ref(ticket.proveedor),
  };
}
