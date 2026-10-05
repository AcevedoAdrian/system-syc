// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: script fuera de turbo, sus variables no afectan el caché
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./util.mjs";

// Lee `.env` de la raíz solo para los POSTGRES_* (no se vuelca a process.env).
function readDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return vars;
}

const dotEnv = readDotEnv();

export const PORT = Number(process.env.VERIFY_PORT ?? 3917);
export const BASE = `http://localhost:${PORT}`;
export const WEB_ORIGIN = "http://localhost:5173";

// Admin raíz que crea el seed en la base temporal, y clave de los usuarios que crean los fixtures.
export const ADMIN = {
  username: "admin.verify",
  password: "clave-admin-verify-1",
  name: "Admin Verify",
};
export const AGENT_PASSWORD = "clave-agente-verify-1";

export const PG = {
  user: process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? dotEnv.POSTGRES_PASSWORD ?? "postgres",
  port: process.env.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? "5432",
};
export const DB_NAME = `syc_verify_${Date.now()}`;
export const DATABASE_URL = `postgresql://${PG.user}:${encodeURIComponent(PG.password)}@localhost:${PG.port}/${DB_NAME}`;

export function apiEnv(databaseUrl = DATABASE_URL) {
  return {
    NODE_ENV: "production",
    API_PORT: String(PORT),
    DATABASE_URL: databaseUrl,
    WEB_ORIGIN,
    BETTER_AUTH_SECRET: "verify-only-secret-0123456789abcdef-xyz",
    BETTER_AUTH_URL: BASE,
  };
}

// Entorno de la API y del seed: el del proceso sin ninguna SEED_* (la API no debe necesitarlas).
export function cleanEnv(extra = {}) {
  const env = { ...process.env, ...apiEnv() };
  for (const key of Object.keys(env)) if (key.startsWith("SEED_")) delete env[key];
  return { ...env, ...extra };
}
