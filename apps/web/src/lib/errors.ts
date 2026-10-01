import { ORPCError } from "@orpc/client";

// Una sesión vencida o revocada llega como 401 (el cliente oRPC lo mapea por status).
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ORPCError && error.status === 401;
}
