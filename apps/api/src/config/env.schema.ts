import { z } from "zod";

// Los secretos de ejemplo del repo (`.env.example` y `docker-compose.yml`) empiezan así: son públicos.
const DEV_SECRET_PREFIX = "dev-only-";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    API_PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.url(),
    WEB_ORIGIN: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(), // URL pública de la API; baseURL de Better Auth
  })
  .superRefine((env, ctx) => {
    // Copiar `.env.example` a producción arrancaría con un secreto conocido: las sesiones se firmarían
    // con algo que cualquiera puede leer en el repo.
    if (env.NODE_ENV === "production" && env.BETTER_AUTH_SECRET.startsWith(DEV_SECRET_PREFIX)) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message:
          "es el secreto de ejemplo del repo; en producción generá uno propio (openssl rand -base64 32)",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Variables de entorno inválidas:\n${problems}`);
  }
  return result.data;
}
