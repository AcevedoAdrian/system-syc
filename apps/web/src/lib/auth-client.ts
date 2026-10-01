import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { env } from "./env";

// Solo para login, logout y cambio de contraseña propio (la allowlist de la API). El ABM de usuarios
// y departamentos pasa por oRPC, nunca por los plugins `admin` u `organization` de Better Auth.
export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
  fetchOptions: { credentials: "include" },
  plugins: [usernameClient()],
});
