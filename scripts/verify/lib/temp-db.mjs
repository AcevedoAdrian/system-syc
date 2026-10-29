import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ADMIN, cleanEnv, DB_NAME, PG } from "./env.mjs";
import { sql } from "./infra.mjs";
import { assert, ROOT, run, tail } from "./util.mjs";

// Bases temporales propias de un criterio (migraciones y seed), aparte de la compartida de la corrida.
// Cada criterio crea las suyas y las borra en un `finally`.

export const MIGRATIONS = path.join(ROOT, "packages/db/migrations");
export const SEED_DATA = path.join(ROOT, "seed-data");

const psqlFile = (database, content) => {
  const result = run(
    "docker",
    [
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
      "-q",
      "-f",
      "-",
    ],
    { input: content },
  );
  assert(result.status === 0, `psql falló en ${database}:\n${tail(result.output)}`);
};

const urlOf = (database) =>
  `postgresql://${PG.user}:${encodeURIComponent(PG.password)}@localhost:${PG.port}/${database}`;

export const dropDb = (database) =>
  sql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`, "postgres");

// Una base nueva con todas las migraciones y nada más (sin seed).
export function emptyDb(suffix) {
  const database = `${DB_NAME}_${suffix}`;
  sql(`CREATE DATABASE "${database}"`, "postgres");
  const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    psqlFile(database, readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8"));
  }
  return database;
}

// Una carpeta de datos del seed con los archivos obligatorios del repo, más los `extra` que se pasan
// como { "archivo.json": contenido } (un texto se copia tal cual; el resto se serializa a JSON).
export function seedDir(prefix, extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  for (const file of ["departamentos.json", "estados.json", "prioridades.json"]) {
    copyFileSync(path.join(SEED_DATA, file), path.join(dir, file));
  }
  for (const [file, content] of Object.entries(extra)) {
    writeFileSync(
      path.join(dir, file),
      typeof content === "string" ? content : JSON.stringify(content),
    );
  }
  return dir;
}

export const seedWith = (database, dir) =>
  run(process.execPath, ["apps/api/dist/seed.mjs"], {
    env: cleanEnv({
      DATABASE_URL: urlOf(database),
      SEED_DATA_DIR: dir,
      SEED_ADMIN_USERNAME: ADMIN.username,
      SEED_ADMIN_PASSWORD: ADMIN.password,
      SEED_ADMIN_NAME: ADMIN.name,
    }),
  });

// Una consulta contra una base temporal propia (`scalar` de infra apunta a la compartida).
export const rowsIn = (database, query) => sql(query, database);
