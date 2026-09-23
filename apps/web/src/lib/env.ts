import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.url(),
});

const result = envSchema.safeParse(import.meta.env);
if (!result.success) {
  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Variables de entorno inválidas: ${problems}`);
}

export const env = result.data;
