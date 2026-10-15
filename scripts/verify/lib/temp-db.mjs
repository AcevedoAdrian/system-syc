import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DB_NAME, PG } from "./env.mjs";
import { sql } from "./infra.mjs";
import { assert, ROOT, run, tail } from "./util.mjs";

// Bases temporales propias de un criterio (migración y seed): se crean en el Postgres del compose,
// aparte de la base temporal de la API, y el criterio las borra al terminar. Las usan los SPEC que
// prueban qué hace una migración con datos que ya existen.

export const MIGRATIONS = path.join(ROOT, "packages/db/migrations");

export const migrationDirs = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

export const migrationSql = (dir) =>
  readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8");

export const psqlFile = (database, content) => {
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

export const urlOf = (database) =>
  `postgresql://${PG.user}:${encodeURIComponent(PG.password)}@localhost:${PG.port}/${database}`;

export const dropDb = (database) =>
  sql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`, "postgres");

// Una base nueva con las migraciones anteriores a la que termina en `hasta` (o con todas, `hasta` =
// null). El criterio aplica después la migración que prueba, con `migrationSql`.
export function freshDb(suffix, { hasta }) {
  const database = `${DB_NAME}_${suffix}`;
  sql(`CREATE DATABASE "${database}"`, "postgres");
  for (const dir of migrationDirs()) {
    if (hasta && dir.endsWith(hasta)) break;
    psqlFile(database, migrationSql(dir));
  }
  return database;
}

// Un usuario mínimo para las FK `createdBy` y `updatedBy` de las filas que el criterio inserta a mano.
export function insertUser(database, id = "u1") {
  sql(
    `INSERT INTO "user"(id, name, email, "emailVerified", "createdAt", "updatedAt", username)
     VALUES ('${id}', 'x', '${id}@x.test', true, now(), now(), '${id}')`,
    database,
  );
}
