import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditCount, auditRows, q, same } from "../lib/audit.mjs";
import { ADMIN, cleanEnv, DB_NAME, PG } from "../lib/env.mjs";
import {
  admin,
  createItem,
  departmentNamed,
  loggedIn,
  newDepartment,
  newTicket,
  newUser,
  ticketBody,
} from "../lib/fixtures.mjs";
import { scalar, sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, ROOT, readJson, run, tail, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

const MODULOS = "/catalogs/modulos";
const OTRO_DEPARTAMENTO = "El módulo no es del departamento del ticket";
const NO_EXISTE = "El módulo no existe o está desactivado";

const modulo = (departamentoIds, extra = {}) =>
  createItem("modulos", { departamentoIds, ...extra });
const patchModulo = async (m, extra) =>
  (await admin()).patch(`${MODULOS}/${m.id}`, { nombre: m.nombre, ...extra });
const moduloRows = (id) =>
  Number(scalar(`SELECT count(*) FROM modulo_departamento WHERE "moduloId" = '${q(id)}'`));
const nombresDe = (m) => m.departamentos.map((d) => d.nombre);

const setDepartmentActive = async (department, activo) =>
  assertStatus(
    await (await admin()).post(`/organizations/${department.id}/active`, { activo }),
    200,
    `${activo ? "reactivar" : "desactivar"} el departamento`,
  );

const getTicket = async (client, id) => {
  const res = await client.get(`/tickets/${id}`);
  assertStatus(res, 200, `tickets.get ${id}`);
  return res.body;
};

// La edición que no cambia nada: reenvía los valores actuales; cada criterio pisa lo que prueba.
const editBody = (t, extra = {}) => ({
  updatedAt: t.updatedAt,
  titulo: t.titulo,
  descripcion: t.descripcion,
  actuacionSimple: t.actuacionSimple,
  prioridadId: t.prioridad.id,
  areaId: t.area?.id ?? null,
  edificioId: t.edificio?.id ?? null,
  tipoId: t.tipo?.id ?? null,
  moduloId: t.modulo?.id ?? null,
  proveedorId: t.proveedor?.id ?? null,
  referenciaExterna: t.referenciaExterna,
  numeroFactura: t.numeroFactura,
  fechaRecepcion: t.fechaRecepcion,
  fechaCierre: t.fechaCierre,
  fechaReabierto: t.fechaReabierto,
  solucionDescripcion: t.solucionDescripcion,
  notificado: t.notificado,
  ...extra,
});
const update = (client, t, extra) => client.put(`/tickets/${t.id}`, editBody(t, extra));
const changeDepartment = (client, t, departamentoId) =>
  client.post(`/tickets/${t.id}/department`, { updatedAt: t.updatedAt, departamentoId });

// --- Bases temporales propias (seed) -----------------------------------------------------------

const MIGRATIONS = path.join(ROOT, "packages/db/migrations");
const SEED_DATA = path.join(ROOT, "seed-data");

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

const dropDb = (database) => sql(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`, "postgres");

// Una base nueva con todas las migraciones y nada más (sin seed).
function emptyDb(suffix) {
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

// Una carpeta de datos del seed con los archivos obligatorios del repo y, si se pasa, un `modulos.json`
// propio (sin `agentes.json` ni `areas.json`, que no van a git).
function seedDir(modulos) {
  const dir = mkdtempSync(path.join(tmpdir(), "seed-11-"));
  for (const file of ["departamentos.json", "estados.json", "prioridades.json"]) {
    copyFileSync(path.join(SEED_DATA, file), path.join(dir, file));
  }
  if (modulos) writeFileSync(path.join(dir, "modulos.json"), JSON.stringify(modulos));
  return dir;
}

const seedWith = (database, dir) =>
  run(process.execPath, ["apps/api/dist/seed.mjs"], {
    env: cleanEnv({
      DATABASE_URL: urlOf(database),
      SEED_DATA_DIR: dir,
      SEED_ADMIN_USERNAME: ADMIN.username,
      SEED_ADMIN_PASSWORD: ADMIN.password,
      SEED_ADMIN_NAME: ADMIN.name,
    }),
  });

// Un escalar de una base temporal propia (`scalar` de infra apunta a la compartida).
const scalarIn = (database, query) => sql(query, database)[0]?.[0];

const moduloPairs = (database) =>
  sql(
    `SELECT m.nombre, o.name FROM modulo m
       JOIN modulo_departamento md ON md."moduloId" = m.id
       JOIN organization o ON o.id = md."organizationId"
      WHERE m."deletedAt" IS NULL ORDER BY m.orden, o.name`,
    database,
  );

// --- SPEC 11 ------------------------------------------------------------------------------------

export default defineSpec({
  id: "11",
  title: "Módulos por departamento",
  infra: true,
  criteria: [
    criterion(
      1,
      "Después de `prisma migrate deploy`, existe la tabla `modulo_departamento` con clave `(moduloId, organizationId)`, `ticket` tiene el índice `(departamentoId, moduloId)`, y un segundo `migrate dev` no genera nada",
      async () => {
        const [[columns]] = sql(
          `SELECT string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
            WHERE tc.table_name = 'modulo_departamento' AND tc.constraint_type = 'PRIMARY KEY'`,
        );
        same(columns, "moduloId,organizationId", "clave primaria de modulo_departamento");

        const [[def]] = sql(
          `SELECT indexdef FROM pg_indexes
            WHERE tablename = 'ticket' AND indexname = 'ticket_departamentoId_moduloId_idx'`,
        );
        assert(
          /\("departamentoId", "moduloId"\)/.test(def),
          `el índice de ticket no es (departamentoId, moduloId): ${def}`,
        );

        // La migración solo crea la tabla, su índice, el de `ticket` y las FK: no asigna departamentos.
        const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith("_modulos_departamentos"));
        assert(dir, "no existe la migración `modulos_departamentos`");
        const statements = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"))
          .join(" ")
          .split(";")
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const expected = [
          /^CREATE TABLE "modulo_departamento" \(/,
          /^CREATE INDEX "modulo_departamento_organizationId_idx" ON "modulo_departamento"/,
          /^CREATE INDEX "ticket_departamentoId_moduloId_idx" ON "ticket"\("departamentoId", "moduloId"\)/,
          /^ALTER TABLE "modulo_departamento" ADD CONSTRAINT \S+ FOREIGN KEY \("moduloId"\)/,
          /^ALTER TABLE "modulo_departamento" ADD CONSTRAINT \S+ FOREIGN KEY \("organizationId"\)/,
        ];
        same(statements.length, expected.length, "cantidad de sentencias de la migración");
        for (const [i, pattern] of expected.entries()) {
          assert(pattern.test(statements[i]), `sentencia ${i + 1} inesperada: ${statements[i]}`);
        }

        // `migrate dev` no genera nada si el esquema y las migraciones coinciden; `migrate diff` contra
        // la base ya migrada lo comprueba sin base sombra, con el mismo motor (los índices parciales
        // escritos a mano tampoco figuran).
        const diff = run(
          "pnpm",
          [
            "--filter",
            "@syc/db",
            "exec",
            "prisma",
            "migrate",
            "diff",
            "--from-config-datasource",
            "--to-schema",
            "schema.prisma",
            "--exit-code",
          ],
          { env: cleanEnv() },
        );
        assert(
          diff.status === 0,
          `el esquema y las migraciones difieren (código ${diff.status}):\n${tail(diff.output)}`,
        );
      },
    ),

    criterion(
      2,
      "`catalogs.modulos.create` con `departamentoIds` de Desarrollo y Redes devuelve 200, con `departamentos` con los dos",
      async () => {
        const [desarrollo, redes] = [
          await departmentNamed("Desarrollo"),
          await departmentNamed("Redes"),
        ];

        // Se mandan en el orden inverso al alfabético: la salida va ordenada por nombre.
        const m = await modulo([redes.id, desarrollo.id]);

        same(
          m.departamentos,
          [
            { id: desarrollo.id, nombre: "Desarrollo" },
            { id: redes.id, nombre: "Redes" },
          ],
          "departamentos del alta",
        );
        const listed = (await (await admin()).get(MODULOS)).body.find((i) => i.id === m.id);
        same(listed.departamentos, m.departamentos, "departamentos en la lista");
      },
    ),

    criterion(
      3,
      "`catalogs.modulos.create` sin `departamentoIds`, con `[]` o con un departamento desactivado devuelve 400",
      async () => {
        const a = await admin();
        const desactivado = await newDepartment();
        await setDepartmentActive(desactivado, false);
        const antes = auditCount();

        for (const [label, body] of [
          ["sin departamentoIds", { nombre: "Sin lista" }],
          ["con []", { nombre: "Lista vacía", departamentoIds: [] }],
          [
            "con un departamento desactivado",
            { nombre: "Apagado", departamentoIds: [desactivado.id] },
          ],
          ["con un departamento inexistente", { nombre: "Fantasma", departamentoIds: ["nada"] }],
        ]) {
          const res = await a.post(MODULOS, { ...body, nombre: `${body.nombre} ${Date.now()}` });
          assertStatus(res, 400, `alta ${label}`);
        }
        same(auditCount(), antes, "las altas rechazadas no auditan");
      },
    ),

    criterion(
      4,
      "Editar un módulo conservando un departamento que se desactivó después devuelve 200",
      async () => {
        const redes = await departmentNamed("Redes");
        const luego = await newDepartment();
        const m = await modulo([luego.id, redes.id]);
        await setDepartmentActive(luego, false);

        const res = await patchModulo(m, {
          nombre: `${m.nombre} bis`,
          departamentoIds: [redes.id, luego.id],
        });

        assertStatus(res, 200, "editar conservando el departamento desactivado");
        same(
          nombresDe(res.body).sort(),
          [luego.nombre, "Redes"].sort(),
          "departamentos tras la edición",
        );
        // Un departamento desactivado que el módulo NO tenía sigue sin poder agregarse.
        const otro = await newDepartment();
        await setDepartmentActive(otro, false);
        assertStatus(
          await patchModulo(m, {
            nombre: `${m.nombre} bis`,
            departamentoIds: [redes.id, luego.id, otro.id],
          }),
          400,
          "agregar un departamento desactivado",
        );
      },
    ),

    criterion(
      5,
      "Quitarle un departamento a un módulo deja un `AuditLog` `update` cuyo diff tiene `departamentos` antes y después. Reenviar los mismos departamentos en otro orden responde 200 y no deja `AuditLog`",
      async () => {
        const [desarrollo, redes] = [
          await departmentNamed("Desarrollo"),
          await departmentNamed("Redes"),
        ];
        const m = await modulo([desarrollo.id, redes.id]);
        const d = { id: desarrollo.id, nombre: "Desarrollo" };
        const r = { id: redes.id, nombre: "Redes" };

        assertStatus(
          await patchModulo(m, { departamentoIds: [desarrollo.id] }),
          200,
          "quitar Redes",
        );
        let rows = auditRows("Modulo", m.id);
        same(
          rows.map((x) => x.action),
          ["create", "update"],
          "acciones tras quitar un departamento",
        );
        same(
          rows[1].payload,
          { before: { departamentos: [d, r] }, after: { departamentos: [d] } },
          "diff",
        );

        assertStatus(
          await patchModulo(m, { departamentoIds: [redes.id, desarrollo.id] }),
          200,
          "volver a sumar",
        );
        const antes = auditRows("Modulo", m.id).length;
        const res = await patchModulo(m, { departamentoIds: [desarrollo.id, redes.id] });
        assertStatus(res, 200, "reenviar en otro orden");
        same(res.body.departamentos, [d, r], "departamentos tras reordenar");
        rows = auditRows("Modulo", m.id);
        same(rows.length, antes, "reordenar no audita");
        same(moduloRows(m.id), 2, "filas de la unión");
      },
    ),

    criterion(
      6,
      "Un agente de Redes recibe en `catalogs.modulos.list` solo los módulos que tienen Redes, activos e inactivos, cada uno con todos sus departamentos. El admin recibe todos. Un agente sin departamento recibe `[]`",
      async () => {
        const a = await admin();
        const [desarrollo, redes, tecnico] = [
          await departmentNamed("Desarrollo"),
          await departmentNamed("Redes"),
          await departmentNamed("Técnico"),
        ];
        const compartido = await modulo([desarrollo.id, redes.id]);
        const soloRedes = await modulo([redes.id]);
        const inactivo = await modulo([redes.id]);
        assertStatus(
          await a.post(`${MODULOS}/${inactivo.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        const ajeno = await modulo([tecnico.id]);

        const agente = await loggedIn(await newUser({ organizationId: redes.id }));
        const res = await agente.get(MODULOS);
        assertStatus(res, 200, "list del agente de Redes");
        const ids = res.body.map((i) => i.id);
        for (const m of [compartido, soloRedes, inactivo])
          assert(ids.includes(m.id), `falta ${m.nombre}`);
        assert(!ids.includes(ajeno.id), "el agente ve un módulo que no tiene Redes");
        assert(
          res.body.every((i) => nombresDe(i).includes("Redes")),
          "el agente recibió un módulo sin Redes",
        );
        same(
          nombresDe(res.body.find((i) => i.id === compartido.id)),
          ["Desarrollo", "Redes"],
          "el módulo compartido trae todos sus departamentos",
        );

        const todos = (await a.get(MODULOS)).body.map((i) => i.id);
        for (const m of [compartido, soloRedes, inactivo, ajeno]) {
          assert(todos.includes(m.id), `el admin no ve ${m.nombre}`);
        }

        // Un agente sin departamento (sin `Member`) recibe una lista vacía, no un error.
        const huerfano = await newUser({ organizationId: redes.id });
        sql(`DELETE FROM member WHERE "userId" = '${q(huerfano.id)}'`);
        const vacio = await (await loggedIn(huerfano)).get(MODULOS);
        assertStatus(vacio, 200, "list de un agente sin departamento");
        same(vacio.body, [], "lista de un agente sin departamento");

        // Los demás catálogos no se recortan.
        const edificio = await createItem("edificios");
        const edificios = (await agente.get("/catalogs/edificios")).body.map((i) => i.id);
        assert(edificios.includes(edificio.id), "el agente no ve los edificios completos");
      },
    ),

    criterion(
      7,
      "Eliminar un módulo borra sus filas de `modulo_departamento`; un módulo con un ticket no eliminado sigue dando 409",
      async () => {
        const a = await admin();
        const [desarrollo, tecnico] = [
          await departmentNamed("Desarrollo"),
          await departmentNamed("Técnico"),
        ];
        const m = await modulo([desarrollo.id, tecnico.id]);
        same(moduloRows(m.id), 2, "filas antes de eliminar");

        assertStatus(await a.delete(`${MODULOS}/${m.id}`), 200, "eliminar");
        same(moduloRows(m.id), 0, "filas después de eliminar");

        const usado = await modulo([tecnico.id]);
        await newTicket(a, tecnico.id, { moduloId: usado.id });
        const res = await a.delete(`${MODULOS}/${usado.id}`);
        assertStatus(res, 409, "eliminar un módulo con un ticket");
        assert(/Lo usa al menos un ticket/.test(res.body.message), `mensaje: ${res.text}`);
        same(moduloRows(usado.id), 1, "el 409 no toca la unión");
      },
    ),

    criterion(
      8,
      "Eliminar un departamento asignado a un módulo devuelve 409. Después de eliminar ese módulo, eliminar el departamento devuelve 200",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const m = await modulo([dept.id]);

        const res = await a.delete(`/organizations/${dept.id}`);
        assertStatus(res, 409, "eliminar un departamento con un módulo");
        assert(/Lo usa al menos un módulo/.test(res.body.message), `mensaje: ${res.text}`);

        assertStatus(await a.delete(`${MODULOS}/${m.id}`), 200, "eliminar el módulo");
        assertStatus(await a.delete(`/organizations/${dept.id}`), 200, "eliminar el departamento");
      },
    ),

    criterion(
      9,
      '`tickets.create` con un `moduloId` que no tiene el departamento del ticket devuelve 400 "El módulo no es del departamento del ticket". Con uno que lo tiene, 200, y `tickets.get` lo trae. Con un módulo desactivado o inexistente, 400 «El módulo no existe o está desactivado»',
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const propio = await modulo([tecnico.id]);
        const ajeno = await modulo([redes.id]);
        const apagado = await modulo([tecnico.id]);
        assertStatus(
          await a.post(`${MODULOS}/${apagado.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        const borrado = await modulo([tecnico.id]);
        assertStatus(await a.delete(`${MODULOS}/${borrado.id}`), 200, "eliminar");

        const ajenoRes = await a.post(
          "/tickets",
          await ticketBody(tecnico.id, { moduloId: ajeno.id }),
        );
        assertStatus(ajenoRes, 400, "módulo de otro departamento");
        same(ajenoRes.body.message, OTRO_DEPARTAMENTO, "mensaje del módulo ajeno");

        for (const [label, id] of [
          ["desactivado", apagado.id],
          ["eliminado", borrado.id],
          ["inexistente", "nada"],
        ]) {
          const res = await a.post("/tickets", await ticketBody(tecnico.id, { moduloId: id }));
          assertStatus(res, 400, `módulo ${label}`);
          same(res.body.message, NO_EXISTE, `mensaje del módulo ${label}`);
        }

        const ok = await a.post("/tickets", await ticketBody(tecnico.id, { moduloId: propio.id }));
        assertStatus(ok, 200, "módulo del departamento");
        same(ok.body.modulo, { id: propio.id, nombre: propio.nombre }, "módulo al crear");
        same((await getTicket(a, ok.body.id)).modulo, ok.body.modulo, "módulo en tickets.get");

        // Un agente de Técnico crea con un módulo de su departamento.
        const agente = await loggedIn(await newUser({ organizationId: tecnico.id }));
        const propioAgente = await agente.post(
          "/tickets",
          await ticketBody(tecnico.id, { moduloId: propio.id }),
        );
        assertStatus(propioAgente, 200, "agente con un módulo de su departamento");
        assertStatus(
          await agente.post("/tickets", await ticketBody(tecnico.id, { moduloId: ajeno.id })),
          400,
          "agente con un módulo de otro departamento",
        );
      },
    ),

    criterion(
      10,
      "`tickets.update` eligiendo un módulo nuevo de otro departamento devuelve 400. Guardar un ticket cuyo módulo actual ya no tiene su departamento, sin cambiarlo, devuelve 200",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const actual = await modulo([tecnico.id, redes.id]);
        const ajeno = await modulo([redes.id]);
        const t = await newTicket(a, tecnico.id, { moduloId: actual.id });

        const nuevo = await update(a, t, { moduloId: ajeno.id });
        assertStatus(nuevo, 400, "elegir un módulo de otro departamento");
        same(nuevo.body.message, OTRO_DEPARTAMENTO, "mensaje");
        same((await getTicket(a, t.id)).modulo?.id, actual.id, "el ticket no cambió");

        // El admin le quita Técnico al módulo: el ticket de Técnico lo conserva y se sigue guardando.
        assertStatus(
          await patchModulo(actual, { departamentoIds: [redes.id] }),
          200,
          "quitar Técnico",
        );
        const guardado = await update(a, t, { titulo: "Título nuevo" });
        assertStatus(guardado, 200, "guardar con el módulo que perdió el departamento");
        same(guardado.body.modulo?.id, actual.id, "el módulo se conserva al guardar");
        same(guardado.body.titulo, "Título nuevo", "el título cambió");

        // `update` no vacía el módulo por su cuenta: solo cuando la web manda otro valor.
        const sin = await update(a, guardado.body, { moduloId: null });
        assertStatus(sin, 200, "quitar el módulo a propósito");
        same(sin.body.modulo, null, "módulo quitado a propósito");
      },
    ),

    criterion(
      11,
      "`tickets.changeDepartment` de Técnico a Redes, con un módulo que solo tiene Técnico, deja `modulo: null` y un `AuditLog` `update` con `departamento` y `modulo` en el diff. Con un módulo de Técnico y Redes, el módulo se conserva",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];

        const soloTecnico = await modulo([tecnico.id]);
        const t1 = await newTicket(a, tecnico.id, { moduloId: soloTecnico.id });
        const movido = await changeDepartment(a, t1, redes.id);
        assertStatus(movido, 200, "changeDepartment con un módulo que no se conserva");
        same(movido.body.departamento.id, redes.id, "departamento nuevo");
        same(movido.body.modulo, null, "módulo vaciado");
        const update1 = auditRows("Ticket", t1.id)
          .filter((r) => r.action === "update")
          .at(-1);
        same(
          update1.payload,
          {
            before: {
              departamento: { id: tecnico.id, nombre: "Técnico" },
              modulo: { id: soloTecnico.id, nombre: soloTecnico.nombre },
            },
            after: { departamento: { id: redes.id, nombre: "Redes" }, modulo: null },
          },
          "diff del cambio de departamento con módulo vaciado",
        );

        const ambos = await modulo([tecnico.id, redes.id]);
        const t2 = await newTicket(a, tecnico.id, { moduloId: ambos.id });
        const conservado = await changeDepartment(a, t2, redes.id);
        assertStatus(conservado, 200, "changeDepartment con un módulo que se conserva");
        same(conservado.body.modulo?.id, ambos.id, "módulo conservado");
        const update2 = auditRows("Ticket", t2.id)
          .filter((r) => r.action === "update")
          .at(-1);
        same(
          Object.keys(update2.payload.after),
          ["departamento"],
          "el diff solo trae el departamento",
        );

        // Un ticket sin módulo no cambia nada más.
        const t3 = await newTicket(a, tecnico.id);
        same((await changeDepartment(a, t3, redes.id)).body.modulo, null, "ticket sin módulo");
      },
    ),

    criterion(
      12,
      "En la web, la pestaña Módulos muestra la columna «Departamentos», y el panel no envía un módulo sin ninguna casilla tildada",
      async () => {
        vitest(
          "@syc/web",
          "tests de la administración de módulos",
          "test/catalogs/CatalogsAdmin.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      13,
      "En la web, el selector de módulo de la edición ofrece solo los módulos del departamento del ticket, y el actual que no está entre ellos se ve «(no disponible)»",
      async () => {
        vitest(
          "@syc/web",
          "tests del selector de módulo",
          "test/tickets/components/CatalogOptionSelect.test.tsx",
          "test/tickets/components/TicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      14,
      "En la web, el alta tiene el campo «Módulo», deshabilitado sin departamento, y cambiar el departamento lo vacía",
      async () => {
        vitest(
          "@syc/web",
          "tests del alta con módulo",
          "test/tickets/components/CreateTicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      15,
      "En la web, el diálogo «Cambiar departamento» de un ticket con módulo muestra el aviso con el nombre del módulo, y el de un ticket sin módulo no muestra ningún aviso",
      async () => {
        vitest(
          "@syc/web",
          "tests del diálogo de cambio de departamento",
          "test/tickets/components/ChangeDepartmentDialog.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      16,
      "En la web, el filtro «Módulo» de la bandeja de un agente de Redes ofrece solo los módulos que tienen Redes; el del admin ofrece todos",
      async () => {
        // El filtro no tiene código propio: muestra lo que devuelve `catalogs.modulos.list`, así que no
        // acota las opciones por el departamento ni por el filtro Departamento.
        const filtros = readFileSync(
          path.join(ROOT, "apps/web/src/features/tickets/components/TicketsFilters.tsx"),
          "utf8",
        );
        assert(
          !/departamentos/.test(filtros),
          "TicketsFilters recorta las opciones del filtro Módulo por departamento",
        );
        assert(
          /catalog\("modulos", "moduloId", "Módulo"\)/.test(filtros),
          "falta el filtro Módulo",
        );

        // Lo que la lista le entrega a cada rol es lo que el filtro ofrece.
        const a = await admin();
        const redes = await departmentNamed("Redes");
        const tecnico = await departmentNamed("Técnico");
        const deRedes = await modulo([redes.id]);
        const deTecnico = await modulo([tecnico.id]);
        const agente = await loggedIn(await newUser({ organizationId: redes.id }));
        const suyos = (await agente.get(MODULOS)).body.map((m) => m.id);
        assert(
          suyos.includes(deRedes.id) && !suyos.includes(deTecnico.id),
          "lista del agente de Redes",
        );
        const todos = (await a.get(MODULOS)).body.map((m) => m.id);
        assert(todos.includes(deRedes.id) && todos.includes(deTecnico.id), "lista del admin");
      },
    ),

    criterion(
      17,
      "El seed sobre una base vacía crea los módulos de `seed-data/modulos.json` con sus departamentos. Con un departamento inexistente, aborta nombrándolo y no crea módulos. Sin `modulos.json`, lo saltea con un aviso y termina bien",
      async () => {
        // 1. Con el archivo real del repo, sobre una base vacía.
        const real = readJson("seed-data/modulos.json");
        const dirReal = seedDir();
        copyFileSync(path.join(SEED_DATA, "modulos.json"), path.join(dirReal, "modulos.json"));
        const ok = emptyDb("seed_ok");
        try {
          const first = seedWith(ok, dirReal);
          assert(
            first.status === 0,
            `el seed con el modulos.json del repo falló:\n${tail(first.output)}`,
          );
          assert(
            /Módulos creados: \d+\./.test(first.output),
            `no informó los módulos:\n${tail(first.output)}`,
          );
          const expected = real
            .flatMap((m) => m.departamentos.map((d) => [m.nombre, d]))
            .sort((x, y) => x.join("|").localeCompare(y.join("|")));
          const got = moduloPairs(ok).sort((x, y) => x.join("|").localeCompare(y.join("|")));
          const norm = (s) =>
            s
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase();
          same(
            got.map(([m, d]) => `${norm(m)}|${norm(d)}`),
            expected.map(([m, d]) => `${norm(m)}|${norm(d)}`),
            "módulos y departamentos del seed",
          );
          const audits = sql(
            `SELECT count(*) FROM audit_log WHERE "entityType" = 'Modulo' AND action = 'create' AND "actorId" IS NULL`,
            ok,
          )[0][0];
          same(Number(audits), real.length, "AuditLog `create` con actorId vacío por módulo");

          // 2. El segundo seed no los toca.
          const second = seedWith(ok, dirReal);
          assert(second.status === 0, `el segundo seed falló:\n${tail(second.output)}`);
          assert(
            /Módulos: la tabla ya tenía datos/.test(second.output),
            `el segundo seed no salteó los módulos:\n${tail(second.output)}`,
          );
          same(moduloPairs(ok).length, got.length, "filas tras el segundo seed");
        } finally {
          dropDb(ok);
        }

        // 3. Un departamento inexistente aborta nombrándolo, y no crea ningún módulo.
        const bad = emptyDb("seed_bad");
        try {
          const res = seedWith(
            bad,
            seedDir([
              { nombre: "Servidores", departamentos: ["Desarrollo"] },
              { nombre: "Contabilidad", departamentos: ["Redes", "Contaduría"] },
            ]),
          );
          assert(res.status !== 0, "el seed no abortó con un departamento inexistente");
          assert(
            /Contaduría/.test(res.output),
            `el aborto no nombra el departamento:\n${tail(res.output)}`,
          );
          same(scalarIn(bad, "SELECT count(*) FROM modulo"), "0", "módulos tras el aborto");
        } finally {
          dropDb(bad);
        }

        // 4. Sin `modulos.json` lo saltea con un aviso y termina bien.
        const sin = emptyDb("seed_sin");
        try {
          const res = seedWith(sin, seedDir());
          assert(res.status === 0, `el seed sin modulos.json falló:\n${tail(res.output)}`);
          assert(
            /Módulos: no hay seed-data\/modulos\.json/.test(res.output),
            `no avisó que falta el archivo:\n${tail(res.output)}`,
          );
          same(scalarIn(sin, "SELECT count(*) FROM modulo"), "0", "módulos sin archivo");
        } finally {
          dropDb(sin);
        }
      },
    ),

    criterion(
      18,
      "`docs/prd.md` (§4.2, §5, §6, §8 y P22), `docs/checklist-permisos.md`, `docs/despliegue.md` y `bruno/` reflejan el cambio",
      async () => {
        const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

        // Bruno: los requests mandan o documentan lo nuevo.
        for (const file of ["bruno/catalogs/create.bru", "bruno/catalogs/update.bru"]) {
          assert(/departamentoIds/.test(read(file)), `${file} no manda departamentoIds`);
        }
        assert(
          /moduloDepartamentoId/.test(read("bruno/environments/local.bru")),
          "falta la variable del entorno",
        );
        assert(
          /moduloId/.test(read("bruno/tickets/create.bru")),
          "tickets/create.bru no documenta moduloId",
        );
        assert(
          /Lo usa al menos un módulo/.test(read("bruno/organizations/remove.bru")),
          "organizations/remove.bru no documenta el 409 por módulos",
        );

        // Documentación: el PRD (§4.2, §5, §6, §8, P22), el checklist y el despliegue.
        const prd = read("docs/prd.md");
        assert(
          /departamento/i.test(prd.match(/modulo[^\n]*/gi)?.join("\n") ?? ""),
          "docs/prd.md no menciona los departamentos de un módulo",
        );
        assert(
          /modulos\.json/.test(prd),
          "docs/prd.md (P22) no dice que los módulos los carga seed-data/modulos.json",
        );
        assert(
          /catalogs\.modulos\.list/.test(read("docs/checklist-permisos.md")),
          "docs/checklist-permisos.md no tiene la fila de catalogs.modulos.list",
        );
        assert(
          /SPEC 11/.test(read("docs/despliegue.md")) &&
            /modulos\.json/.test(read("docs/despliegue.md")),
          "docs/despliegue.md no tiene la sección del deploy de SPEC 11",
        );
        assert(
          /11-modulos/.test(read("specs/00-catalogo-specs.md")),
          "falta la fila de SPEC 11 en el catálogo",
        );
      },
      { infra: false },
    ),

    turboCriterion(19),
  ],
});
