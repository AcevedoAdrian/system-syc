// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: script fuera de turbo, sus variables no afectan el caché
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "../lib/client.mjs";
import { ADMIN } from "../lib/env.mjs";
import { registerCleanup } from "../lib/infra.mjs";
import { OPTIONS } from "../lib/options.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, dim, ROOT, red, run, tail } from "../lib/util.mjs";

// SPEC 07: a diferencia de los otros SPEC, no usa la API de desarrollo ni la base temporal de
// `lib/infra.mjs`: levanta `docker-compose.prod.yml` entero con un proyecto propio (`-p syc-verify-07`),
// un puerto alternativo, una carpeta de backups temporal y secretos de prueba. Lo baja (`down -v`) y borra
// lo que creó al terminar, en la limpieza que `teardownInfra` corre (`registerCleanup`). No toca el
// compose de desarrollo, ni su base, ni ningún `BACKUP_DIR` real.

const PROJECT = "syc-verify-07";
const HTTP_PORT = Number(process.env.VERIFY_HTTP_PORT ?? 18087);
const PUBLIC_URL = `http://localhost:${HTTP_PORT}`;
const PG_USER = "postgres";
const PG_DB = "syc";
const PG_PASSWORD = "verify07pg0123456789";
const AUTH_SECRET = "verify-07-secret-0123456789abcdef-xyz";
const REQUIRED = ["PUBLIC_URL", "POSTGRES_PASSWORD", "BETTER_AUTH_SECRET"];
// Variables que el compose lee: se sacan del entorno del proceso para que solo valga el `--env-file`.
const STACK_VARS = [
  ...REQUIRED,
  "POSTGRES_USER",
  "POSTGRES_DB",
  "HTTP_PORT",
  "BACKUP_DIR",
  "SEED_ADMIN_USERNAME",
  "SEED_ADMIN_PASSWORD",
  "SEED_ADMIN_NAME",
  "COMPOSE_PROJECT_NAME",
  "COMPOSE_FILE",
];
const DUMP = /^syc-\d{8}-\d{6}\.dump$/;
const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

// --- Archivos temporales -------------------------------------------------------------------------

let tmp = null;
const tmpDir = () => {
  tmp ??= mkdtempSync(path.join(os.tmpdir(), "syc-verify-07-"));
  return tmp;
};
const backupDir = () => {
  const dir = path.join(tmpDir(), "backups");
  mkdirSync(dir, { recursive: true });
  return dir;
};

function envFile({ omit = [], name = "stack.env" } = {}) {
  const vars = {
    PUBLIC_URL,
    POSTGRES_USER: PG_USER,
    POSTGRES_PASSWORD: PG_PASSWORD,
    POSTGRES_DB: PG_DB,
    BETTER_AUTH_SECRET: AUTH_SECRET,
    HTTP_PORT: String(HTTP_PORT),
    BACKUP_DIR: backupDir(),
    SEED_ADMIN_USERNAME: ADMIN.username,
    SEED_ADMIN_PASSWORD: ADMIN.password,
    SEED_ADMIN_NAME: ADMIN.name,
  };
  const file = path.join(tmpDir(), name);
  const text = Object.entries(vars)
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(file, `${text}\n`);
  return file;
}

// --- docker y docker compose ---------------------------------------------------------------------

function composeEnv() {
  const env = { ...process.env };
  for (const key of STACK_VARS) delete env[key];
  return env;
}

// `docker compose` del proyecto de la verificación. Por defecto con todas las variables.
function compose(args, { file } = {}) {
  return run(
    "docker",
    [
      "compose",
      "-p",
      PROJECT,
      "-f",
      "docker-compose.prod.yml",
      "--env-file",
      file ?? envFile(),
      ...args,
    ],
    { env: composeEnv() },
  );
}

const docker = (...args) => run("docker", args);

function mustRun(result, label) {
  assert(
    result.status === 0,
    `${label} terminó con código ${result.status}:\n${tail(result.output, 40)}`,
  );
  return result;
}

const containerOf = (service) => compose(["ps", "-aq", service]).stdout.trim();

