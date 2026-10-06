import { ORPCError } from "@orpc/client";

// Una sesión vencida o revocada llega como 401 (el cliente oRPC lo mapea por status).
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 401;
}

// El 404 de un ticket de otro departamento (o inexistente) lo responde el guard de la API como
// excepción de Nest, no como `ORPCError`: el cuerpo no trae el formato de oRPC, pero el status sí
// llega. Por eso se detecta por status y nunca por mensaje.
export function isNotFound(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 404;
}

// Otro usuario modificó el ticket (bloqueo optimista): la pantalla pide recargar.
export function isConflict(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 409;
}

const VALIDATION_MESSAGE = "Input validation failed";

// Mensaje para mostrar al usuario. Los 400, 404 y 409 de la API traen un mensaje en español pensado
// para la pantalla (por ejemplo "Ya existe un departamento con ese nombre"); el resto, uno genérico.
export function getErrorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.status === 403) return "No tenés permiso para realizar esta acción.";
    const isShowable =
      [400, 404, 409].includes(error.status) && error.message !== VALIDATION_MESSAGE;
    if (isShowable) return error.message;
  }
  return "No se pudo completar la operación. Intentá de nuevo.";
}
