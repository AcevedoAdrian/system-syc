import type { Ticket } from "@syc/contracts";

// Un ticket como lo devuelve `tickets.get`, para los tests de la pantalla: "Pendiente", en Técnico y
// sin nada asignado salvo lo obligatorio. Cada test pisa lo que prueba.
export function makeTicket(extra: Partial<Ticket> = {}): Ticket {
  return {
    id: "t-13",
    numero: 13,
    departamento: { id: "tec", nombre: "Técnico" },
    area: null,
    edificio: null,
    tipo: null,
    modulo: null,
    prioridad: { id: "alta", nombre: "Alta" },
    estado: { id: "pend", nombre: "Pendiente", clave: null },
    proveedor: null,
    titulo: "Impresora rota",
    descripcion: null,
    actuacionSimple: null,
    referenciaExterna: null,
    solucionDescripcion: null,
    notificado: false,
    fechaRecepcion: "2026-10-01",
    fechaCierre: null,
    fechaReabierto: null,
    creador: { id: "u1", nombre: "Ana" },
    editor: { id: "u1", nombre: "Ana" },
    createdAt: "2026-10-01T13:00:00.000Z",
    updatedAt: "2026-10-06T13:00:00.000Z",
    ...extra,
  };
}
