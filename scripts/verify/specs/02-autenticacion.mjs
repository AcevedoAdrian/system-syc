import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "../lib/client.mjs";
import { ADMIN, AGENT_PASSWORD } from "../lib/env.mjs";
import {
  admin,
  departmentNamed,
  departments,
  loggedIn,
  newDepartment,
  newUser,
  uniq,
} from "../lib/fixtures.mjs";
import { resetRateLimit, scalar, sql, state } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, ROOT, rel, run, tail, walk } from "../lib/util.mjs";

const memberCount = (userId) =>
  Number(scalar(`SELECT count(*) FROM member WHERE "userId" = '${userId}'`));

// Deja al admin raíz como único admin activo (otros criterios pueden haber dejado admins creados).
async function onlyRootAdminActive() {
  const a = await admin();
  const users = (await a.get("/users")).body;
  for (const u of users) {
    if (u.role === "admin" && u.activo && u.username !== ADMIN.username) {
      assertStatus(
        await a.post(`/users/${u.id}/active`, { activo: false }),
        200,
        "desactivar admin sobrante",
      );
    }
  }
  return users.find((u) => u.username === ADMIN.username);
}

// SPEC 02 — autenticación y acceso.
export default defineSpec({
  id: "02",
  title: "Autenticación y acceso",
  infra: true,
  criteria: [
    criterion(
      1,
      "Un usuario creado por el admin inicia sesión; uno no creado no puede",
      async () => {
        const user = await newUser();
        assertStatus(
          await new Client().login(user.username, user.password),
          200,
          "login del usuario creado",
        );
        assertStatus(
          await new Client().login(user.username, "otra-clave-equivocada"),
          401,
          "login con clave incorrecta",
        );
        assertStatus(
          await new Client().login(`fantasma${uniq()}`, AGENT_PASSWORD),
          401,
          "login de un usuario inexistente",
        );
      },
    ),

    criterion(
      2,
      "admin/create-user, organization/create y sign-up/email devuelven 404 (también con sesión de admin)",
      async () => {
        const a = await admin();
        const paths = [
          "/api/auth/admin/create-user",
          "/api/auth/organization/create",
          "/api/auth/sign-up/email",
        ];
        for (const client of [new Client(), a]) {
          for (const p of paths) {
            const res = await client.post(p, {
              email: `x${uniq()}@x.com`,
              password: "12345678",
              name: "x",
              role: "admin",
            });
            assertStatus(
              res,
              404,
              `POST ${p} ${client === a ? "con sesión de admin" : "sin sesión"}`,
            );
          }
        }
      },
    ),

    criterion(
      3,
      "El seed dos veces deja 1 admin raíz y 4 departamentos; sin SEED_ADMIN_* aborta nombrándolas",
      async () => {
        const { bare, runs } = state.seed;
        assert(bare.status !== 0, "el seed sin SEED_ADMIN_* no abortó");
        for (const name of ["SEED_ADMIN_USERNAME", "SEED_ADMIN_PASSWORD", "SEED_ADMIN_NAME"]) {
          assert(bare.output.includes(name), `el aborto no nombra ${name}:\n${tail(bare.output)}`);
        }
        for (const [i, r] of runs.entries()) {
          assert(r.status === 0, `la corrida ${i + 1} del seed falló:\n${tail(r.output)}`);
        }
        const admins = Number(
          scalar(
            `SELECT count(*) FROM "user" WHERE role = 'admin' AND username = '${ADMIN.username}'`,
          ),
        );
        assert(admins === 1, `hay ${admins} admins raíz (se esperaba 1)`);
        const names = sql(`SELECT name FROM organization ORDER BY name`).map((r) => r[0]);
        const expected = ["Administrativo", "Desarrollo", "Redes", "Técnico"];
        assert(
          // Otros criterios pueden haber agregado departamentos; solo importa que los 4 estén una vez.
          expected.every((n) => names.filter((x) => x === n).length === 1),
          `departamentos del seed: ${names.join(", ")}`,
        );
      },
    ),

    criterion(4, "La API arranca sin SEED_ADMIN_* definidas", async () => {
      assert(state.apiExit === undefined, `la API no está corriendo:\n${tail(state.apiLog)}`);
      const res = await new Client().get("/health");
      assertStatus(res, 200, "health.check");
      assert(res.body.status === "ok" && res.body.database === "up", `health: ${res.text}`);
    }),

    criterion(
      5,
      "Procedimiento de dominio sin sesión → 401; health.check responde sin sesión",
      async () => {
        const anon = new Client();
        assertStatus(await anon.get("/health"), 200, "health.check sin sesión");
        for (const p of ["/users", "/users/me", "/organizations"]) {
          assertStatus(await anon.get(p), 401, `GET ${p} sin sesión`);
        }
        assertStatus(await anon.post("/users", { username: "x" }), 401, "POST /users sin sesión");
      },
    ),

    criterion(
      6,
      "Una sesión con más de 1 hora de antigüedad recibe un expiresAt nuevo",
      async () => {
        const user = await newUser();
        const client = await loggedIn(user);
        const remaining = () =>
          Number(
            scalar(`SELECT extract(epoch FROM (s."expiresAt" - (now() at time zone 'utc')))::int
                   FROM session s WHERE s."userId" = '${user.id}'`),
          );
        // Simula una sesión de ~2 horas: le quedan 10 h de las 12 h originales.
        sql(
          `UPDATE session SET "expiresAt" = (now() at time zone 'utc') + interval '10 hours' WHERE "userId" = '${user.id}'`,
        );
        const before = remaining();
        assert(before < 10.1 * 3600, `no pude envejecer la sesión (quedan ${before} s)`);
        assertStatus(await client.get("/users/me"), 200, "request con la sesión envejecida");
        const after = remaining();
        assert(
          after > 11.9 * 3600,
          `expiresAt no se renovó: quedan ${Math.round(after / 60)} min (antes ${Math.round(before / 60)})`,
        );
      },
    ),

    criterion(
      7,
      "El sexto intento de login en un minuto desde la misma IP devuelve 429",
      async () => {
        resetRateLimit();
        try {
          const statuses = [];
          for (let i = 0; i < 6; i++) {
            const res = await new Client().post("/api/auth/sign-in/username", {
              username: "nadie",
              password: "incorrecta-123",
            });
            statuses.push(res.status);
          }
          assert(
            statuses.slice(0, 5).every((s) => s !== 429) && statuses[5] === 429,
            `estados de los 6 intentos: ${statuses.join(", ")} (se esperaba que solo el sexto fuera 429)`,
          );
        } finally {
          resetRateLimit();
        }
      },
    ),

    criterion(
      8,
      "Un agente sin departamento o con uno inactivo no se puede dar de alta (400)",
      async () => {
        const a = await admin();
        const base = { name: "Sin Depto", password: AGENT_PASSWORD, role: "agente" };
        assertStatus(
          await a.post("/users", { ...base, username: `u${uniq()}` }),
          400,
          "agente sin departamento",
        );
        const inactive = await newDepartment("Inactivo");
        assertStatus(
          await a.post(`/organizations/${inactive.id}/active`, { activo: false }),
          200,
          "desactivar departamento",
        );
        assertStatus(
          await a.post("/users", { ...base, username: `u${uniq()}`, organizationId: inactive.id }),
          400,
          "agente con departamento inactivo",
        );
      },
    ),

    criterion(
      9,
      "Cambiar el departamento deja exactamente un Member; promover a admin lo deja sin ninguno",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const user = await newUser({ organizationId: tecnico.id });
        assert(memberCount(user.id) === 1, "el alta no dejó exactamente un Member");
        const moved = await a.patch(`/users/${user.id}`, { organizationId: redes.id });
        assertStatus(moved, 200, "cambiar de departamento");
        assert(
          memberCount(user.id) === 1,
          `tras el cambio hay ${memberCount(user.id)} Member (se esperaba 1)`,
        );
        assert(moved.body.department?.id === redes.id, "el departamento nuevo no es el pedido");
        assertStatus(
          await a.patch(`/users/${user.id}`, { role: "admin" }),
          200,
          "promover a admin",
        );
        assert(
          memberCount(user.id) === 0,
          `tras promover quedan ${memberCount(user.id)} Member (se esperaba 0)`,
        );
      },
    ),

    criterion(
      10,
      "Desactivar o degradar al último admin activo, o a uno mismo, devuelve 409",
      async () => {
        const a = await admin();
        const root = await onlyRootAdminActive();
        const tecnico = await departmentNamed("Técnico");
        // Único admin activo: el chequeo de "último admin" (y el de "uno mismo", que coincide).
        assertStatus(
          await a.post(`/users/${root.id}/active`, { activo: false }),
          409,
          "desactivar al único admin",
        );
        assertStatus(
          await a.patch(`/users/${root.id}`, { role: "agente", organizationId: tecnico.id }),
          409,
          "degradar al único admin",
        );
        // Con dos admins activos sigue prohibido hacerlo con uno mismo.
        const other = await newUser({ role: "admin" });
        try {
          assertStatus(
            await a.post(`/users/${root.id}/active`, { activo: false }),
            409,
            "desactivarse a uno mismo (2 admins)",
          );
          assertStatus(
            await a.patch(`/users/${root.id}`, { role: "agente", organizationId: tecnico.id }),
            409,
            "degradarse a uno mismo (2 admins)",
          );
        } finally {
          await a.post(`/users/${other.id}/active`, { activo: false });
        }
        assert(memberCount(root.id) === 0, "el admin raíz quedó con un Member");
      },
    ),

    criterion(11, "Degradar a un admin sin indicar departamento devuelve 400", async () => {
      const other = await newUser({ role: "admin" });
      assertStatus(
        await (await admin()).patch(`/users/${other.id}`, { role: "agente" }),
        400,
        "degradar sin departamento",
      );
      assert(memberCount(other.id) === 0, "el rechazo dejó un Member");
    }),

    criterion(
      12,
      "Desactivar un usuario cierra sus sesiones de inmediato y su siguiente login falla",
      async () => {
        const a = await admin();
        const user = await newUser();
        const client = await loggedIn(user);
        assertStatus(await client.get("/users/me"), 200, "sesión previa a la desactivación");
        assertStatus(
          await a.post(`/users/${user.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(
          await client.get("/users/me"),
          401,
          "request con la sesión de un usuario desactivado",
        );
        const sessions = Number(
          scalar(`SELECT count(*) FROM session WHERE "userId" = '${user.id}'`),
        );
        assert(sessions === 0, `quedan ${sessions} sesiones activas en la tabla Session`);
        const login = await new Client().login(user.username, user.password);
        assert(
          login.status >= 400 && login.status !== 429,
          `el login de un desactivado respondió ${login.status}`,
        );
      },
    ),

    criterion(
      13,
      "Editar el username actualiza el email interno; el email interno no aparece en users.*",
      async () => {
        const a = await admin();
        const user = await newUser();
        const emailOf = () => scalar(`SELECT email FROM "user" WHERE id = '${user.id}'`);
        assert(
          emailOf() === `${user.username}@syc.local`,
          `email interno inicial inesperado: ${emailOf()}`,
        );
        const renamed = `${user.username}x`;
        const res = await a.patch(`/users/${user.id}`, { username: renamed });
        assertStatus(res, 200, "editar username");
        assert(
          emailOf() === `${renamed}@syc.local`,
          `el email interno no siguió al username: ${emailOf()}`,
        );

        const client = await loggedIn({ username: renamed, password: user.password });
        const responses = [
          res,
          await a.get("/users"),
          await a.get("/users/me"),
          await client.get("/users/me"),
        ];
        for (const r of responses) {
          assert(!r.text.includes("syc.local"), "una respuesta de users.* expone el email interno");
        }
        assert(
          res.body.email === null,
          "users.update devolvió un email para un usuario con email interno",
        );

        const uiHits = walk(
          path.join(ROOT, "apps/web/src"),
          (f) => /\.tsx?$/.test(f) && !f.includes(".test."),
        )
          .filter((f) => readFileSync(f, "utf8").includes("syc.local"))
          .map(rel);
        assert(uiHits.length === 0, `la UI referencia el email interno: ${uiHits.join(", ")}`);
      },
    ),

    criterion(
      14,
      "El admin resetea la clave sin conocer la anterior; el agente cambia la propia solo con la actual",
      async () => {
        const a = await admin();
        const user = await newUser();
        const fresh = "clave-reseteada-123";
        assertStatus(
          await a.post(`/users/${user.id}/reset-password`, { password: fresh }),
          [200, 204],
          "reset del admin",
        );
        const old = await new Client().login(user.username, user.password);
        assert(old.status !== 200, "la clave anterior sigue funcionando tras el reset");
        const client = new Client();
        assertStatus(await client.login(user.username, fresh), 200, "login con la clave reseteada");

        const wrong = await client.post("/api/auth/change-password", {
          currentPassword: "no-es-la-actual",
          newPassword: "otra-clave-456",
        });
        assert(wrong.status >= 400, `cambió la clave con una actual incorrecta (${wrong.status})`);
        const right = await client.post("/api/auth/change-password", {
          currentPassword: fresh,
          newPassword: "otra-clave-456",
        });
        assertStatus(right, 200, "cambio de clave con la actual correcta");
        assertStatus(
          await new Client().login(user.username, "otra-clave-456"),
          200,
          "login con la clave cambiada",
        );
      },
    ),

    criterion(
      15,
      'Crear un departamento "tecnico" cuando existe "Técnico" devuelve 409',
      async () => {
        const a = await admin();
        await departmentNamed("Técnico");
        assertStatus(await a.post("/organizations", { nombre: "tecnico" }), 409, 'crear "tecnico"');
        assertStatus(
          await a.post("/organizations", { nombre: "  TÉCNICO " }),
          409,
          'crear "  TÉCNICO "',
        );
      },
    ),

    criterion(
      16,
      "Eliminar un departamento con agentes (activos o desactivados) → 409; desactivarlo funciona",
      async () => {
        const a = await admin();
        const withActive = await newDepartment("ConAgente");
        const user = await newUser({ organizationId: withActive.id });
        assertStatus(
          await a.delete(`/organizations/${withActive.id}`),
          409,
          "eliminar con un agente activo",
        );
        assertStatus(
          await a.post(`/users/${user.id}/active`, { activo: false }),
          200,
          "desactivar al agente",
        );
        assertStatus(
          await a.delete(`/organizations/${withActive.id}`),
          409,
          "eliminar con un agente desactivado",
        );
        assertStatus(
          await a.post(`/organizations/${withActive.id}/active`, { activo: false }),
          200,
          "desactivar el departamento",
        );
        const empty = await newDepartment("Vacio");
        assertStatus(
          await a.delete(`/organizations/${empty.id}`),
          [200, 204],
          "eliminar un departamento vacío",
        );
      },
    ),

    criterion(17, "Desactivar o eliminar el último departamento activo devuelve 409", async () => {
      const a = await admin();
      const active = (await departments()).filter((d) => d.activo);
      const keep = active[0];
      const turnedOff = [];
      try {
        for (const d of active.slice(1)) {
          assertStatus(
            await a.post(`/organizations/${d.id}/active`, { activo: false }),
            200,
            `desactivar ${d.nombre}`,
          );
          turnedOff.push(d);
        }
        assertStatus(
          await a.post(`/organizations/${keep.id}/active`, { activo: false }),
          409,
          "desactivar el último activo",
        );
        assertStatus(await a.delete(`/organizations/${keep.id}`), 409, "eliminar el último activo");
      } finally {
        for (const d of turnedOff) await a.post(`/organizations/${d.id}/active`, { activo: true });
      }
    }),

    criterion(
      18,
      "Crear un departamento no deja al admin como Member de ese departamento",
      async () => {
        const dept = await newDepartment();
        const rootId = scalar(`SELECT id FROM "user" WHERE username = '${ADMIN.username}'`);
        const rows = Number(
          scalar(
            `SELECT count(*) FROM member WHERE "userId" = '${rootId}' OR "organizationId" = '${dept.id}'`,
          ),
        );
        assert(rows === 0, `hay ${rows} Member ligados al admin o al departamento nuevo`);
      },
    ),

    criterion(
      19,
      "Endpoint de prueba: un agente contra otro departamento recibe 403; el admin accede a todos",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const client = await loggedIn(await newUser({ organizationId: tecnico.id }));
        const probe = (d) => `/_probe/departments/${d.id}`;
        assertStatus(await client.get(probe(tecnico)), 200, "agente en su departamento");
        for (const [label, call] of [
          ["GET", () => client.get(probe(redes))],
          ["POST", () => client.post(probe(redes))],
          ["DELETE", () => client.delete(probe(redes))],
        ]) {
          assertStatus(await call(), 403, `agente ${label} en otro departamento`);
        }
        for (const d of [tecnico, redes]) {
          assertStatus(await a.get(probe(d)), 200, `admin GET en ${d.nombre}`);
          assertStatus(await a.post(probe(d)), [200, 201], `admin POST en ${d.nombre}`);
          assertStatus(await a.delete(probe(d)), 200, `admin DELETE en ${d.nombre}`);
        }
      },
    ),

    criterion(
      20,
      "Un cambio de departamento se refleja en la siguiente request sin cerrar sesión",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const user = await newUser({ organizationId: tecnico.id });
        const client = await loggedIn(user);
        assertStatus(await client.get(`/_probe/departments/${redes.id}`), 403, "antes del cambio");
        assertStatus(
          await a.patch(`/users/${user.id}`, { organizationId: redes.id }),
          200,
          "mover al agente",
        );
        assertStatus(
          await client.get(`/_probe/departments/${redes.id}`),
          200,
          "después del cambio, mismo cookie",
        );
        assertStatus(
          await client.get(`/_probe/departments/${tecnico.id}`),
          403,
          "el departamento anterior ya no",
        );
      },
    ),

    // Corre el test de Vitest de las guardas de ruta; no necesita la API.
    criterion(
      21,
      "Sin sesión _authenticated/* redirige a /login; un agente en /admin/* vuelve a /",
      async () => {
        const result = run("pnpm", [
          "--filter",
          "@syc/web",
          "exec",
          "vitest",
          "run",
          "src/routes/_authenticated/guards.test.ts",
        ]);
        assert(result.status === 0, `las guardas de ruta fallan:\n${tail(result.output, 40)}`);
      },
      { infra: false },
    ),

    criterion(
      22,
      "El login funciona por HTTP (cookie sin Secure) con NODE_ENV=production",
      async () => {
        // La API de esta verificación arranca siempre con NODE_ENV=production (ver `apiEnv`).
        const client = new Client();
        const res = await client.login(ADMIN.username, ADMIN.password);
        assertStatus(res, 200, "login por HTTP");
        const session = res.setCookie.find((c) => c.includes("session_token"));
        assert(session, "el login no devolvió la cookie de sesión");
        assert(!/;\s*secure/i.test(session), `la cookie lleva Secure: ${session}`);
        assertStatus(
          await client.get("/users/me"),
          200,
          "la cookie sin Secure sirve en la request siguiente",
        );
      },
    ),

    turboCriterion(23),
  ],
});
