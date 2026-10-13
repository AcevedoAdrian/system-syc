import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { adminId, auditRows, same } from "../lib/audit.mjs";
import { ADMIN, cleanEnv, DB_NAME, PG } from "../lib/env.mjs";
import {
  admin,
  createItem,
  loggedIn,
  newDepartment,
  newTicket,
  newUser,
  uniq,
} from "../lib/fixtures.mjs";
import { sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, ROOT, run, tail, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

const TIPOS = "/catalogs/tiposArea";
const AREAS = "/catalogs/areas";

const tipo = (nombre) => createItem("tiposArea", { nombre: `${nombre} ${uniq()}` });
const area = (tipoId, nombre = `Área ${uniq()}`) => createItem("areas", { nombre, tipoId });

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
  fechaRecepcion: t.fechaRecepcion,
  fechaCierre: t.fechaCierre,
  fechaReabierto: t.fechaReabierto,
  solucionDescripcion: t.solucionDescripcion,
  notificado: t.notificado,
  ...extra,
});
const update = (client, t, extra) => client.put(`/tickets/${t.id}`, editBody(t, extra));

async function inbox(client, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  const res = await client.get(`/tickets?${query}`);
  assertStatus(res, 200, `tickets.list ?${query}`);
  return res.body;
}
const idsOf = (page) => page.items.map((t) => t.id).sort();

// --- Bases temporales propias (migración y seed) ------------------------------------------------

const MIGRATIONS = path.join(ROOT, "packages/db/migrations");
const migrationDirs = () =>
  readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

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

