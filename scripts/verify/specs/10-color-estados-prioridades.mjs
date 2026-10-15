import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditRows, same } from "../lib/audit.mjs";
import { ADMIN, cleanEnv } from "../lib/env.mjs";
import {
  admin,
  CATALOGOS_CON_COLOR,
  createItem,
  departmentNamed,
  loggedIn,
  newTicket,
  newUser,
  uniq,
} from "../lib/fixtures.mjs";
import { sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import {
  dropDb,
  freshDb,
  insertUser,
  migrationDirs,
  migrationSql,
  psqlFile,
  urlOf,
} from "../lib/temp-db.mjs";
import { assert, assertStatus, ROOT, run, tail, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

const TONOS = ["gris", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "rosa"];

// La propuesta del SPEC 10, por nombre normalizado (estados sin clave y prioridades) y por clave.
const ESTADOS = [
  { nombre: "Pendiente", clave: null, color: "azul" },
  { nombre: "En progreso", clave: null, color: "violeta" },
  { nombre: "En espera", clave: null, color: "amarillo" },
  { nombre: "Finalizado", clave: "FINALIZADO", color: "verde" },
  { nombre: "Cerrado", clave: "CERRADO", color: "gris" },
  { nombre: "Cancelado", clave: "CANCELADO", color: "rojo" },
  { nombre: "Reabierto", clave: "REABIERTO", color: "naranja" },
];
const PRIORIDADES = [
  { nombre: "Baja", color: "gris" },
  { nombre: "Media", color: "azul" },
  { nombre: "Alta", color: "naranja" },
  { nombre: "Urgente", color: "rojo" },
];

const sqlText = (value) => (value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
const normalizado = (nombre) => nombre.toLowerCase();

// `entityType` con el que se audita cada catálogo con color.
const ENTITY = { prioridades: "Prioridad", estados: "EstadoTicket" };

// Una base con todas las migraciones menos `color_estados_prioridades`, cargada con los datos del seed
// anterior (más lo que cada criterio agrega a mano), y después con la migración aplicada.
// `renombrarFinalizado` simula que el admin cambió el nombre de un estado de sistema (D1 de SPEC 04).
function baseMigrada(suffix, { renombrarFinalizado = false, extras = false } = {}) {
  const database = freshDb(suffix, { hasta: "_color_estados_prioridades" });
  insertUser(database);

  const estados = ESTADOS.map((e, i) => ({
    ...e,
    nombre: renombrarFinalizado && e.clave === "FINALIZADO" ? "Hecho" : e.nombre,
    orden: i + 1,
    eliminado: false,
  }));
  if (extras) {
    // Un estado creado a mano y uno eliminado lógicamente (la migración también lo colorea).
    estados.push({ nombre: "Esperando repuesto", clave: null, orden: 8, eliminado: false });
    estados.push({ nombre: "Pendiente", clave: null, orden: 9, eliminado: true });
  }
  const filasEstado = estados
    .map(
      (e, i) =>
        `('e${i}', ${sqlText(e.nombre)}, ${sqlText(normalizado(e.nombre))}, ${e.orden}, ${sqlText(e.clave)}, now(), 'u1', 'u1', ${e.eliminado ? "now()" : "NULL"})`,
    )
    .join(", ");
  sql(
    `INSERT INTO estado_ticket(id, nombre, "nombreNormalizado", orden, clave, "updatedAt", "createdBy", "updatedBy", "deletedAt")
     VALUES ${filasEstado}`,
    database,
  );

  const prioridades = PRIORIDADES.map((p, i) => ({ ...p, orden: i + 1 }));
  if (extras) prioridades.push({ nombre: "Crítica", orden: 5 });
  const filasPrioridad = prioridades
    .map(
      (p, i) =>
        `('p${i}', ${sqlText(p.nombre)}, ${sqlText(normalizado(p.nombre))}, ${p.orden}, now(), 'u1', 'u1')`,
    )
    .join(", ");
  sql(
    `INSERT INTO prioridad(id, nombre, "nombreNormalizado", orden, "updatedAt", "createdBy", "updatedBy")
     VALUES ${filasPrioridad}`,
    database,
  );
  return database;
}

function aplicarMigracion(database) {
  const dir = migrationDirs().find((d) => d.endsWith("_color_estados_prioridades"));
  assert(dir, "no existe la migración color_estados_prioridades");
  psqlFile(database, migrationSql(dir));
}

const getTicket = async (client, id) => {
  const res = await client.get(`/tickets/${id}`);
  assertStatus(res, 200, `tickets.get ${id}`);
  return res.body;
};

const catalogo = async (ruta, client) => {
  const res = await (client ?? (await admin())).get(`/catalogs/${ruta}`);
  assertStatus(res, 200, `catalogs.${ruta}.list`);
  return res.body;
};

// --- SPEC 10 ------------------------------------------------------------------------------------

export default defineSpec({
  id: "10",
  title: "Color de estados y prioridades",
  infra: true,
  criteria: [
    criterion(
      1,
      "Después de `prisma migrate deploy` sobre una base con los datos del seed anterior, los 7 estados y las 4 prioridades tienen la propuesta de color y no existe ninguna fila con `color` nulo",
      async () => {
        const database = baseMigrada("mig_color", { extras: true });
        try {
          aplicarMigracion(database);
          same(
            sql(
              `SELECT nombre, color FROM estado_ticket WHERE "deletedAt" IS NULL AND id < 'e7' ORDER BY orden`,
              database,
            ),
            ESTADOS.map((e) => [e.nombre, e.color]),
            "colores de los estados",
          );
          same(
            sql(
              `SELECT nombre, color FROM prioridad WHERE nombre IN ('Baja','Media','Alta','Urgente') ORDER BY orden`,
              database,
            ),
            PRIORIDADES.map((p) => [p.nombre, p.color]),
            "colores de las prioridades",
          );
          // Las filas eliminadas lógicamente también quedan coloreadas: no hay un caso especial.
          same(
            sql(`SELECT color FROM estado_ticket WHERE "deletedAt" IS NOT NULL`, database),
            [["azul"]],
            "el estado eliminado «Pendiente»",
          );
          same(
            sql(
              `SELECT (SELECT count(*) FROM estado_ticket WHERE color IS NULL) +
                      (SELECT count(*) FROM prioridad WHERE color IS NULL)`,
              database,
            ),
            [["0"]],
            "filas con color nulo",
          );
        } finally {
          dropDb(database);
        }
      },
    ),

    criterion(
      2,
      "Un estado o prioridad creado a mano antes de la migración queda en `gris`",
      async () => {
        const database = baseMigrada("mig_gris", { extras: true });
        try {
          aplicarMigracion(database);
          same(
            sql(`SELECT color FROM estado_ticket WHERE nombre = 'Esperando repuesto'`, database),
            [["gris"]],
            "estado creado a mano",
          );
          same(
            sql(`SELECT color FROM prioridad WHERE nombre = 'Crítica'`, database),
            [["gris"]],
            "prioridad creada a mano",
          );
        } finally {
          dropDb(database);
        }
      },
    ),

    criterion(
      3,
      "Un estado de sistema cuyo nombre fue cambiado conserva el color de su `clave`",
      async () => {
        const database = baseMigrada("mig_clave", { renombrarFinalizado: true });
        try {
          aplicarMigracion(database);
          same(
            sql(`SELECT nombre, color FROM estado_ticket WHERE clave = 'FINALIZADO'`, database),
            [["Hecho", "verde"]],
            "«Finalizado» renombrado a «Hecho»",
          );
        } finally {
          dropDb(database);
        }
      },
    ),

    criterion(4, "La migración no crea ningún `AuditLog`", async () => {
      const database = baseMigrada("mig_audit", { extras: true });
      try {
        const antes = sql(`SELECT count(*) FROM audit_log`, database);
        aplicarMigracion(database);
        same(sql(`SELECT count(*) FROM audit_log`, database), antes, "AuditLog tras migrar");
      } finally {
        dropDb(database);
      }
    }),

    criterion(
      5,
      "`catalogs.estados.create` y `catalogs.prioridades.create` sin `color`, o con un valor que no es uno de los 8 tonos, devuelven 400; `update` también",
      async () => {
        const a = await admin();
        for (const ruta of CATALOGOS_CON_COLOR) {
          const nombre = `Sin color ${uniq()}`;
          assertStatus(await a.post(`/catalogs/${ruta}`, { nombre }), 400, `${ruta}: sin color`);
          for (const color of ["fucsia", "Rojo", "", null]) {
            assertStatus(
              await a.post(`/catalogs/${ruta}`, { nombre, color }),
              400,
              `${ruta}: color ${JSON.stringify(color)}`,
            );
          }
          // Nada se creó con los intentos rechazados.
          assert(
            !(await catalogo(ruta)).some((i) => i.nombre === nombre),
            `${ruta}: un alta rechazada dejó el ítem`,
          );

          // `update` reemplaza todos los campos: sin `color` o con uno inválido también es 400.
          const item = await createItem(ruta, { color: "azul" });
          assertStatus(
            await a.patch(`/catalogs/${ruta}/${item.id}`, { nombre: `${item.nombre} bis` }),
            400,
            `${ruta}: editar sin color`,
          );
          assertStatus(
            await a.patch(`/catalogs/${ruta}/${item.id}`, { nombre: item.nombre, color: "fucsia" }),
            400,
            `${ruta}: editar con color inválido`,
          );
          same(
            (await catalogo(ruta)).find((i) => i.id === item.id).color,
            "azul",
            `${ruta}: el color tras los rechazos`,
          );
        }
      },
    ),

    criterion(
      6,
      "Crear y editar un estado o prioridad con `color` lo devuelve en `list`, y el `history` muestra el diff `color: { antes, despues }`",
      async () => {
        const a = await admin();
        for (const ruta of CATALOGOS_CON_COLOR) {
          const item = await createItem(ruta, { color: "azul" });
          same(item.color, "azul", `${ruta}: color del alta`);
          same(
            (await catalogo(ruta)).find((i) => i.id === item.id)?.color,
            "azul",
            `${ruta}: color en list`,
          );

          const edit = await a.patch(`/catalogs/${ruta}/${item.id}`, {
            nombre: item.nombre,
            color: "rojo",
          });
          assertStatus(edit, 200, `${ruta}: editar el color`);
          same(edit.body.color, "rojo", `${ruta}: color tras editar`);
          same(
            (await catalogo(ruta)).find((i) => i.id === item.id)?.color,
            "rojo",
            `${ruta}: color en list tras editar`,
          );

          // Cambiar solo el color deja un `update` con ese diff, y nada más.
          const history = await a.get(`/catalogs/${ruta}/${item.id}/history`);
          assertStatus(history, 200, `${ruta}: history`);
          same(history.body.length, 2, `${ruta}: registros del historial`);
          same(history.body[0].action, "update", `${ruta}: acción más reciente`);
          same(
            history.body[0].payload,
            { before: { color: "azul" }, after: { color: "rojo" } },
            `${ruta}: diff del color`,
          );
          same(history.body[1].payload.after.color, "azul", `${ruta}: el alta guarda el color`);

          // Un update que no cambia nada no genera entrada.
          const sameAgain = await a.patch(`/catalogs/${ruta}/${item.id}`, {
            nombre: item.nombre,
            color: "rojo",
          });
          assertStatus(sameAgain, 200, `${ruta}: editar sin cambios`);
          same(auditRows(ENTITY[ruta], item.id).length, 2, `${ruta}: registros tras no cambiar`);
        }
      },
    ),

    criterion(
      7,
      "Un agente recibe 403 en `create` y `update` de `estados` y `prioridades`, y 200 en `list` con `color`",
      async () => {
        const agent = await loggedIn(await newUser());
        for (const ruta of CATALOGOS_CON_COLOR) {
          const item = await createItem(ruta, { color: "verde" });
          assertStatus(
            await agent.post(`/catalogs/${ruta}`, { nombre: `X ${uniq()}`, color: "gris" }),
            403,
            `${ruta}.create`,
          );
          assertStatus(
            await agent.patch(`/catalogs/${ruta}/${item.id}`, {
              nombre: item.nombre,
              color: "rojo",
            }),
            403,
            `${ruta}.update`,
          );
          const visible = await catalogo(ruta, agent);
          assert(visible.length > 0, `${ruta}.list vacío para el agente`);
          assert(
            visible.every((i) => TONOS.includes(i.color)),
            `${ruta}.list: algún ítem sin un color válido`,
          );
          same(
            visible.find((i) => i.id === item.id)?.color,
            "verde",
            `${ruta}.list: el color que ve el agente`,
          );
        }
      },
    ),

    criterion(
      8,
      "`tickets.get`, cada fila de `tickets.list` y `tickets.changeStatus` traen `estado.color` y `prioridad.color`",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prioridad = await createItem("prioridades", { color: "rojo" });
        const destino = await createItem("estados", { color: "violeta" });
        const t = await newTicket(a, tecnico.id, { prioridadId: prioridad.id });

        const colorDelEstado = async (estadoId) =>
          (await catalogo("estados")).find((e) => e.id === estadoId).color;

        const detalle = await getTicket(a, t.id);
        same(detalle.prioridad.color, "rojo", "get: prioridad.color");
        same(detalle.estado.color, await colorDelEstado(detalle.estado.id), "get: estado.color");

        const page = await a.get(`/tickets?prioridadId=${prioridad.id}`);
        assertStatus(page, 200, "tickets.list");
        const fila = page.body.items.find((i) => i.id === t.id);
        assert(fila, "el ticket no está en la bandeja");
        same(fila.prioridad.color, "rojo", "list: prioridad.color");
        same(fila.estado.color, detalle.estado.color, "list: estado.color");

        const cambio = await a.post(`/tickets/${t.id}/status`, {
          updatedAt: detalle.updatedAt,
          estadoId: destino.id,
        });
        assertStatus(cambio, 200, "changeStatus");
        same(cambio.body.estado.color, "violeta", "changeStatus: estado.color");
        same(cambio.body.prioridad.color, "rojo", "changeStatus: prioridad.color");
      },
    ),

    criterion(
      9,
      "Cambiar el color de un estado o de una prioridad no agrega ninguna entrada al historial de los tickets que los tienen",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prioridad = await createItem("prioridades", { color: "rojo" });
        const estado = await createItem("estados", { color: "azul" });
        const t = await newTicket(a, tecnico.id, { prioridadId: prioridad.id });
        const cambio = await a.post(`/tickets/${t.id}/status`, {
          updatedAt: t.updatedAt,
          estadoId: estado.id,
        });
        assertStatus(cambio, 200, "pasar al estado");

        const historial = async () => {
          const res = await a.get(`/tickets/${t.id}/history`);
          assertStatus(res, 200, "tickets.history");
          return res.body;
        };
        const antes = await historial();
        const filasAntes = auditRows("Ticket", t.id).length;

        for (const [ruta, item] of [
          ["estados", estado],
          ["prioridades", prioridad],
        ]) {
          assertStatus(
            await a.patch(`/catalogs/${ruta}/${item.id}`, { nombre: item.nombre, color: "rosa" }),
            200,
            `recolorear ${ruta}`,
          );
        }

        same(await historial(), antes, "el historial del ticket");
        same(auditRows("Ticket", t.id).length, filasAntes, "AuditLog del ticket");
        // El color nuevo sí se ve en el ticket: sale del dato, no de la foto auditable.
        const ahora = await getTicket(a, t.id);
        same(ahora.estado.color, "rosa", "estado.color tras recolorear");
        same(ahora.prioridad.color, "rosa", "prioridad.color tras recolorear");
      },
    ),

    criterion(
      10,
      "Los otros 6 catálogos no declaran `color`: su `list` no lo devuelve y un `color` en el alta se ignora",
      async () => {
        const a = await admin();
        for (const ruta of ["areas", "tiposArea", "edificios", "tipos", "modulos", "proveedores"]) {
          const item = await createItem(ruta, { color: "rojo" });
          assert(!("color" in item), `${ruta}.create devolvió color`);
          const listed = (await catalogo(ruta)).find((i) => i.id === item.id);
          assert(listed && !("color" in listed), `${ruta}.list devolvió color`);
          assertStatus(await a.delete(`/catalogs/${ruta}/${item.id}`), 200, `${ruta}: limpiar`);
        }
      },
    ),

    criterion(
      11,
      "El seed sobre una base vacía deja los 7 estados y las 4 prioridades con la propuesta. Un `color` inválido en el archivo aborta nombrándolo y no crea ítems",
      async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "seed-10-"));
        const seedData = path.join(ROOT, "seed-data");
        for (const file of ["departamentos.json", "estados.json", "prioridades.json"]) {
          copyFileSync(path.join(seedData, file), path.join(dir, file));
        }
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

        const ok = freshDb("seed_color", { hasta: null });
        try {
          const first = seed(ok);
          assert(first.status === 0, `el seed falló:\n${tail(first.output)}`);
          same(
            sql(`SELECT nombre, color FROM estado_ticket ORDER BY orden`, ok),
            ESTADOS.map((e) => [e.nombre, e.color]),
            "estados del seed",
          );
          same(
            sql(`SELECT nombre, color FROM prioridad ORDER BY orden`, ok),
            PRIORIDADES.map((p) => [p.nombre, p.color]),
            "prioridades del seed",
          );
          // La auditoría del seed coincide con lo que quedó en la base.
          same(
            sql(
              `SELECT payload->'after'->>'color' FROM audit_log
               WHERE "entityType" = 'EstadoTicket' AND action = 'create' ORDER BY (payload->'after'->>'orden')::int`,
              ok,
            ),
            ESTADOS.map((e) => [e.color]),
            "color en el AuditLog del seed",
          );
        } finally {
          dropDb(ok);
        }

        const bad = freshDb("seed_color_bad", { hasta: null });
        try {
          const estados = JSON.parse(readFileSync(path.join(dir, "estados.json"), "utf8"));
          estados[2].color = "fucsia";
          writeFileSync(path.join(dir, "estados.json"), JSON.stringify(estados));
          const res = seed(bad);
          assert(res.status !== 0, "el seed no abortó con un color inválido");
          assert(
            res.output.includes("fucsia") && res.output.includes("estados.json"),
            `el error no nombra el archivo y el color:\n${tail(res.output)}`,
          );
          assert(
            res.output.includes(estados[2].nombre),
            `el error no nombra el ítem:\n${tail(res.output)}`,
          );
          same(sql(`SELECT count(*) FROM estado_ticket`, bad), [["0"]], "estados tras el aborto");
          same(sql(`SELECT count(*) FROM prioridad`, bad), [["0"]], "prioridades tras el aborto");
        } finally {
          dropDb(bad);
        }
      },
    ),

    criterion(
      12,
      "En la web, la tabla de Estados y de Prioridades muestra la columna «Color» con el nombre del color, y la de Edificios no la tiene",
      async () => {
        vitest(
          "@syc/web",
          "la tabla de catálogos",
          "src/features/catalogs/components/CatalogTable.test.tsx",
          "src/features/catalogs/components/CatalogsAdmin.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      13,
      "En la web, el alta de un estado sin tocar el color manda «Gris»; elegir «Rojo» en el desplegable lo manda y la tabla lo refleja",
      async () => {
        vitest(
          "@syc/web",
          "el formulario de catálogos y el selector de tono",
          "src/features/catalogs/components/CatalogsAdmin.test.tsx",
          "src/features/catalogs/components/TonoSelect.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      14,
      "En la web, la bandeja y el encabezado del detalle muestran estado y prioridad con la insignia del color del ítem, y el nombre va dentro de la insignia",
      async () => {
        vitest(
          "@syc/web",
          "la bandeja y el detalle del ticket",
          "src/features/tickets/components/TicketsList.test.tsx",
          "src/features/tickets/components/TicketDetail.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      15,
      "En la web, los desplegables de estado y prioridad (filtros, alta, edición y cambio de estado) muestran las opciones con su insignia, y el valor actual desactivado conserva «(inactivo)»",
      async () => {
        vitest(
          "@syc/web",
          "los desplegables de estado y prioridad",
          "src/features/tickets/components/CatalogOptionSelect.test.tsx",
          "src/features/tickets/components/TicketsFilters.test.tsx",
          "src/features/tickets/components/ChangeStatusDialog.test.tsx",
          "src/features/tickets/components/TicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      16,
      "`pnpm lint` no encuentra colores sueltos: todo sale de los tokens `tono-*`",
      async () => {
        const result = run("pnpm", ["lint"]);
        assert(result.status === 0, `pnpm lint falla:\n${tail(result.output, 30)}`);
        assert(
          result.output.includes("sin colores sueltos"),
          `el chequeo de colores no corrió:\n${tail(result.output)}`,
        );
      },
      { infra: false },
    ),

    turboCriterion(17),
  ],
});
