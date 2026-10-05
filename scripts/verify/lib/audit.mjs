import { isDeepStrictEqual } from "node:util";
import { admin } from "./fixtures.mjs";
import { scalar, sql } from "./infra.mjs";
import { assert, assertStatus } from "./util.mjs";

// Lectura de `AuditLog` en la base temporal, compartida por los SPEC que auditan sus mutaciones.

export const q = (value) => String(value).replaceAll("'", "''");

// Registros de `AuditLog` de una entidad, del más antiguo al más reciente.
export function auditRows(entityType, entityId) {
  return sql(
    `SELECT action, coalesce("actorId", ''), payload::text FROM audit_log
     WHERE "entityType" = '${q(entityType)}' AND "entityId" = '${q(entityId)}'
     ORDER BY "createdAt", id`,
  ).map(([action, actorId, ...payload]) => ({
    action,
    actorId,
    payload: JSON.parse(payload.join("|")),
  }));
}

export const auditCount = () => Number(scalar(`SELECT count(*) FROM audit_log`));

export async function adminId() {
  const res = await (await admin()).get("/users/me");
  assertStatus(res, 200, "users.me del admin");
  return res.body.id;
}

// Compara por valor e ignora el orden de las claves: `jsonb` de Postgres las reordena.
export const same = (actual, expected, label) =>
  assert(
    isDeepStrictEqual(actual, expected),
    `${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`,
  );