// Una base nueva con las migraciones anteriores a `tipos_area` (o con todas, `hasta` = null).
function freshDb(suffix, { hasta }) {
  const database = `${DB_NAME}_${suffix}`;
  sql(`CREATE DATABASE "${database}"`, "postgres");
  for (const dir of migrationDirs()) {
    if (hasta && dir.endsWith(hasta)) break;
    psqlFile(database, readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8"));
  }
  return database;
}

// --- SPEC 08 ------------------------------------------------------------------------------------

export default defineSpec({
  id: "08",
  title: "Tipos de área",
  infra: true,
  criteria: [
    criterion(
      1,
      "Después de `prisma migrate deploy` sobre una base con áreas, cada área tiene `tipoId` = «Otro», sus nombres no cambiaron y existe exactamente un tipo de área",
      async () => {
        const database = freshDb("mig_con", { hasta: "_tipos_area" });
        try {
          sql(
            `INSERT INTO "user"(id, name, email, "emailVerified", "createdAt", "updatedAt", username)
             VALUES ('u1', 'x', 'x@x.test', true, now(), now(), 'x')`,
            database,
          );
          sql(
            `INSERT INTO area(id, nombre, "nombreNormalizado", orden, "updatedAt", "createdBy", "updatedBy")
             VALUES ('a1', 'Dip. Acosta', 'dip. acosta', 2, now(), 'u1', 'u1'),
                    ('a2', 'Dir. Logística', 'dir. logistica', 1, now(), 'u1', 'u1')`,
            database,
          );
          sql(`UPDATE area SET "deletedAt" = now() WHERE id = 'a2'`, database);

          const tiposAreaDir = migrationDirs().find((d) => d.endsWith("_tipos_area"));
          psqlFile(
            database,
            readFileSync(path.join(MIGRATIONS, tiposAreaDir, "migration.sql"), "utf8"),
          );

          same(
            sql(`SELECT count(*) FROM tipo_area`, database),
            [["1"]],
            "tipos de área tras migrar",
          );
          same(
            sql(
              `SELECT a.nombre, t.nombre FROM area a JOIN tipo_area t ON t.id = a."tipoId" ORDER BY a.id`,
              database,
            ),
            [
              ["Dip. Acosta", "Otro"],
              ["Dir. Logística", "Otro"], // también las eliminadas
            ],
            "áreas tras migrar",
          );
          same(
            sql(
              `SELECT count(*) FROM audit_log WHERE "entityType" = 'TipoArea' AND "actorId" IS NULL AND action = 'create'`,
              database,
            ),
            [["1"]],
            "AuditLog de «Otro»",
          );
        } finally {
          dropDb(database);
        }
      },
    ),

    criterion(2, "Sobre una base sin áreas, la migración no crea ningún tipo de área", async () => {
      const database = freshDb("mig_sin", { hasta: null });
      try {
        same(sql(`SELECT count(*) FROM tipo_area`, database), [["0"]], "tipos de área");
        same(
          sql(`SELECT count(*) FROM audit_log WHERE "entityType" = 'TipoArea'`, database),
          [["0"]],
          "AuditLog de TipoArea",
        );
      } finally {
        dropDb(database);
      }
    }),

    criterion(
      3,
      'El admin crea, edita, sube, baja, desactiva, reactiva y elimina un tipo de área por la API, y cada paso deja su `AuditLog` con `entityType: "TipoArea"`',
      async () => {
        const a = await admin();
        const me = await adminId();
        const first = await tipo("Primero");
        const second = await tipo("Segundo");
        const renamed = `${second.nombre} bis`;

        assertStatus(await a.patch(`${TIPOS}/${second.id}`, { nombre: renamed }), 200, "editar");
        assertStatus(
          await a.post(`${TIPOS}/${second.id}/move`, { direccion: "subir" }),
          200,
          "subir",
        );
        assertStatus(
          await a.post(`${TIPOS}/${second.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(
          await a.post(`${TIPOS}/${second.id}/active`, { activo: true }),
          200,
          "reactivar",
        );
        assertStatus(
          await a.post(`${TIPOS}/${second.id}/move`, { direccion: "bajar" }),
          200,
          "bajar",
        );
        assertStatus(await a.delete(`${TIPOS}/${second.id}`), 200, "eliminar");

        const rows = auditRows("TipoArea", second.id);
        same(
          rows.map((r) => r.action),
          ["create", "update", "update", "update", "update", "update", "delete"],
          "acciones del tipo",
        );
        assert(
          rows.every((r) => r.actorId === me),
          "algún registro no tiene al admin como actor",
        );
        same(
          rows[1].payload,
          { before: { nombre: second.nombre }, after: { nombre: renamed } },
          "edición",
        );
        assertStatus(await a.delete(`${TIPOS}/${first.id}`), 200, "limpiar");
      },
    ),

    criterion(
      4,
      "Un agente recibe 403 en `create`, `update`, `move`, `setActive`, `remove` y `history` de `tiposArea`, y 200 en `list`",
      async () => {
        const agent = await loggedIn(await newUser());
        const item = await tipo("Para agente");
        assertStatus(await agent.post(TIPOS, { nombre: "X" }), 403, "create");
        assertStatus(await agent.patch(`${TIPOS}/${item.id}`, { nombre: "X" }), 403, "update");
        assertStatus(
          await agent.post(`${TIPOS}/${item.id}/move`, { direccion: "subir" }),
          403,
          "move",
        );
        assertStatus(
          await agent.post(`${TIPOS}/${item.id}/active`, { activo: false }),
          403,
          "setActive",
        );
        assertStatus(await agent.delete(`${TIPOS}/${item.id}`), 403, "remove");
        assertStatus(await agent.get(`${TIPOS}/${item.id}/history`), 403, "history");
        const list = await agent.get(TIPOS);
        assertStatus(list, 200, "list");
        assert(
          list.body.some((t) => t.id === item.id),
          "el agente no ve el tipo en `list`",
        );
        assertStatus(await (await admin()).delete(`${TIPOS}/${item.id}`), 200, "limpiar");
      },
    ),

    criterion(
      5,
      "Eliminar un tipo con un área no eliminada devuelve 409. Después de eliminar esa área, eliminar el tipo devuelve 200",
      async () => {
        const a = await admin();
        const t = await tipo("Con área");
        const ar = await area(t.id);

        const blocked = await a.delete(`${TIPOS}/${t.id}`);
        assertStatus(blocked, 409, "eliminar un tipo con un área");
        same(
          blocked.body.message,
          "Lo usa al menos un área: desactivalo en lugar de eliminarlo",
          "mensaje del 409",
        );
        assertStatus(await a.delete(`${AREAS}/${ar.id}`), 200, "eliminar el área");
        assertStatus(await a.delete(`${TIPOS}/${t.id}`), 200, "eliminar el tipo sin áreas");
      },
    ),

    criterion(
      6,
      "Crear un área sin `tipoId` devuelve 400. Con un `tipoId` inexistente o desactivado, también 400",
      async () => {
        const a = await admin();
        const t = await tipo("Inactivo");
        assertStatus(await a.post(AREAS, { nombre: `Sin tipo ${uniq()}` }), 400, "sin tipoId");
        assertStatus(
          await a.post(AREAS, { nombre: `Fantasma ${uniq()}`, tipoId: "no-existe" }),
          400,
          "tipoId inexistente",
        );
        assertStatus(
          await a.post(`${TIPOS}/${t.id}/active`, { activo: false }),
          200,
          "desactivar el tipo",
        );
        const res = await a.post(AREAS, { nombre: `Desactivado ${uniq()}`, tipoId: t.id });
        assertStatus(res, 400, "tipoId desactivado");
        same(res.body.message, "El tipo de área no existe o está desactivado", "mensaje del 400");
      },
    ),

    criterion(
      7,
      "«Gonzalez» se crea bajo Diputado y bajo Bloque. Un segundo «gonzález» bajo Diputado devuelve 409",
      async () => {
        const a = await admin();
        const [diputado, bloque] = [await tipo("Diputado"), await tipo("Bloque")];
        await area(diputado.id, "Gonzalez");
        await area(bloque.id, "Gonzalez");
        const dup = await a.post(AREAS, { nombre: "gonzález", tipoId: diputado.id });
        assertStatus(dup, 409, "mismo nombre en el mismo tipo");
        same(dup.body.message, "Ya existe un área con ese nombre en ese tipo", "mensaje del 409");
      },
    ),

    criterion(
      8,
      "Renombrar un área cuyo tipo está desactivado, sin cambiarle el tipo, devuelve 200",
      async () => {
        const a = await admin();
        const t = await tipo("Se desactiva");
        const ar = await area(t.id);
        assertStatus(
          await a.post(`${TIPOS}/${t.id}/active`, { activo: false }),
          200,
          "desactivar el tipo",
        );

        const nombre = `${ar.nombre} renombrada`;
        const res = await a.patch(`${AREAS}/${ar.id}`, { nombre, tipoId: t.id });
        assertStatus(res, 200, "renombrar con el tipo desactivado");
        same(res.body.nombre, nombre, "nombre tras renombrar");
        same(res.body.tipo.id, t.id, "el tipo no cambió");
      },
    ),

    criterion(
      9,
      "Cambiar el tipo de un área deja un `update` cuyo diff tiene `tipo` antes y después como `{ id, nombre }`",
      async () => {
        const a = await admin();
        const [antes, despues] = [await tipo("Antes"), await tipo("Después")];
        const ar = await area(antes.id);

        assertStatus(
          await a.patch(`${AREAS}/${ar.id}`, { nombre: ar.nombre, tipoId: despues.id }),
          200,
          "cambiar el tipo",
        );
        const rows = auditRows("Area", ar.id);
        same(
          rows.map((r) => r.action),
          ["create", "update"],
          "acciones del área",
        );
        same(
          rows[1].payload,
          {
            before: { tipo: { id: antes.id, nombre: antes.nombre } },
            after: { tipo: { id: despues.id, nombre: despues.nombre } },
          },
          "diff del cambio de tipo",
        );
      },
    ),

    criterion(
      10,
      "`catalogs.areas.list` devuelve cada área con `tipo: { id, nombre }`",
      async () => {
        const t = await tipo("Para list");
        const ar = await area(t.id);
        const res = await (await admin()).get(AREAS);
        assertStatus(res, 200, "catalogs.areas.list");
        assert(res.body.length > 0, "la lista está vacía");
        for (const item of res.body) {
          assert(
            typeof item.tipo?.id === "string" && typeof item.tipo?.nombre === "string",
            `el área ${item.nombre} no trae tipo: ${JSON.stringify(item)}`,
          );
        }
        same(
          res.body.find((i) => i.id === ar.id).tipo,
          { id: t.id, nombre: t.nombre },
          "tipo del área",
        );
      },
    ),

    criterion(11, "`tickets.get` y cada fila de `tickets.list` traen `area.tipo`", async () => {
      const a = await admin();
      const dept = await newDepartment();
      const t = await tipo("Para ticket");
      const ar = await area(t.id);
      const ticket = await newTicket(a, dept.id);
      assertStatus(await update(a, ticket, { areaId: ar.id }), 200, "asignar el área");

      const esperado = { id: ar.id, nombre: ar.nombre, tipo: { id: t.id, nombre: t.nombre } };
      same((await getTicket(a, ticket.id)).area, esperado, "area en tickets.get");
      const page = await inbox(a, { departamentoId: dept.id });
      same(page.items.find((i) => i.id === ticket.id).area, esperado, "area en tickets.list");
    }),

    criterion(
      12,
      "Asignar un área a un ticket deja en su historial el área como «Tipo · Nombre»",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const t = await tipo("Diputado");
        const ar = await area(t.id, "Acosta");
        const ticket = await newTicket(a, dept.id);
        assertStatus(await update(a, ticket, { areaId: ar.id }), 200, "asignar el área");

        const history = await a.get(`/tickets/${ticket.id}/history`);
        assertStatus(history, 200, "tickets.history");
        const entry = history.body.find((e) => e.action === "update");
        same(
          entry.payload.after.area,
          { id: ar.id, nombre: `${t.nombre} · Acosta` },
          "área en el historial",
        );
      },
    ),

    criterion(
      13,
      "`tickets.list` con `tipoAreaId` devuelve solo los tickets cuya área es de ese tipo. Combinado con un `areaId` de otro tipo, devuelve una página vacía",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const [t1, t2] = [await tipo("Uno"), await tipo("Dos")];
        const [a1, a2] = [await area(t1.id), await area(t2.id)];
        const [x, y, sinArea] = [
          await newTicket(a, dept.id),
          await newTicket(a, dept.id),
          await newTicket(a, dept.id),
        ];
        assertStatus(await update(a, x, { areaId: a1.id }), 200, "área del tipo 1");
        assertStatus(await update(a, y, { areaId: a2.id }), 200, "área del tipo 2");

        const en = async (label, params, esperados) =>
          same(
            idsOf(await inbox(a, { departamentoId: dept.id, ...params })),
            esperados.map((t) => t.id).sort(),
            label,
          );
        await en("tipo 1", { tipoAreaId: t1.id }, [x]);
        await en("tipo 2", { tipoAreaId: t2.id }, [y]);
        await en("tipo 1 y su área", { tipoAreaId: t1.id, areaId: a1.id }, [x]);
        await en("tipo 1 con un área de otro tipo", { tipoAreaId: t1.id, areaId: a2.id }, []);
        await en("un tipo inexistente", { tipoAreaId: "no-existe" }, []);
        await en("sin filtro de tipo", {}, [x, y, sinArea]);
      },
    ),

    criterion(
      14,
      "Desactivar un tipo no saca a sus áreas activas del selector de área del ticket",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const t = await tipo("Se desactiva");
        const ar = await area(t.id);
        assertStatus(
          await a.post(`${TIPOS}/${t.id}/active`, { activo: false }),
          200,
          "desactivar el tipo",
        );

        // El selector se arma con `catalogs.areas.list`: el área sigue activa y con su tipo.
        const listed = (await a.get(AREAS)).body.find((i) => i.id === ar.id);
        same([listed.activo, listed.tipo.id], [true, t.id], "el área en `list`");
        // Y el ticket la acepta, porque es "referencia válida" (activa).
        const ticket = await newTicket(a, dept.id);
        assertStatus(
          await update(a, ticket, { areaId: ar.id }),
          200,
          "asignar un área de un tipo desactivado",
        );
      },
    ),

    // Corren los tests de los componentes de la web; no necesitan la API.
    criterion(
      15,
      "En la web, el selector de área del ticket muestra las áreas agrupadas bajo títulos por tipo, y el valor elegido se ve como «Diputado · Acosta»",
      async () => {
        vitest(
          "@syc/web",
          "el selector de área agrupado",
          "src/features/tickets/components/CatalogOptionSelect.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      16,
      "En la web, la columna Área de la bandeja muestra «Tipo · Nombre», y recargar `/tickets?tipoAreaId=<id>` conserva el filtro",
      async () => {
        vitest(
          "@syc/web",
          "la bandeja y sus filtros",
          "src/features/tickets/components/TicketsList.test.tsx",
          "src/features/tickets/components/TicketsFilters.test.tsx",
          "src/features/tickets/tickets-search.test.ts",
          "src/routes/_authenticated/tickets/index.test.ts",
        );
      },
      { infra: false },
    ),

    criterion(
      17,
      "En la web, la pestaña Áreas muestra la columna Tipo, y el alta de un área sin tipo no se envía",
      async () => {
        vitest(
          "@syc/web",
          "la administración de catálogos",
          "src/features/catalogs/components/CatalogsAdmin.test.tsx",
          "src/features/catalogs/components/CatalogTable.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      18,
      "El seed sobre una base vacía con `tipos-area.json` y `areas.example.json` crea los tipos y las áreas con su tipo. Con un tipo que no existe en `areas.json`, aborta nombrándolo y no crea áreas",
      async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "seed-08-"));
        const seedData = path.join(ROOT, "seed-data");
        for (const file of [
          "departamentos.json",
          "estados.json",
          "prioridades.json",
          "tipos-area.json",
        ]) {
          copyFileSync(path.join(seedData, file), path.join(dir, file));
        }
        copyFileSync(path.join(seedData, "areas.example.json"), path.join(dir, "areas.json"));
        const tiposEsperados = JSON.parse(readFileSync(path.join(dir, "tipos-area.json"), "utf8"));
        const areasEjemplo = JSON.parse(readFileSync(path.join(dir, "areas.json"), "utf8"));

        const seed = (database) =>
          run(process.execPath, ["apps/api/dist/seed.mjs"], {
            env: cleanEnv({
              DATABASE_URL: urlOf(database),
              SEED_DATA_DIR: dir,
              SEED_ADMIN_USERNAME: ADMIN.username,
              SEED_ADMIN_PASSWORD: ADMIN.password,
              SEED_ADMIN_NAME: ADMIN.name,
            }),
          });
        const empty = (suffix) => {
          const database = `${DB_NAME}_${suffix}`;
          sql(`CREATE DATABASE "${database}"`, "postgres");
          const migrate = run(
            "pnpm",
            ["--filter", "@syc/db", "exec", "prisma", "migrate", "deploy"],
            {
              env: cleanEnv({ DATABASE_URL: urlOf(database) }),
            },
          );
          assert(migrate.status === 0, `migrate deploy falló:\n${tail(migrate.output)}`);
          return database;
        };

        const ok = empty("seed_ok");
        try {
          const run1 = seed(ok);
          assert(run1.status === 0, `el seed falló:\n${tail(run1.output)}`);
          same(
            sql(`SELECT nombre FROM tipo_area ORDER BY orden`, ok).map((r) => r[0]),
            tiposEsperados,
            "tipos de área del seed",
          );
          same(
            sql(
              `SELECT a.nombre, t.nombre FROM area a JOIN tipo_area t ON t.id = a."tipoId" ORDER BY a.orden`,
              ok,
            ),
            areasEjemplo.map((x) => [x.nombre, x.tipo]),
            "áreas del seed con su tipo",
          );
        } finally {
          dropDb(ok);
        }

        const bad = empty("seed_bad");
        try {
          writeFileSync(
            path.join(dir, "areas.json"),
            JSON.stringify([{ tipo: "Tipo Inexistente", nombre: "X" }, ...areasEjemplo]),
          );
          const res = seed(bad);
          assert(res.status !== 0, "el seed no abortó con un tipo inexistente");
          assert(
            res.output.includes("Tipo Inexistente"),
            `el error no nombra el tipo:\n${tail(res.output)}`,
          );
          same(sql(`SELECT count(*) FROM area`, bad), [["0"]], "áreas creadas tras el aborto");
        } finally {
          dropDb(bad);
        }
      },
    ),

    turboCriterion(19),
  ],
});
