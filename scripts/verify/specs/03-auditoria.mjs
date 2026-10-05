import { isDeepStrictEqual } from "node:util";
import { Client } from "../lib/client.mjs";
import { ADMIN, AGENT_PASSWORD, cleanEnv } from "../lib/env.mjs";
import {
  admin,
  departmentNamed,
  loggedIn,
  newDepartment,
  newUser,
  uniq,
} from "../lib/fixtures.mjs";
import { scalar, sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, run, tail } from "../lib/util.mjs";

// Contraseñas que usan estos criterios: ninguna debe aparecer en un `payload` (criterio 9).
const RESET_PASSWORD = "clave-reseteada-verify-3";
const OWN_NEW_PASSWORD = "clave-propia-nueva-verify-4";

const q = (value) => String(value).replaceAll("'", "''");

// Registros de `AuditLog` de una entidad, del más antiguo al más reciente.
function auditRows(entityType, entityId) {
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

const auditCount = () => Number(scalar(`SELECT count(*) FROM audit_log`));

async function adminId() {
  const res = await (await admin()).get("/users/me");
  assertStatus(res, 200, "users.me del admin");
  return res.body.id;
}

// Compara por valor e ignora el orden de las claves: `jsonb` de Postgres las reordena.
const same = (actual, expected, label) =>
  assert(
    isDeepStrictEqual(actual, expected),
    `${label}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`,
  );

// Claves de un valor JSON, a cualquier profundidad.
function keysOf(value) {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  }
  return [];
}

