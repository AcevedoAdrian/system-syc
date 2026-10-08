import { z } from "zod";

const absoluteUrl = z.url();

// `VITE_API_URL` es una URL absoluta (desarrollo: `http://localhost:3000`) o una ruta que empieza con
// `/` (producción: `/api`, detrás de Nginx), que se resuelve contra el origen de la página: así la
// imagen de la web no depende de la IP del servidor. `null` si no es ninguna de las dos (`//host`
// tampoco: apuntaría a otro origen).
export function resolveApiUrl(value: string, origin: string): string | null {
  if (value.startsWith("/") && !value.startsWith("//")) return new URL(value, origin).href;
  return absoluteUrl.safeParse(value).success ? value : null;
}

const envSchema = z.object({
  VITE_API_URL: z.string().transform((value, ctx) => {
    const url = resolveApiUrl(value, window.location.origin);
    if (url === null) {
      ctx.addIssue({
        code: "custom",
        message: "debe ser una URL absoluta o una ruta que empiece con /",
      });
      return z.NEVER;
    }
    return url;
  }),
});

const result = envSchema.safeParse(import.meta.env);
if (!result.success) {
  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Variables de entorno inválidas: ${problems}`);
}

export const env = result.data;
