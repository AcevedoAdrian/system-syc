import { copyFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { auditRows, q, same } from "../lib/audit.mjs";
import { cleanEnv } from "../lib/env.mjs";
import { admin, createItem, departmentNamed, newTicket, ticketBody } from "../lib/fixtures.mjs";
import { scalar, sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import {
  dropDb,
  emptyDb,
  MIGRATIONS,
  rowsIn,
  SEED_DATA,
  seedDir,
  seedWith,
} from "../lib/temp-db.mjs";
import { assert, assertStatus, ROOT, readJson, run, tail, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

const TIPOS = "/catalogs/tipos";
const NO_EXISTE = "El tipo de ticket no existe o está desactivado";

// Los otros siete catálogos, que no tienen descripción.
const OTROS = [
  "areas",
  "tiposArea",
  "edificios",
  "prioridades",
  "modulos",
  "proveedores",
  "estados",
];

const tipo = (extra = {}) => createItem("tipos", extra);
const patchTipo = async (t, extra) =>
  (await admin()).patch(`${TIPOS}/${t.id}`, { nombre: t.nombre, ...extra });
const listTipos = async () => {
  const res = await (await admin()).get(TIPOS);
  assertStatus(res, 200, "catalogs.tipos.list");
  return res.body;
};
const tipoEnLista = async (id) => (await listTipos()).find((t) => t.id === id);
const descripcionEnBase = (id) =>
  scalar(`SELECT coalesce("descripcion", '<null>') FROM tipo_ticket WHERE id = '${q(id)}'`);

const getTicket = async (client, id) => {
  const res = await client.get(`/tickets/${id}`);
  assertStatus(res, 200, `tickets.get ${id}`);
  return res.body;
};

const crearTicket = async (extra) =>
  (await admin()).post("/tickets", await ticketBody((await departmentNamed("Técnico")).id, extra));

// --- SPEC 12 ------------------------------------------------------------------------------------

export default defineSpec({
  id: "12",
  title: "Descripción del tipo de ticket, seed y tipo en el alta",
  infra: true,
  criteria: [
    criterion(
      1,
      "Después de `prisma migrate deploy`, la tabla `tipo_ticket` tiene la columna `descripcion` nullable, y los tipos existentes la tienen en `null`. Un segundo `migrate dev` no genera nada",
      async () => {
        const [[nullable, type]] = sql(
          `SELECT is_nullable, data_type FROM information_schema.columns
           WHERE table_name = 'tipo_ticket' AND column_name = 'descripcion'`,
        );
        same([nullable, type], ["YES", "text"], "columna tipo_ticket.descripcion");

        // La migración solo agrega la columna: sin DEFAULT ni NOT NULL, así lo que ya existía queda en null.
        const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith("_descripcion_tipo_ticket"));
        assert(dir, "no existe la migración `descripcion_tipo_ticket`");
        const statements = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"));
        same(
          statements.map((s) => s.replace(/\s+/g, " ").trim()),
          ['ALTER TABLE "tipo_ticket" ADD COLUMN "descripcion" TEXT;'],
          "SQL de la migración descripcion_tipo_ticket",
        );

        // Un tipo cargado sin descripción (como los que ya existían) queda en null en la base.
        const t = await tipo();
        same(descripcionEnBase(t.id), "<null>", "tipo sin descripción en la base");

        // `migrate dev` no genera nada si el esquema y las migraciones coinciden; `migrate diff` contra
        // la base ya migrada lo comprueba sin base sombra (los índices parciales escritos a mano
        // tampoco figuran).
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
      '`catalogs.tipos.create` con `descripcion: "Algo falló"` devuelve 200 con esa descripción, y `catalogs.tipos.list` la trae. Sin `descripcion`, o con `"   "`, devuelve `descripcion: null`',
      async () => {
        const conTexto = await tipo({ descripcion: "Algo falló" });
        same(conTexto.descripcion, "Algo falló", "descripcion al crear");
        same(
          (await tipoEnLista(conTexto.id))?.descripcion,
          "Algo falló",
          "descripcion en la lista",
        );

        const sin = await tipo();
        same(sin.descripcion, null, "sin descripción");
        same((await tipoEnLista(sin.id))?.descripcion, null, "sin descripción en la lista");

        const enBlanco = await tipo({ descripcion: "   " });
        same(enBlanco.descripcion, null, "descripción en blanco");
        same(descripcionEnBase(enBlanco.id), "<null>", "descripción en blanco en la base");
      },
    ),

    criterion(
      3,
      '`catalogs.tipos.create` con una descripción de 501 caracteres devuelve 400. Con `"  Texto  "` guarda `"Texto"`',
      async () => {
        const a = await admin();
        const antes = (await listTipos()).length;

        assertStatus(
          await a.post(TIPOS, { nombre: "Largo 501", descripcion: "a".repeat(501) }),
          400,
          "descripción de 501 caracteres",
        );
        same((await listTipos()).length, antes, "no se creó ningún tipo");
        // El límite es inclusivo: 500 se acepta.
        const limite = await tipo({ descripcion: "a".repeat(500) });
        same(limite.descripcion.length, 500, "descripción de 500 caracteres");

        const recortada = await tipo({ descripcion: "  Texto  " });
        same(recortada.descripcion, "Texto", "descripción recortada");
        same(descripcionEnBase(recortada.id), "Texto", "descripción recortada en la base");
      },
    ),

    criterion(
      4,
      "Cambiar solo la descripción de un tipo deja un `AuditLog` `update` cuyo diff tiene `descripcion` antes y después. Reenviar la misma descripción con espacios en los extremos responde 200 y no deja `AuditLog`",
      async () => {
        const t = await tipo({ descripcion: "Algo falló" });

        assertStatus(
          await patchTipo(t, { descripcion: "Dejó de funcionar" }),
          200,
          "cambiar la descripción",
        );
        let rows = auditRows("TipoTicket", t.id);
        same(
          rows.map((r) => r.action),
          ["create", "update"],
          "acciones auditadas",
        );
        same(
          rows[1].payload,
          { before: { descripcion: "Algo falló" }, after: { descripcion: "Dejó de funcionar" } },
          "diff de la edición",
        );
        same(
          rows[0].payload.after.descripcion,
          "Algo falló",
          "la foto del alta guarda la descripción",
        );

        const res = await patchTipo(t, { descripcion: "  Dejó de funcionar  " });
        assertStatus(res, 200, "reenviar con espacios");
        same(res.body.descripcion, "Dejó de funcionar", "la descripción sigue igual");
        rows = auditRows("TipoTicket", t.id);
        same(rows.length, 2, "reenviar con espacios no audita");

        // Vaciarla (ausente) la borra y lo audita.
        const vaciado = await patchTipo(t, {});
        assertStatus(vaciado, 200, "vaciar la descripción");
        same(vaciado.body.descripcion, null, "descripción vaciada");
        same(
          auditRows("TipoTicket", t.id)[2].payload,
          { before: { descripcion: "Dejó de funcionar" }, after: { descripcion: null } },
          "diff del vaciado",
        );
      },
    ),

    criterion(5, "Los otros siete catálogos no devuelven `descripcion`", async () => {
      const a = await admin();
      for (const ruta of OTROS) {
        // Una descripción de más en el alta se ignora: no se guarda ni se devuelve.
        const creado = await createItem(ruta, { descripcion: "No debería guardarse" });
        assert(!("descripcion" in creado), `${ruta}.create devuelve descripcion`);
        const res = await a.get(`/catalogs/${ruta}`);
        assertStatus(res, 200, `catalogs.${ruta}.list`);
        assert(res.body.length > 0, `${ruta}.list vacío`);
        for (const item of res.body) {
          assert(!("descripcion" in item), `${ruta}.list devuelve descripcion en ${item.id}`);
        }
      }
      // Y los tipos de ticket, en cambio, siempre la traen (null si no tienen).
      for (const item of await listTipos()) {
        assert("descripcion" in item, `tipos.list no devuelve descripcion en ${item.id}`);
      }
    }),

    criterion(
      6,
      '`tickets.create` con un `tipoId` activo devuelve 200 y `tickets.get` trae ese tipo. Con uno inexistente, eliminado o desactivado devuelve 400 "El tipo de ticket no existe o está desactivado". Sin `tipoId` devuelve 200 con tipo `null`',
      async () => {
        const a = await admin();
        const activo = await tipo();
        const t = await newTicket(a, (await departmentNamed("Técnico")).id, { tipoId: activo.id });
        same(t.tipo, { id: activo.id, nombre: activo.nombre }, "tipo al crear");
        same(
          (await getTicket(a, t.id)).tipo,
          { id: activo.id, nombre: activo.nombre },
          "tipo en tickets.get",
        );

        const desactivado = await tipo();
        assertStatus(
          await a.post(`${TIPOS}/${desactivado.id}/active`, { activo: false }),
          200,
          "desactivar el tipo",
        );
        const eliminado = await tipo();
        assertStatus(await a.delete(`${TIPOS}/${eliminado.id}`), 200, "eliminar el tipo");
        const antes = Number(scalar(`SELECT count(*) FROM ticket`));
        for (const [caso, tipoId] of [
          ["inexistente", "no-existe"],
          ["desactivado", desactivado.id],
          ["eliminado", eliminado.id],
        ]) {
          const res = await crearTicket({ tipoId });
          assertStatus(res, 400, `tipo ${caso}`);
          assert(res.text.includes(NO_EXISTE), `tipo ${caso}: mensaje inesperado: ${res.text}`);
        }
        same(Number(scalar(`SELECT count(*) FROM ticket`)), antes, "los rechazos no crean tickets");

        const sin = await newTicket(a, (await departmentNamed("Técnico")).id);
        same(sin.tipo, null, "ticket sin tipo");
        const enBlanco = await newTicket(a, (await departmentNamed("Técnico")).id, {
          tipoId: "  ",
        });
        same(enBlanco.tipo, null, "tipoId en blanco");
      },
    ),

    criterion(7, "El `AuditLog` `create` del ticket incluye el tipo cuando se mandó", async () => {
      const a = await admin();
      const activo = await tipo();
      const t = await newTicket(a, (await departmentNamed("Técnico")).id, { tipoId: activo.id });

      const [create] = auditRows("Ticket", t.id);
      same(create.action, "create", "acción auditada");
      same(create.payload.after.tipo, { id: activo.id, nombre: activo.nombre }, "tipo en la foto");

      const sin = await newTicket(a, (await departmentNamed("Técnico")).id);
      same(
        auditRows("Ticket", sin.id)[0].payload.after.tipo,
        null,
        "sin tipo, la foto lo trae en null",
      );
    }),

    // Corren los tests de los componentes de la web; no necesitan la API.
    criterion(
      8,
      "En la web, la tabla de Tipos de ticket tiene la columna «Descripción» («—» si no tiene), y el panel guarda la descripción y no envía una de más de 500 caracteres",
      async () => {
        vitest(
          "@syc/web",
          "tests de la administración de Tipos de ticket",
          "test/catalogs/CatalogTable.test.tsx",
          "test/catalogs/TipoTicketFormDialog.test.tsx",
          "test/catalogs/CatalogsAdmin.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      9,
      "En la web, el alta de ticket muestra en este orden los campos «Tipo de ticket», «Módulo», «Prioridad», «Fecha de recepción», con los dos primeros en una fila y los dos últimos en otra debajo, y «Descripción» a continuación",
      async () => {
        vitest(
          "@syc/web",
          "tests del alta con tipo",
          "test/tickets/components/CreateTicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      10,
      "En la web, elegir en el alta un tipo con descripción muestra esa descripción bajo el campo; elegir «Sin asignar» o un tipo sin descripción no muestra ayuda",
      async () => {
        vitest(
          "@syc/web",
          "tests de la ayuda del tipo",
          "test/tickets/components/CreateTicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      11,
      "En la web, el alta sin tipo ni módulo sigue creando el ticket, y con tipo lo guarda",
      async () => {
        vitest(
          "@syc/web",
          "tests del alta con y sin tipo",
          "test/tickets/components/CreateTicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      12,
      "El seed sobre una base vacía crea los tipos de `seed-data/tipos-ticket.json` con su descripción y su `AuditLog`. Con nombres repetidos, aborta nombrándolos y no crea tipos. Sin el archivo, lo saltea con un aviso y termina bien. Un segundo seed los saltea",
      async () => {
        const real = readJson("seed-data/tipos-ticket.json");
        assert(real.length > 0, "seed-data/tipos-ticket.json está vacío");

        // 1. Con el archivo real del repo, sobre una base vacía.
        const dirReal = seedDir("seed-12", {});
        copyFileSync(
          path.join(SEED_DATA, "tipos-ticket.json"),
          path.join(dirReal, "tipos-ticket.json"),
        );
        const ok = emptyDb("seed12_ok");
        try {
          const first = seedWith(ok, dirReal);
          assert(
            first.status === 0,
            `el seed con tipos-ticket.json del repo falló:\n${tail(first.output)}`,
          );
          assert(
            new RegExp(`Tipos de ticket creados: ${real.length}\\.`).test(first.output),
            `no informó los tipos de ticket:\n${tail(first.output)}`,
          );
          same(
            rowsIn(
              ok,
              `SELECT nombre, orden, coalesce(descripcion, '<null>') FROM tipo_ticket ORDER BY orden`,
            ),
            real.map((t, i) => [t.nombre, String(i + 1), t.descripcion ?? "<null>"]),
            "tipos cargados, en el orden del archivo",
          );
          const audits = rowsIn(
            ok,
            `SELECT action, coalesce("actorId", '<sistema>'), payload->'after'->>'descripcion'
               FROM audit_log WHERE "entityType" = 'TipoTicket' ORDER BY "createdAt", id`,
          );
          same(audits.length, real.length, "un AuditLog por tipo");
          for (const [i, [action, actor, descripcion]] of audits.entries()) {
            same(
              [action, actor, descripcion],
              ["create", "<sistema>", real[i].descripcion],
              `AuditLog del tipo ${i + 1}`,
            );
          }

          // 4. Un segundo seed los saltea.
          const second = seedWith(ok, dirReal);
          assert(second.status === 0, `el segundo seed falló:\n${tail(second.output)}`);
          assert(
            /Tipos de ticket: la tabla ya tenía datos, no se tocó\./.test(second.output),
            `el segundo seed no salteó los tipos:\n${tail(second.output)}`,
          );
          same(
            rowsIn(ok, `SELECT count(*) FROM tipo_ticket`),
            [[String(real.length)]],
            "sigue habiendo los mismos tipos",
          );
        } finally {
          dropDb(ok);
        }

        // 2. Con nombres repetidos (sin importar mayúsculas ni acentos), aborta y no crea tipos.
        const dup = emptyDb("seed12_dup");
        try {
          const repetidos = seedWith(
            dup,
            seedDir("seed-12-dup", {
              "tipos-ticket.json": [
                { nombre: "Instalación" },
                { nombre: "Consulta" },
                { nombre: "INSTALACION" },
              ],
            }),
          );
          assert(repetidos.status !== 0, "el seed con tipos repetidos debía abortar");
          assert(
            repetidos.output.includes('"INSTALACION"'),
            `el aborto no nombra el tipo repetido:\n${tail(repetidos.output)}`,
          );
          same(rowsIn(dup, `SELECT count(*) FROM tipo_ticket`), [["0"]], "tipos tras el aborto");
        } finally {
          dropDb(dup);
        }

        // 3. Sin el archivo, lo saltea con un aviso y termina bien.
        const sin = emptyDb("seed12_sin");
        try {
          const result = seedWith(sin, seedDir("seed-12-sin", {}));
          assert(
            result.status === 0,
            `el seed sin tipos-ticket.json falló:\n${tail(result.output)}`,
          );
          assert(
            /Tipos de ticket: no hay seed-data\/tipos-ticket\.json, no se cargaron\./.test(
              result.output,
            ),
            `no avisó que faltaba el archivo:\n${tail(result.output)}`,
          );
          same(rowsIn(sin, `SELECT count(*) FROM tipo_ticket`), [["0"]], "tipos sin el archivo");
        } finally {
          dropDb(sin);
        }
      },
    ),

    criterion(
      13,
      "`docs/prd.md`, `docs/despliegue.md`, `seed-data/README.md` y `bruno/` reflejan el cambio",
      async () => {
        const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

        // Tabla §6.1 del PRD: la fila del tipo menciona que se elige en el alta y su descripción.
        const prd = read("docs/prd.md");
        assert(
          /descripci[óo]n/i.test(prd.slice(prd.indexOf("TipoTicket"))),
          "el PRD no menciona la descripción del tipo",
        );

        const despliegue = read("docs/despliegue.md");
        assert(
          despliegue.includes("Deploy que trae la descripción del tipo de ticket (SPEC 12)"),
          "docs/despliegue.md no tiene la sección de SPEC 12",
        );

        assert(
          read("seed-data/README.md").includes("tipos-ticket.json"),
          "seed-data/README.md no documenta tipos-ticket.json",
        );

        const create = read("bruno/tickets/create.bru");
        assert(create.includes("tipoId"), "bruno/tickets/create.bru no documenta tipoId");
        for (const file of ["create", "update", "list"]) {
          assert(
            read(`bruno/catalogs/${file}.bru`).includes("descripcion"),
            `bruno/catalogs/${file}.bru no documenta descripcion`,
          );
        }
      },
      { infra: false },
    ),

    turboCriterion(14),
  ],
});