function services() {
  const result = mustRun(compose(["ps", "-a", "--format", "json"]), "docker compose ps");
  const text = result.stdout.trim();
  const rows = text.startsWith("[")
    ? JSON.parse(text)
    : text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  return Object.fromEntries(rows.map((row) => [row.Service, row]));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(what, check, { timeoutMs = 90_000, intervalMs = 1_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result === true) return;
      last = String(result);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }
  assert(false, `${what}: no ocurrió a tiempo (${last})`);
}

// --- El stack ------------------------------------------------------------------------------------

let stack = null; // { error } si el primer intento falló: los demás criterios fallan con el mismo error
const builtTags = new Set();

// `up -d --build` desde cero y el seed. Los criterios que necesitan el stack lo piden con esto.
async function ensureStack() {
  if (stack?.error) throw stack.error;
  if (stack) return;
  stack = {};
  try {
    // Un resto de una corrida cancelada no puede contaminar el "desde cero".
    compose(["down", "-v", "--remove-orphans"]);
    mustRun(compose(["up", "-d", "--build"]), "docker compose up -d --build");
    mustRun(compose(["run", "--rm", "-T", "api", "node", "dist/seed.mjs"]), "el seed");
  } catch (error) {
    stack.error = error;
    throw error;
  }
}

const newClient = () => new Client({ base: PUBLIC_URL, origin: PUBLIC_URL });

// El rate limit del login (5/min por IP) vive en la base del stack: se limpia antes de cada login.
function resetRateLimit() {
  mustRun(
    compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      PG_USER,
      "-d",
      PG_DB,
      "-c",
      'DELETE FROM "rateLimit"',
    ]),
    "limpiar el rate limit",
  );
}

async function adminSession() {
  resetRateLimit();
  const client = newClient();
  assertStatus(
    await client.post("/api/auth/sign-in/username", {
      username: ADMIN.username,
      password: ADMIN.password,
    }),
    200,
    "login del admin por Nginx",
  );
  return client;
}

const failedLogin = (realIp) =>
  fetch(`${PUBLIC_URL}/api/auth/sign-in/username`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: PUBLIC_URL,
      ...(realIp ? { "X-Real-IP": realIp } : {}),
    },
    body: JSON.stringify({ username: "no.existe", password: "incorrecta-123" }),
  });

async function waitForHealth() {
  await waitFor("GET /api/health por Nginx", async () => {
    const res = await fetch(`${PUBLIC_URL}/api/health`);
    const body = await res.json().catch(() => ({}));
    return body.status === "ok" || `${res.status} ${JSON.stringify(body)}`;
  });
}

async function newTicket(client, titulo) {
  const departamentos = await client.get("/api/organizations");
  assertStatus(departamentos, 200, "organizations.list");
  const tecnico = departamentos.body.find((d) => d.nombre === "Técnico");
  assert(tecnico, "no existe el departamento «Técnico» (¿corrió el seed?)");
  const prioridades = await client.get("/api/catalogs/prioridades");
  assertStatus(prioridades, 200, "catalogs.prioridades.list");
  const prioridad = prioridades.body.find((p) => p.activo);
  assert(prioridad, "no hay ninguna prioridad activa (¿corrió el seed?)");
  const res = await client.post("/api/tickets", {
    departamentoId: tecnico.id,
    titulo,
    prioridadId: prioridad.id,
    fechaRecepcion: "2020-01-01",
  });
  assertStatus(res, 200, "crear ticket");
  return res.body;
}

async function ticketIds(client) {
  const res = await client.get("/api/tickets");
  assertStatus(res, 200, "tickets.list");
  return res.body.items.map((t) => t.id);
}

// --- Backups -------------------------------------------------------------------------------------

const backupFiles = () => readdirSync(backupDir()).sort();
const dumps = () => backupFiles().filter((f) => /^syc-.*\.dump$/.test(f));

function clearBackups() {
  mustRun(
    compose(["exec", "-T", "backup", "sh", "-c", "rm -f /backups/* /backups/.[!.]*; true"]),
    "vaciar /backups",
  );
}