// SPEC 03 — auditoría y eliminación lógica.
export default defineSpec({
  id: "03",
  title: "Auditoría y eliminación lógica",
  infra: true,
  criteria: [
    criterion(
      1,
      "Crear, renombrar, desactivar, reactivar y eliminar un departamento deja, en cada paso, un `AuditLog` con el admin como actor y el `payload` de la convención",
      async () => {
        const a = await admin();
        const me = await adminId();
        const nombre = `Depto ${uniq()}`;
        const renamed = `${nombre} bis`;

        const created = (await a.post("/organizations", { nombre })).body;
        assert(created?.id, "no se creó el departamento");
        assertStatus(
          await a.patch(`/organizations/${created.id}`, { nombre: renamed }),
          200,
          "renombrar",
        );
        assertStatus(
          await a.post(`/organizations/${created.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(
          await a.post(`/organizations/${created.id}/active`, { activo: true }),
          200,
          "reactivar",
        );
        assertStatus(await a.delete(`/organizations/${created.id}`), 200, "eliminar");

        const rows = auditRows("Organization", created.id);
        same(
          rows.map((r) => r.action),
          ["create", "update", "update", "update", "delete"],
          "acciones",
        );
        assert(
          rows.every((r) => r.actorId === me),
          "algún registro no tiene al admin como actor",
        );
        same(rows[0].payload, { after: { nombre, activo: true } }, "payload del alta");
        same(
          rows[1].payload,
          { before: { nombre }, after: { nombre: renamed } },
          "payload de renombrar",
        );
        same(
          rows[2].payload,
          { before: { activo: true }, after: { activo: false } },
          "payload de desactivar",
        );
        same(
          rows[3].payload,
          { before: { activo: false }, after: { activo: true } },
          "payload de reactivar",
        );
        same(rows[4].payload, {}, "payload de eliminar");
      },
    ),

    criterion(
      2,
      "Crear un usuario, editarlo (nombre, rol y departamento a la vez), desactivarlo, reactivarlo y resetearle la contraseña deja `create`, **un** `update`, `update`, `update` y `reset_password`",
      async () => {
        const a = await admin();
        const me = await adminId();
        const redes = await departmentNamed("Redes");
        const user = await newUser({ role: "admin" });

        assertStatus(
          await a.patch(`/users/${user.id}`, {
            name: "Nombre Editado",
            role: "agente",
            organizationId: redes.id,
          }),
          200,
          "editar nombre, rol y departamento",
        );
        assertStatus(
          await a.post(`/users/${user.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(await a.post(`/users/${user.id}/active`, { activo: true }), 200, "reactivar");
        assertStatus(
          await a.post(`/users/${user.id}/reset-password`, { password: RESET_PASSWORD }),
          200,
          "resetear la contraseña",
        );

        const rows = auditRows("User", user.id);
        same(
          rows.map((r) => r.action),
          ["create", "update", "update", "update", "reset_password"],
          "acciones",
        );
        assert(
          rows.every((r) => r.actorId === me),
          "algún registro no tiene al admin como actor",
        );
        same(
          Object.keys(rows[1].payload.after).sort(),
          ["departamento", "name", "role"],
          "campos del único update de la edición",
        );
        same(
          rows[1].payload.after.departamento,
          { id: redes.id, nombre: "Redes" },
          "departamento en el diff",
        );
        same(rows[4].payload, {}, "payload de reset_password");
      },
    ),

    criterion(
      3,
      'Renombrar "Soporte" a "Mesa de ayuda" deja exactamente `{ before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } }`',
      async () => {
        const a = await admin();
        const created = (await a.post("/organizations", { nombre: "Soporte" })).body;
        assert(created?.id, "no se creó el departamento Soporte");
        assertStatus(
          await a.patch(`/organizations/${created.id}`, { nombre: "Mesa de ayuda" }),
          200,
          "renombrar",
        );

        const update = auditRows("Organization", created.id).find((r) => r.action === "update");
        same(
          update?.payload,
          { before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } },
          "payload",
        );
      },
    ),

    criterion(
      4,
      "Una edición sin cambios efectivos (mismo nombre o mismo estado `activo`) no genera `AuditLog`",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const user = await newUser();
        const before = auditCount();

        assertStatus(
          await a.patch(`/organizations/${dept.id}`, { nombre: dept.nombre }),
          200,
          "renombrar al mismo nombre",
        );
        assertStatus(
          await a.post(`/organizations/${dept.id}/active`, { activo: true }),
          200,
          "activar un departamento activo",
        );
        assertStatus(
          await a.patch(`/users/${user.id}`, { name: user.name }),
          200,
          "editar un usuario con su mismo nombre",
        );
        assertStatus(
          await a.post(`/users/${user.id}/active`, { activo: true }),
          200,
          "activar un usuario activo",
        );

        assert(auditCount() === before, "una edición sin cambios dejó un AuditLog");
      },
    ),

    criterion(
      5,
      "Con un trigger temporal que hace fallar el `INSERT` en `AuditLog`, renombrar un departamento devuelve 500 y el nombre no cambia",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        sql(`CREATE FUNCTION verify_audit_fail() RETURNS trigger AS $$
             BEGIN RAISE EXCEPTION 'auditoria bloqueada por la verificacion'; END
             $$ LANGUAGE plpgsql;
             CREATE TRIGGER verify_audit_fail BEFORE INSERT ON audit_log
             FOR EACH ROW EXECUTE FUNCTION verify_audit_fail()`);
        try {
          assertStatus(
            await a.patch(`/organizations/${dept.id}`, { nombre: `${dept.nombre} bis` }),
            500,
            "renombrar con la auditoría rota",
          );
        } finally {
          sql(`DROP TRIGGER IF EXISTS verify_audit_fail ON audit_log;
               DROP FUNCTION IF EXISTS verify_audit_fail()`);
        }

        const name = scalar(`SELECT name FROM organization WHERE id = '${q(dept.id)}'`);
        assert(name === dept.nombre, `el nombre cambió a "${name}" pese al 500`);
        same(
          auditRows("Organization", dept.id).map((r) => r.action),
          ["create"],
          "registros del departamento",
        );
      },
    ),

    criterion(
      6,
      "Cambiar la propia contraseña deja `change_password` con el propio usuario como actor; login y logout no dejan registro",
      async () => {
        const user = await newUser();
        const before = auditCount();

        const client = await loggedIn(user);
        assertStatus(await client.post("/api/auth/sign-out"), 200, "logout");
        assert(auditCount() === before, "login o logout dejaron un AuditLog");

        const session = await loggedIn(user);
        assertStatus(
          await session.post("/api/auth/change-password", {
            currentPassword: user.password,
            newPassword: OWN_NEW_PASSWORD,
          }),
          200,
          "cambiar la propia contraseña",
        );

        const rows = auditRows("User", user.id);
        same(
          rows.map((r) => r.action),
          ["create", "change_password"],
          "acciones",
        );
        assert(rows[1].actorId === user.id, "el actor de change_password no es el propio usuario");
        same(rows[1].payload, {}, "payload de change_password");

        const wrong = await new Client().login(user.username, user.password);
        assert(wrong.status !== 200, "la contraseña anterior sigue funcionando");
      },
    ),

    criterion(
      7,
      "Correr el seed sobre una base vacía deja 5 `create` con `actorId: null` (admin y 4 departamentos); correrlo otra vez no agrega registros",
      async () => {
        const system = () =>
          sql(
            `SELECT "entityType", action FROM audit_log WHERE "actorId" IS NULL ORDER BY "entityType"`,
          );
        same(
          system(),
          [
            ["Organization", "create"],
            ["Organization", "create"],
            ["Organization", "create"],
            ["Organization", "create"],
            ["User", "create"],
          ],
          "registros del sistema tras dos corridas del seed",
        );

        const total = auditCount();
        const again = run(process.execPath, ["apps/api/dist/seed.mjs"], {
          env: cleanEnv({
            SEED_ADMIN_USERNAME: ADMIN.username,
            SEED_ADMIN_PASSWORD: ADMIN.password,
            SEED_ADMIN_NAME: ADMIN.name,
          }),
        });
        assert(again.status === 0, `el seed falló:\n${tail(again.output)}`);
        assert(auditCount() === total, "otra corrida del seed agregó registros");
      },
    ),

    criterion(
      8,
      "`users.history` y `organizations.history` devuelven al admin los registros del más reciente al más antiguo, con el actor `{ id, name }`; un agente recibe 403; un id sin registros devuelve `[]`",
      async () => {
        const a = await admin();
        const me = await adminId();
        const dept = await newDepartment();
        assertStatus(
          await a.post(`/organizations/${dept.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(
          await a.patch(`/organizations/${dept.id}`, { nombre: `${dept.nombre} bis` }),
          200,
          "renombrar",
        );

        const org = await a.get(`/organizations/${dept.id}/history`);
        assertStatus(org, 200, "organizations.history");
        same(
          org.body.map((e) => e.action),
          ["update", "update", "create"],
          "orden del historial del departamento",
        );
        same(org.body[0].actor, { id: me, name: ADMIN.name }, "actor del historial");
        assert(
          org.body.every((e) => !Number.isNaN(Date.parse(e.createdAt))),
          "createdAt no es una fecha ISO",
        );

        const user = await newUser();
        assertStatus(
          await a.post(`/users/${user.id}/active`, { activo: false }),
          200,
          "desactivar usuario",
        );
        const usr = await a.get(`/users/${user.id}/history`);
        assertStatus(usr, 200, "users.history");
        same(
          usr.body.map((e) => e.action),
          ["update", "create"],
          "orden del historial del usuario",
        );

        const agent = await loggedIn(await newUser());
        assertStatus(await agent.get(`/users/${user.id}/history`), 403, "agente: users.history");
        assertStatus(
          await agent.get(`/organizations/${dept.id}/history`),
          403,
          "agente: organizations.history",
        );

        for (const path of ["/users/no-existe/history", "/organizations/no-existe/history"]) {
          const empty = await a.get(path);
          assertStatus(empty, 200, path);
          same(empty.body, [], `historial de ${path}`);
        }

        // El historial de un departamento eliminado se sigue leyendo.
        const gone = await newDepartment();
        assertStatus(await a.delete(`/organizations/${gone.id}`), 200, "eliminar departamento");
        const deleted = await a.get(`/organizations/${gone.id}/history`);
        assertStatus(deleted, 200, "historial del departamento eliminado");
        same(
          deleted.body.map((e) => e.action),
          ["delete", "create"],
          "historial del departamento eliminado",
        );
      },
    ),

    criterion(
      9,
      "Ningún `payload` de la base temporal contiene las claves `password`, `hash` o `token`, ni las contraseñas usadas en los criterios",
      async () => {
        const payloads = sql(`SELECT payload::text FROM audit_log`).map((row) => row.join("|"));
        assert(payloads.length > 0, "no hay registros de auditoría que revisar");

        const forbiddenKeys = /password|hash|token/i;
        const secrets = [ADMIN.password, AGENT_PASSWORD, RESET_PASSWORD, OWN_NEW_PASSWORD];
        for (const text of payloads) {
          const bad = keysOf(JSON.parse(text)).find((key) => forbiddenKeys.test(key));
          assert(!bad, `un payload tiene la clave "${bad}": ${text}`);
          const leaked = secrets.find((secret) => text.includes(secret));
          assert(!leaked, `un payload contiene una contraseña usada en la verificación: ${text}`);
        }
      },
    ),

    turboCriterion(10),
  ],
});
