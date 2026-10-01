import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "../authenticated-request";

// Usuario de la sesión, cargado por el `AuthGuard`. Solo se usa en endpoints que no son `@Public()`.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().currentUser;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
