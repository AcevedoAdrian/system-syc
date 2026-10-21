import { Logger } from "@nestjs/common";
import type { ORPCModuleConfig } from "@orpc/nest";
import { ORPCError } from "@orpc/server";

const logger = new Logger("oRPC");

// oRPC convierte cualquier error que no sea un `ORPCError` en un 500 con el mensaje fijo «Internal server
// error», dentro de su propio handler: Nest nunca lo ve y su filtro de excepciones no lo registra. Este
// interceptor (global, en `ORPCModule.forRoot`) lo deja en el log con el error original, que el cliente
// nunca recibe. Los `ORPCError` (400, 404, 409 de negocio y los de validación) son esperables y no se loguean.
export const logUnexpectedErrors: NonNullable<ORPCModuleConfig["interceptors"]>[number] = async ({
  next,
}) => {
  try {
    return await next();
  } catch (error) {
    if (!(error instanceof ORPCError)) {
      logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    }
    throw error;
  }
};
