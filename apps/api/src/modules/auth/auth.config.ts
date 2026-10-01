import { getPrismaClient } from "@syc/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, organization, username } from "better-auth/plugins";
import type { Env } from "../../config/env.schema";

const SESSION_EXPIRES_IN = 60 * 60 * 12; // 12 horas
const SESSION_UPDATE_AGE = 60 * 60; // se renueva con actividad si pasó más de 1 hora

export const LOGIN_PATH = "/sign-in/username";

// Raíz de composición de Better Auth: único archivo fuera de un `*.repository.ts` que importa `@syc/db`.
export function createAuth(env: Env) {
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
