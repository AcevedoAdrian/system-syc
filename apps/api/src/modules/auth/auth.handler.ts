import type { IncomingMessage, ServerResponse } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { toNodeHandler } from "better-auth/node";
import type { Auth } from "./auth.config";

export const AUTH_BASE_PATH = "/api/auth";

// Allowlist de endpoints de Better Auth expuestos: login por usuario, logout, sesión actual y
// cambio de contraseña propio. Cualquier otro (admin/*, organization/*, sign-up/*) responde 404.
const ALLOWED_ENDPOINTS = new Set([
  "POST /sign-in/username",
  "POST /sign-out",
  "GET /get-session",
  "POST /change-password",
]);

export function isAllowedAuthRequest(method: string | undefined, path: string): boolean {
  const endpoint = path.slice(AUTH_BASE_PATH.length);
  return ALLOWED_ENDPOINTS.has(`${method?.toUpperCase()} ${endpoint}`);
}

function pathOf(url: string | undefined): string {
  return (url ?? "").split("?")[0] ?? "";
}

// Se monta antes de los body parsers de Nest: Better Auth lee el cuerpo del stream por su cuenta.
export function mountAuth(app: INestApplication, auth: Auth): void {
  const handler = toNodeHandler(auth);

  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = pathOf(req.url);
    if (path !== AUTH_BASE_PATH && !path.startsWith(`${AUTH_BASE_PATH}/`)) {
      next();
      return;
    }
    if (isAllowedAuthRequest(req.method, path)) {
      void handler(req, res);
      return;
    }
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "Not Found" }));
  });
}
