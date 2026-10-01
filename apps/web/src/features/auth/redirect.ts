// Destino al que volver después de loguearse. Solo rutas internas: evita redirecciones abiertas
// (`//otro-sitio.com`, `https://...`) y el bucle hacia `/login`.
export function safeRedirectPath(value: string | undefined): string | undefined {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\"))
    return undefined;
  if (value === "/login" || value.startsWith("/login?")) return undefined;
  return value;
}