const runBackup = (extra = []) => compose(["exec", "-T", ...extra, "backup", "backup.sh"]);

// Corre un backup y devuelve el nombre de la copia que creó. El nombre lleva segundos: si hubo otro
// backup en el mismo segundo, el nuevo lo pisaría y no habría copia "nueva" que devolver.
async function freshBackup() {
  await sleep(1_100);
  const known = new Set(backupFiles());
  mustRun(runBackup(), "backup.sh");
  const copy = backupFiles().find((f) => DUMP.test(f) && !known.has(f));
  assert(copy, "backup.sh no creó una copia nueva");
  return copy;
}

// --- Imágenes ------------------------------------------------------------------------------------

const BUILDS = {
  migrate: ["-f", "apps/api/Dockerfile", "--target", "migrate"],
  api: ["-f", "apps/api/Dockerfile", "--target", "api"],
  web: ["-f", "apps/web/Dockerfile"],
};

function build(name) {
  const tag = `${PROJECT}-check-${name}`;
  if (!builtTags.has(tag)) {
    builtTags.add(tag);
    const result = docker("build", ...BUILDS[name], "-t", tag, ".");
    mustRun(result, `docker build de ${name}`);
  }
  return tag;
}

// --- Limpieza ------------------------------------------------------------------------------------

function leftovers() {
  const label = `label=com.docker.compose.project=${PROJECT}`;
  const found = [];
  for (const [what, args] of [
    ["contenedores", ["ps", "-a", "-q", "--filter", label]],
    ["volúmenes", ["volume", "ls", "-q", "--filter", label]],
    ["redes", ["network", "ls", "-q", "--filter", label]],
    ["imágenes", ["images", "-q", "--filter", `reference=${PROJECT}*`]],
  ]) {
    const out = docker(...args).stdout.trim();
    if (out) found.push(`${what}: ${out.split("\n").length}`);
  }
  if (tmp) found.push(`carpeta ${tmp}`);
  return found;
}

registerCleanup(() => {
  if (!stack && builtTags.size === 0 && !tmp) return; // este SPEC no corrió
  if (OPTIONS.keepDb) {
    console.log(
      dim(
        `Stack del SPEC 07 conservado: docker compose -p ${PROJECT} -f docker-compose.prod.yml ps`,
      ),
    );
    return;
  }
  if (stack) {
    compose(["down", "-v", "--rmi", "local", "--remove-orphans"]);
    stack = null;
  }
  for (const tag of builtTags) docker("rmi", "-f", tag);
  builtTags.clear();
  if (tmp) {
    // Las copias las escribe `root` desde el contenedor: se borran con un contenedor.
    if (readdirSync(tmp).includes("backups") && readdirSync(path.join(tmp, "backups")).length > 0) {
      docker(
        "run",
        "--rm",
        "--entrypoint",
        "sh",
        "-v",
        `${path.join(tmp, "backups")}:/backups`,
        "postgres:17-alpine",
        "-c",
        "rm -rf /backups/* /backups/.[!.]*",
      );
    }
    rmSync(tmp, { recursive: true, force: true });
    tmp = null;
  }
  const left = leftovers();
  if (left.length > 0) console.log(red(`Quedaron restos del SPEC 07: ${left.join(", ")}`));
});

// --- Criterios -----------------------------------------------------------------------------------

