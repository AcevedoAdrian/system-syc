import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { AuthenticatedRequest } from "../authenticated-request";

// Cabeceras de la request, para reenviar la sesión del admin a `auth.api.*` de Better Auth.
export const RequestHeaders = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Headers =>
    fromNodeHeaders(context.switchToHttp().getRequest<AuthenticatedRequest>().headers),
);
