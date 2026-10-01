import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.url(),
  WEB_ORIGIN: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(), // URL pública de la API; baseURL de Better Auth
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