export default defineSpec({
  id: "07",
  title: "Endurecimiento y despliegue",
  criteria: [
    criterion(
      1,
      "Construir los targets `migrate` y `api` de `apps/api/Dockerfile`, y `apps/web/Dockerfile`, termina con código 0",
      async () => {
        for (const name of Object.keys(BUILDS)) build(name);
      },
    ),

    criterion(
      2,
      "Ningún asset de la imagen de la web contiene `localhost:3000`, aunque el `.env` de la raíz lo defina",
      async () => {
        const tag = build("web");
        const found = docker(
          "run",
          "--rm",
          "--entrypoint",
          "sh",
          tag,
          "-c",
          "grep -rl 'localhost:3000' /usr/share/nginx/html || true",
        );
        mustRun(found, "buscar localhost:3000 en la imagen");
        assert(found.stdout.trim() === "", `hay assets con localhost:3000:\n${found.stdout}`);

        // El `.env` de la raíz no entra al build: se prueba el `.dockerignore` real con un contexto de
        // mentira (sin tocar el `.env` verdadero del repo).
        const ctx = path.join(tmpDir(), "contexto");
        mkdirSync(path.join(ctx, "apps/web"), { recursive: true });
        writeFileSync(
          path.join(ctx, ".dockerignore"),
          readFileSync(path.join(ROOT, ".dockerignore"), "utf8"),
        );
        for (const file of [
          ".env",
          ".env.local",
          ".env.production",
          "apps/web/.env",
          "apps/web/.env.local",
          ".env.example",
          ".env.production.example",
        ]) {
          writeFileSync(path.join(ctx, file), "VITE_API_URL=http://localhost:3000\n");
        }
        writeFileSync(
          path.join(ctx, "Dockerfile"),
          "FROM nginx:1.28-alpine\nCOPY . /ctx\nRUN find /ctx -name '.env*' | sort > /found.txt\n",
        );
        const ctxTag = `${PROJECT}-check-contexto`;
        builtTags.add(ctxTag);
        mustRun(docker("build", "-t", ctxTag, ctx), "build del contexto de prueba");
        const copied = docker("run", "--rm", "--entrypoint", "cat", ctxTag, "/found.txt");
        mustRun(copied, "leer los .env que entraron al contexto");
        assert(
          copied.stdout.trim() === "/ctx/.env.example\n/ctx/.env.production.example",
          `al build entran archivos .env que no deberían:\n${copied.stdout}`,
        );
      },
    ),

    criterion(
      3,
      "`docker compose -f docker-compose.prod.yml config` sin `PUBLIC_URL`, sin `POSTGRES_PASSWORD` o sin `BETTER_AUTH_SECRET` falla nombrando la variable",
      async () => {
        mustRun(compose(["config", "-q"]), "config con todas las variables");
        for (const name of REQUIRED) {
          const result = compose(["config", "-q"], {
            file: envFile({ omit: [name], name: `sin-${name}.env` }),
          });
          assert(result.status !== 0, `config sin ${name} debería fallar y terminó con 0`);
          assert(
            result.output.includes(name),
            `config sin ${name} no nombra la variable:\n${tail(result.output, 10)}`,
          );
        }
      },
    ),

    criterion(
      4,
      "`up -d --build` desde cero deja `migrate` terminado con 0, y `postgres`, `api`, `web` y `backup` corriendo, con `api` sana",
      async () => {
        await ensureStack();
        const all = services();
        assert(all.migrate, "no existe el servicio migrate");
        assert(
          all.migrate.State === "exited" && all.migrate.ExitCode === 0,
          `migrate: ${all.migrate.State}, código ${all.migrate.ExitCode}`,
        );
        for (const name of ["postgres", "api", "web", "backup"]) {
          assert(all[name]?.State === "running", `${name}: ${all[name]?.State ?? "no existe"}`);
        }
        assert(all.api.Health === "healthy", `api: ${all.api.Health || "sin healthcheck"}`);
      },
    ),

    criterion(
      5,
      "Solo `web` publica un puerto. `postgres` y `api` no publican ninguno",
      async () => {
        await ensureStack();
        for (const name of ["postgres", "migrate", "api", "web", "backup"]) {
          const inspected = docker(
            "inspect",
            "-f",
            "{{json .NetworkSettings.Ports}}",
            containerOf(name),
          );
          mustRun(inspected, `inspect de ${name}`);
          const ports = JSON.parse(inspected.stdout.trim() || "{}");
          const published = Object.entries(ports).filter(([, bindings]) => bindings?.length > 0);
          if (name === "web") {
            assert(
              published.length === 1 &&
                published[0][0] === "80/tcp" &&
                published[0][1][0].HostPort === String(HTTP_PORT),
              `web debería publicar solo 80 → ${HTTP_PORT} y publica ${JSON.stringify(published)}`,
            );
          } else {
            assert(published.length === 0, `${name} publica puertos: ${JSON.stringify(published)}`);
          }
        }
      },
    ),

    criterion(
      6,
      "Todos los servicios tienen `json-file` con `max-size` y `max-file` en el `config` resuelto",
      async () => {
        const config = JSON.parse(
          mustRun(compose(["config", "--format", "json"]), "docker compose config").stdout,
        );
        for (const name of ["postgres", "migrate", "api", "web", "backup"]) {
          const logging = config.services[name]?.logging;
          assert(logging?.driver === "json-file", `${name}: driver ${logging?.driver}`);
          assert(
            logging.options?.["max-size"] && logging.options?.["max-file"],
            `${name}: faltan max-size o max-file (${JSON.stringify(logging.options)})`,
          );
        }
      },
    ),

    criterion(
      7,
      'Por Nginx, `GET /api/health` responde `status: "ok"`. El admin entra por `/api/auth/sign-in/username`, y con esa cookie `GET /api/tickets` responde 200',
      async () => {
        await ensureStack();
        const health = await fetch(`${PUBLIC_URL}/api/health`);
        assertStatus({ status: health.status, text: "" }, 200, "GET /api/health");
        assert((await health.json()).status === "ok", "GET /api/health no responde status: ok");
        const admin = await adminSession();
        assertStatus(
          await admin.get("/api/tickets"),
          200,
          "GET /api/tickets con la sesión del admin",
        );
      },
    ),

    criterion(
      8,
      "`GET /tickets/cualquier-cosa` responde 200 con `index.html`, y `POST /api/auth/sign-up/email` responde 404",
      async () => {
        await ensureStack();
        const home = await (await fetch(`${PUBLIC_URL}/`)).text();
        assert(home.includes('id="root"'), "GET / no devuelve la SPA (falta #root)");
        const deep = await fetch(`${PUBLIC_URL}/tickets/cualquier-cosa`);
        assert(deep.status === 200, `GET /tickets/cualquier-cosa respondió ${deep.status}`);
        assert((await deep.text()) === home, "GET /tickets/cualquier-cosa no devuelve index.html");
        const signUp = await fetch(`${PUBLIC_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: PUBLIC_URL },
          body: JSON.stringify({ email: "x@y.z", password: "12345678", name: "x" }),
        });
        assert(signUp.status === 404, `POST /api/auth/sign-up/email respondió ${signUp.status}`);
      },
    ),

    criterion(
      9,
      "Las respuestas de Nginx traen `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`, y el header `Server` no muestra la versión",
      async () => {
        await ensureStack();
        for (const url of ["/", "/tickets/x", "/api/health", "/api/tickets"]) {
          const res = await fetch(`${PUBLIC_URL}${url}`);
          for (const [header, expected] of Object.entries(SECURITY_HEADERS)) {
            assert(
              res.headers.get(header) === expected,
              `${url}: ${header} = ${res.headers.get(header)} (se esperaba ${expected})`,
            );
          }
          const server = res.headers.get("server") ?? "";
          assert(
            /^nginx$/i.test(server),
            `${url}: Server = "${server}" (no debe llevar la versión)`,
          );
        }
      },
    ),

    criterion(
      10,
      "Por Nginx, el sexto login fallido en un minuto responde 429, también mandando otro `X-Real-IP`",
      async () => {
        await ensureStack();
        resetRateLimit();
        for (let i = 1; i <= 5; i++) {
          const res = await failedLogin(`10.9.9.${i}`);
          assert(res.status === 401, `login fallido ${i}: se esperaba 401 y llegó ${res.status}`);
        }
        const sixth = await failedLogin("10.9.9.99");
        assert(
          sixth.status === 429,
          `el sexto login fallido respondió ${sixth.status} y debía ser 429`,
        );
        resetRateLimit();
      },
    ),

    criterion(
      11,
      "Contra la API directa, el sexto login fallido con `X-Real-IP: 10.0.0.1` responde 429, y uno con `X-Real-IP: 10.0.0.2` responde 401",
      async () => {
        await ensureStack();
        resetRateLimit();
        // La API no publica puertos: el pedido sale desde dentro del contenedor, sin pasar por Nginx.
        const script = `
          const attempt = async (ip) => (await fetch("http://127.0.0.1:3000/api/auth/sign-in/username", {
            method: "POST",
            headers: { "content-type": "application/json", origin: process.env.WEB_ORIGIN, "x-real-ip": ip },
            body: JSON.stringify({ username: "no.existe", password: "incorrecta-123" }),
          })).status;
          (async () => {
            const statuses = [];
            for (let i = 0; i < 6; i++) statuses.push(await attempt("10.0.0.1"));
            statuses.push(await attempt("10.0.0.2"));
            console.log(JSON.stringify(statuses));
          })();
        `;
        const result = mustRun(
          compose(["exec", "-T", "api", "node", "-e", script]),
          "pedidos directos a la API",
        );
        const statuses = JSON.parse(result.stdout.trim().split("\n").pop());
        assert(
          JSON.stringify(statuses) === JSON.stringify([401, 401, 401, 401, 401, 429, 401]),
          `se esperaba [401×5, 429, 401] y llegó ${JSON.stringify(statuses)}`,
        );
        resetRateLimit();
      },
    ),

    criterion(
      12,
      "Después de recrear solo `api` (`up -d --force-recreate api`), `GET /api/health` por Nginx sigue respondiendo `ok` sin reiniciar `web`",
      async () => {
        await ensureStack();
        const webId = containerOf("web");
        const started = () =>
          mustRun(
            docker("inspect", "-f", "{{.State.StartedAt}} {{.RestartCount}}", webId),
            "inspect de web",
          ).stdout.trim();
        const before = started();
        const apiBefore = containerOf("api");
        mustRun(compose(["up", "-d", "--force-recreate", "api"]), "up -d --force-recreate api");
        assert(containerOf("api") !== apiBefore, "api no se recreó");
        await waitForHealth();
        assert(started() === before, `web se reinició (antes: ${before}, ahora: ${started()})`);
      },
    ),

    criterion(
      13,
      "`backup.sh` a mano crea un `syc-AAAAMMDD-HHMMSS.dump` en `BACKUP_DIR`. Con 30 copias viejas y un archivo ajeno en la carpeta, otra corrida deja exactamente 30, borra la más vieja y no toca el ajeno",
      async () => {
        await ensureStack();
        clearBackups();
        mustRun(runBackup(), "backup.sh");
        const first = backupFiles();
        assert(
          first.length === 1 && DUMP.test(first[0]),
          `se esperaba un solo syc-AAAAMMDD-HHMMSS.dump y hay: ${first.join(", ") || "nada"}`,
        );
        assert(statSync(path.join(backupDir(), first[0])).size > 0, "la copia está vacía");

        // 29 copias viejas + la de recién = 30, y un archivo que no es una copia.
        mustRun(
          compose([
            "exec",
            "-T",
            "backup",
            "sh",
            "-c",
            "for i in $(seq -w 1 29); do echo x > /backups/syc-20200101-0000$i.dump; done; echo ajeno > /backups/ajeno.txt",
          ]),
          "crear las copias viejas",
        );
        assert(
          dumps().length === 30,
          `antes de la rotación debía haber 30 copias y hay ${dumps().length}`,
        );
        await sleep(1_100); // el nombre lleva segundos: una corrida en el mismo segundo pisaría la anterior
        mustRun(runBackup(), "backup.sh (rotación)");
        const after = backupFiles();
        assert(
          dumps().length === 30,
          `después de rotar debía haber 30 copias y hay ${dumps().length}`,
        );
        assert(!after.includes("syc-20200101-000001.dump"), "no borró la copia más vieja");
        assert(after.includes("ajeno.txt"), "borró el archivo ajeno");
        assert(!after.some((f) => f.endsWith(".partial")), "quedó un .partial");
      },
    ),

    criterion(
      14,
      "Con la contraseña de Postgres incorrecta, `backup.sh` termina con código distinto de 0, escribe `ERROR` en el log y no deja copia nueva ni `.partial`. Las copias anteriores siguen todas",
      async () => {
        await ensureStack();
        if (dumps().length === 0) mustRun(runBackup(), "backup.sh");
        const before = backupFiles();
        const result = runBackup(["-e", "POSTGRES_PASSWORD=incorrecta"]);
        assert(result.status !== 0, "backup.sh con la contraseña incorrecta terminó con 0");
        assert(
          result.output.includes("ERROR"),
          `la salida no dice ERROR:\n${tail(result.output, 5)}`,
        );
        const logs = compose(["logs", "--no-log-prefix", "--tail", "20", "backup"]).stdout;
        assert(
          /backup ERROR/.test(logs),
          `el log del contenedor no tiene la línea ERROR:\n${tail(logs, 5)}`,
        );
        assert(
          JSON.stringify(backupFiles()) === JSON.stringify(before),
          `la carpeta cambió:\nantes: ${before.length} archivos\nahora: ${backupFiles().length} archivos`,
        );
      },
    ),

    criterion(
      15,
      "El contenedor `backup` tiene la tarea `0 2 * * *`, y `date` adentro muestra la hora de Argentina (-03)",
      async () => {
        await ensureStack();
        const cron = mustRun(
          compose(["exec", "-T", "backup", "crontab", "-l"]),
          "crontab -l",
        ).stdout;
        assert(
          /^0 2 \* \* \* \S*backup\.sh/m.test(cron),
          `crontab sin la tarea 0 2 * * *:\n${cron}`,
        );
        const offset = mustRun(
          compose(["exec", "-T", "backup", "date", "+%z"]),
          "date",
        ).stdout.trim();
        assert(offset === "-0300", `date +%z = ${offset} (se esperaba -0300)`);
      },
    ),

    criterion(
      16,
      "Restauración: se crea el ticket T1, se corre un backup y después se crea T2; se detiene `api`, se corre `restore.sh --confirmar` con esa copia y se levanta `api`; el admin entra, ve T1 y no ve T2",
      async () => {
        await ensureStack();
        let admin = await adminSession();
        const t1 = await newTicket(admin, "T1 antes del backup");
        const copy = await freshBackup();
        const t2 = await newTicket(admin, "T2 después del backup");

        mustRun(compose(["stop", "api"]), "detener api");
        mustRun(
          compose(["exec", "-T", "backup", "restore.sh", "--confirmar", copy]),
          "restore.sh --confirmar",
        );
        mustRun(compose(["start", "api"]), "levantar api");
        await waitForHealth();

        admin = await adminSession();
        const ids = await ticketIds(admin);
        assert(ids.includes(t1.id), "el admin no ve T1 después de restaurar");
        assert(!ids.includes(t2.id), "el admin ve T2 después de restaurar (debía desaparecer)");
      },
    ),

    criterion(
      17,
      "`restore.sh` sin `--confirmar`, o con `api` corriendo, se niega y no toca la base",
      async () => {
        await ensureStack();
        await waitForHealth();
        const copy = await freshBackup();

        const admin = await adminSession();
        const t3 = await newTicket(admin, "T3 después del backup");

        const sinConfirmar = compose(["exec", "-T", "backup", "restore.sh", copy]);
        assert(sinConfirmar.status !== 0, "restore.sh sin --confirmar terminó con 0");
        assert((await ticketIds(admin)).includes(t3.id), "restore.sh sin --confirmar tocó la base");

        // Con `api` corriendo: la consulta de recién deja una conexión abierta a la base.
        await ticketIds(admin);
        const conApi = compose(["exec", "-T", "backup", "restore.sh", "--confirmar", copy]);
        assert(conApi.status !== 0, "restore.sh con api corriendo terminó con 0");
        assert(
          /conexiones abiertas/.test(conApi.output),
          `no pidió detener api:\n${tail(conApi.output, 5)}`,
        );
        assert(
          (await ticketIds(admin)).includes(t3.id),
          "restore.sh con api corriendo tocó la base",
        );
      },
    ),

    turboCriterion(19),
  ],
});
