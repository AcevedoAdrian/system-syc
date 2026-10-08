import { spawn } from "node:child_process";
import { ADMIN, BASE, cleanEnv, DATABASE_URL, DB_NAME, PG } from "./env.mjs";
import { OPTIONS } from "./options.mjs";
import { dim, fail, ROOT, run, tail } from "./util.mjs";

// Entorno compartido por los criterios que lo necesitan: base temporal + seed + API en producción.
// Lo levanta el runner (`setupInfra`) una sola vez y lo baja al terminar (`teardownInfra`).
export const state = {
  built: false,
  dbCreated: false,
  startedPostgres: false,
  seed: null, // { bare, runs }: resultado del seed sin variables y de dos corridas con ellas
  api: null,
  apiExit: undefined,
  apiLog: "",
};

// Limpiezas extra que `teardownInfra` corre al terminar (un SPEC que levanta su propio entorno, como el
// 07 con docker-compose.prod.yml, la registra al cargarse; tiene que ser un no-op si no se usó).
const cleanups = [];
export const registerCleanup = (fn) => cleanups.push(fn);

export function ensureBuilt() {
  if (state.built) return;
  for (const [label, args] of [
    ["prisma generate", ["--filter", "@syc/db", "generate"]],
    ["build de la API", ["--filter", "@syc/api", "build"]],
  ]) {
    const result = run("pnpm", args);
    if (result.status !== 0) fail(`falló ${label}:\n${tail(result.output)}`);
  }
  state.built = true;
}

// SQL contra la base temporal, vía `psql` dentro del contenedor (no hace falta psql local).
export function sql(query, database = DB_NAME) {
  const result = run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    PG.user,
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-tAF",
    "|",
    "-c",
    query,
  ]);
  if (result.status !== 0) fail(`SQL falló: ${query}\n${tail(result.output)}`);
  const out = result.stdout.trim();
  return out === "" ? [] : out.split("\n").map((row) => row.split("|"));
}

export const scalar = (query) => sql(query)[0]?.[0];

// El rate limit del login (5/min) es de toda la IP: se limpia antes de cada login de los fixtures.
export const resetRateLimit = () => sql(`DELETE FROM "rateLimit"`);

export async function setupInfra() {
  ensureBuilt();

  const wasRunning = run("docker", [
    "compose",
    "ps",
    "--status",
    "running",
    "-q",
    "postgres",
  ]).stdout.trim();
  const up = run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
  if (up.status !== 0) fail(`no pude levantar postgres con docker compose:\n${tail(up.output)}`);
  state.startedPostgres = !wasRunning;

  sql(`CREATE DATABASE "${DB_NAME}"`, "postgres");
  state.dbCreated = true;

  const migrate = run("pnpm", ["--filter", "@syc/db", "exec", "prisma", "migrate", "deploy"], {
    env: cleanEnv(),
  });
  if (migrate.status !== 0) fail(`prisma migrate deploy falló:\n${tail(migrate.output)}`);

  // Sin SEED_ADMIN_* el seed aborta nombrando las variables (antes de tocar la base).
  const seedBare = run(process.execPath, ["apps/api/dist/seed.mjs"], { env: cleanEnv() });
  state.seed = { bare: seedBare, runs: [] };

  // Dos corridas con las variables: debe quedar un solo admin y los departamentos del seed.
  const seedEnv = cleanEnv({
    SEED_ADMIN_USERNAME: ADMIN.username,
    SEED_ADMIN_PASSWORD: ADMIN.password,
    SEED_ADMIN_NAME: ADMIN.name,
  });
  for (let i = 0; i < 2; i++) {
    state.seed.runs.push(run(process.execPath, ["apps/api/dist/seed.mjs"], { env: seedEnv }));
  }

  // La API arranca sin SEED_ADMIN_* (cleanEnv las quita) y en producción.
  const child = spawn(process.execPath, ["apps/api/dist/main.mjs"], { cwd: ROOT, env: cleanEnv() });
  state.api = child;
  child.stdout.on("data", (d) => {
    state.apiLog += d;
  });
  child.stderr.on("data", (d) => {
    state.apiLog += d;
  });
  child.once("exit", (code) => {
    state.apiExit = code;
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (state.apiExit !== undefined) {
      fail(`la API terminó con código ${state.apiExit}:\n${tail(state.apiLog)}`);
    }
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fail(`la API no respondió /health a tiempo:\n${tail(state.apiLog)}`);
}

export async function teardownInfra() {
  for (const cleanup of cleanups.splice(0)) {
    try {
      await cleanup();
    } catch (error) {
      console.error(`Falló una limpieza: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (state.api && state.apiExit === undefined) {
    state.api.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
  }
  if (state.dbCreated) {
    if (OPTIONS.keepDb) {
      console.log(dim(`Base temporal conservada: ${DATABASE_URL}`));
    } else {
      run("docker", [
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        PG.user,
        "-d",
        "postgres",
        "-c",
        `DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`,
      ]);
    }
    state.dbCreated = false;
  }
  if (state.startedPostgres) {
    run("docker", ["compose", "stop", "postgres"]);
    state.startedPostgres = false;
  }
}
