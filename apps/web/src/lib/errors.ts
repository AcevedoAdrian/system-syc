import { ORPCError } from "@orpc/client";

// Una sesión vencida o revocada llega como 401 (el cliente oRPC lo mapea por status).
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 401;
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
