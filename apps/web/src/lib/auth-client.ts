import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { env } from "./env";

// Solo para login, logout y cambio de contraseña propio (la allowlist de la API). El ABM de usuarios
// y departamentos pasa por oRPC, nunca por los plugins `admin` u `organization` de Better Auth.
// Usa el origen de la API: Better Auth agrega `/api/auth`, que Nginx reenvía con la ruta intacta.
export const authClient = createAuthClient({
  baseURL: new URL(env.VITE_API_URL).origin,
  fetchOptions: { credentials: "include" },
  plugins: [usernameClient()],
});
