import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../../modules/auth/auth.config";
import { AUTH } from "../../modules/auth/auth.tokens";
import type { AuthenticatedRequest, UserRole } from "../authenticated-request";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

// Guard global con denegar por defecto: todo exige sesión salvo lo marcado con `@Public()`.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();

    const { user } = session;
    // Defensa adicional al cierre de sesiones del ban: una sesión que sobrevivió se rechaza igual.
    const isBanned = user.banned === true && (!user.banExpires || user.banExpires > new Date());
    if (isBanned) throw new UnauthorizedException();

    const role: UserRole = user.role === "admin" ? "admin" : "agente";
    request.currentUser = {
      id: user.id,
      username: user.username ?? "",
      name: user.name,
      email: user.email,
      role,
    };
    return true;
  }
}
