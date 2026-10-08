import { getPrismaClient } from "@syc/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, isAPIError } from "better-auth/api";
import { admin, organization, username } from "better-auth/plugins";
import type { Env } from "../../config/env.schema";

const SESSION_EXPIRES_IN = 60 * 60 * 12; // 12 horas
const SESSION_UPDATE_AGE = 60 * 60; // se renueva con actividad si pasó más de 1 hora

export const LOGIN_PATH = "/sign-in/username";
const CHANGE_PASSWORD_PATH = "/change-password";

export interface AuthCallbacks {
  // Se llama cuando un usuario cambió su propia contraseña con éxito (SPEC 03: `change_password`).
  onPasswordChanged?: (userId: string) => Promise<void>;
}

// Id del usuario que cambió su contraseña, o `null` si la respuesta del endpoint no fue un éxito
// (un `APIError`, como una contraseña actual incorrecta, no se audita).
export function changedPasswordUserId(returned: unknown): string | null {
  if (!returned || typeof returned !== "object" || isAPIError(returned)) return null;
  const user = (returned as { user?: { id?: unknown } }).user;
  return typeof user?.id === "string" ? user.id : null;
}

// Raíz de composición de Better Auth: único archivo fuera de un `*.repository.ts` que importa `@syc/db`.
export function createAuth(env: Env, callbacks: AuthCallbacks = {}) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.WEB_ORIGIN],
    database: prismaAdapter(getPrismaClient(env.DATABASE_URL), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // solo entran usuarios creados por el admin (P6, Q2)
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
      cookieCache: { enabled: false }, // rol, departamento y ban se ven en la siguiente request
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        [LOGIN_PATH]: { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: false, // el despliegue es HTTP por IP, sin HTTPS (SPEC 07, Q37)
      // Nginx pisa `X-Real-IP` con la IP del cliente: el rate limit del login cuenta por persona.
      // Sin el header (desarrollo sin proxy) vuelve al contador compartido por ruta.
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    hooks: {
      // Al cambiar la propia contraseña se cierran siempre las otras sesiones, sin depender del cliente.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== CHANGE_PASSWORD_PATH) return;
        return { context: { ...ctx, body: { ...ctx.body, revokeOtherSessions: true } } };
      }),
      // Audita el cambio de la propia contraseña, el único evento de `account` que entra en `AuditLog`.
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== CHANGE_PASSWORD_PATH) return;
        const userId = changedPasswordUserId(ctx.context.returned);
        if (userId) await callbacks.onPasswordChanged?.(userId);
      }),
    },
    plugins: [
      username(),
      admin({ defaultRole: "agente", adminRoles: ["admin"] }),
      organization({
        allowUserToCreateOrganization: false,
        schema: {
          organization: {
            additionalFields: {
              activo: { type: "boolean", required: true, defaultValue: true },
            },
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
