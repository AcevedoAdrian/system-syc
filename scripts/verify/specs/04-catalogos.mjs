import { adminId, auditCount, auditRows, q, same } from "../lib/audit.mjs";
import { ADMIN, cleanEnv } from "../lib/env.mjs";
import { admin, loggedIn, newUser, uniq } from "../lib/fixtures.mjs";
import { scalar, sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, run, tail } from "../lib/util.mjs";

// Los 7 catálogos: ruta de la API y `entityType` con el que se audita.
const CATALOGOS = [
  { ruta: "areas", entityType: "Area" },
  { ruta: "edificios", entityType: "Edificio" },
  { ruta: "tipos", entityType: "TipoTicket" },
  { ruta: "prioridades", entityType: "Prioridad" },
  { ruta: "modulos", entityType: "Modulo" },
  { ruta: "proveedores", entityType: "Proveedor" },
  { ruta: "estados", entityType: "EstadoTicket" },
];

const SYSTEM_STATES = ["FINALIZADO", "CERRADO", "CANCELADO", "REABIERTO"];

const path = (ruta, id = "", suffix = "") => `/catalogs/${ruta}${id ? `/${id}` : ""}${suffix}`;

async function create(ruta, nombre) {
  const res = await (await admin()).post(path(ruta), { nombre });
  assertStatus(res, 200, `crear "${nombre}" en ${ruta}`);
  return res.body;
}

async function list(ruta, client) {
  const res = await (client ?? (await admin())).get(path(ruta));
  assertStatus(res, 200, `listar ${ruta}`);
  return res.body;
}

async function patch(ruta, id, body) {
  return (await admin()).patch(path(ruta, id), body);
}

async function setActive(ruta, id, activo) {
  return (await admin()).post(path(ruta, id, "/active"), { activo });
}

async function move(ruta, id, direccion) {
  return (await admin()).post(path(ruta, id, "/move"), { direccion });
}

async function remove(ruta, id) {
  return (await admin()).delete(path(ruta, id));
}

// Corre los tests de Vitest de la web indicados; no necesita la API.
function webTests(label, ...files) {
  const result = run("pnpm", ["--filter", "@syc/web", "exec", "vitest", "run", ...files]);
  assert(result.status === 0, `${label} falla:\n${tail(result.output, 40)}`);
}

// SPEC 04 — catálogos.
export default defineSpec({
  id: "04",
  title: "Catálogos",
  infra: true,
  criteria: [
    criterion(
      1,
      "En cada uno de los 7 catálogos, el admin crea, edita, sube, baja, desactiva, reactiva y elimina un ítem por la API. Cada paso deja un `AuditLog` con el `entityType` del catálogo, el admin como actor y el `payload` de la convención. Subir o bajar deja dos `update` con solo `orden`",
      async () => {
        const me = await adminId();
        for (const { ruta, entityType } of CATALOGOS) {
          const first = await create(ruta, `Primero ${uniq()}`);
          const second = await create(ruta, `Segundo ${uniq()}`);
          const renamed = `${second.nombre} bis`;
          assertStatus(await patch(ruta, second.id, { nombre: renamed }), 200, `${ruta}: editar`);
          assertStatus(await move(ruta, second.id, "subir"), 200, `${ruta}: subir`);
          assertStatus(await setActive(ruta, second.id, false), 200, `${ruta}: desactivar`);
          assertStatus(await setActive(ruta, second.id, true), 200, `${ruta}: reactivar`);
          assertStatus(await move(ruta, second.id, "bajar"), 200, `${ruta}: bajar`);
          assertStatus(await remove(ruta, second.id), 200, `${ruta}: eliminar`);

          const rows = auditRows(entityType, second.id);
          same(
            rows.map((r) => r.action),
            ["create", "update", "update", "update", "update", "update", "delete"],
            `${ruta}: acciones del ítem`,
          );
          assert(
            rows.every((r) => r.actorId === me),
            `${ruta}: algún registro no tiene al admin como actor`,
          );
          same(rows[0].payload.after.nombre, second.nombre, `${ruta}: alta`);
          same(
            rows[1].payload,
            { before: { nombre: second.nombre }, after: { nombre: renamed } },
            `${ruta}: edición`,
          );
          // Subir: intercambia el orden con el ítem anterior; bajar lo deja donde estaba.
          same(
            rows[2].payload,
            { before: { orden: second.orden }, after: { orden: first.orden } },
            `${ruta}: subir`,
          );
          same(
            rows[3].payload,
            { before: { activo: true }, after: { activo: false } },
            `${ruta}: desactivar`,
          );
          same(
            rows[4].payload,
            { before: { activo: false }, after: { activo: true } },
            `${ruta}: reactivar`,
          );
          same(
            rows[5].payload,
            { before: { orden: first.orden }, after: { orden: second.orden } },
            `${ruta}: bajar`,
          );
          same(rows[6].payload, {}, `${ruta}: eliminar`);

          // El vecino también deja su `update`, con solo `orden`: dos por cada movimiento.
          const neighbor = auditRows(entityType, first.id);
          same(
            neighbor.map((r) => r.action),
            ["create", "update", "update"],
            `${ruta}: acciones del vecino`,
          );
          same(
            neighbor[1].payload,
            { before: { orden: first.orden }, after: { orden: second.orden } },
            `${ruta}: el vecino al subir el otro`,
          );
          same(
            neighbor[2].payload,
            { before: { orden: second.orden }, after: { orden: first.orden } },
            `${ruta}: el vecino al bajar el otro`,
          );
          assertStatus(await remove(ruta, first.id), 200, `${ruta}: limpiar`);
        }
      },
    ),

    // Corre los tests de la pantalla; no necesita la API.
    criterion(
      2,
      "Desde `/admin/catalogos`, el admin hace lo mismo en la pestaña Áreas sin deploy, y la pestaña elegida se mantiene al recargar",
      async () => {
        webTests(
          "la pantalla de catálogos",
          "src/features/catalogs/components/CatalogsAdmin.test.tsx",
          "src/routes/_authenticated/admin/catalogos.test.ts",
        );
      },
      { infra: false },
    ),

    criterion(
      3,
      'Crear "Área Técnica" y luego "area  tecnica" en Áreas devuelve 409. Crear "Área Técnica" en Edificios funciona',
      async () => {
        const a = await admin();
        const suffix = uniq();
        await create("areas", `Área Técnica ${suffix}`);

        const dup = await a.post(path("areas"), { nombre: `area  tecnica ${suffix}` });
        assertStatus(dup, 409, "nombre repetido con otro formato");
        assert(dup.body.message === "Ya existe un área con ese nombre", dup.text);
        await create("edificios", `Área Técnica ${suffix}`);
        assertStatus(await a.post(path("areas"), { nombre: "   " }), 400, "nombre en blanco");
      },
    ),

    criterion(
      4,
      "Eliminar un ítem y crear otro con el mismo nombre funciona. El eliminado ya no aparece en `list`",
      async () => {
        const nombre = `Reusable ${uniq()}`;
        const first = await create("modulos", nombre);
        assertStatus(await remove("modulos", first.id), 200, "eliminar");

        const second = await create("modulos", nombre);
        assert(second.id !== first.id, "el segundo ítem reusó el id del eliminado");
        const ids = (await list("modulos")).map((i) => i.id);
        assert(!ids.includes(first.id), "el ítem eliminado sigue en `list`");
        assert(ids.includes(second.id), "el ítem nuevo no está en `list`");
      },
    ),

    criterion(
      5,
      "Editar, mover o eliminar un ítem ya eliminado devuelve 404. Una edición sin cambios no deja `AuditLog`",
      async () => {
        const item = await create("tipos", `Tipo ${uniq()}`);

        const before = auditCount();
        assertStatus(
          await patch("tipos", item.id, { nombre: item.nombre }),
          200,
          "edición sin cambios",
        );
        assertStatus(await setActive("tipos", item.id, true), 200, "activar sin cambios");
        assert(auditCount() === before, "una edición sin cambios dejó un `AuditLog`");
        assert(
          auditRows("TipoTicket", item.id).length === 1,
          "el ítem tiene más registros que su alta",
        );

        assertStatus(await remove("tipos", item.id), 200, "eliminar");
        assertStatus(await patch("tipos", item.id, { nombre: "Otro" }), 404, "editar eliminado");
        assertStatus(await move("tipos", item.id, "subir"), 404, "mover eliminado");
        assertStatus(await setActive("tipos", item.id, false), 404, "activar eliminado");
        assertStatus(await remove("tipos", item.id), 404, "eliminar otra vez");
        assertStatus(await patch("tipos", "no-existe", { nombre: "X" }), 404, "editar inexistente");
      },
    ),

    criterion(
      6,
      "Subir el primer ítem o bajar el último no cambia ningún `orden` ni deja `AuditLog`",
      async () => {
        await create("edificios", `Extremo ${uniq()}`);
        await create("edificios", `Extremo ${uniq()}`);
        const before = await list("edificios");
        const count = auditCount();

        const first = before[0];
        const last = before.at(-1);
        assertStatus(await move("edificios", first.id, "subir"), 200, "subir el primero");
        assertStatus(await move("edificios", last.id, "bajar"), 200, "bajar el último");

        same(await list("edificios"), before, "la lista tras mover los extremos");
        assert(auditCount() === count, "mover un extremo dejó un `AuditLog`");
      },
    ),

    criterion(
      7,
      "Eliminar Finalizado, Cerrado, Cancelado o Reabierto devuelve siempre 409. Renombrarlos o desactivarlos funciona y su `clave` no cambia",
      async () => {
        const system = (await list("estados")).filter((e) => e.clave);
        same(system.map((e) => e.clave).sort(), [...SYSTEM_STATES].sort(), "claves de sistema");

        for (const estado of system) {
          const removed = await remove("estados", estado.id);
          assertStatus(removed, 409, `eliminar ${estado.nombre}`);

          const renamed = `${estado.nombre} ${uniq()}`;
          const res = await patch("estados", estado.id, { nombre: renamed });
          assertStatus(res, 200, `renombrar ${estado.nombre}`);
          assert(res.body.clave === estado.clave, `renombrar cambió la clave de ${estado.nombre}`);
          const off = await setActive("estados", estado.id, false);
          assertStatus(off, 200, `desactivar ${estado.nombre}`);
          assert(off.body.clave === estado.clave, "desactivar cambió la clave");
          assertStatus(await setActive("estados", estado.id, true), 200, "reactivar");
          assertStatus(await remove("estados", estado.id), 409, "eliminar tras renombrar");
          assertStatus(
            await patch("estados", estado.id, { nombre: estado.nombre }),
            200,
            "devolver el nombre",
          );
        }
      },
    ),

    criterion(
      8,
      "Desactivar o eliminar el único estado activo devuelve 409, y lo mismo con la única prioridad activa. En Áreas, desactivar el último activo funciona",
      async () => {
        // Deja un solo ítem activo (uno sin `clave`, para que la regla de la clave no tape a la
        // otra), prueba las dos reglas y restaura todo.
        for (const { ruta, label } of [
          { ruta: "estados", label: "estado" },
          { ruta: "prioridades", label: "prioridad" },
        ]) {
          const items = await list(ruta);
          const keep = items.find((i) => i.activo && !i.clave);
          assert(keep, `no hay ${label} activo sin clave`);
          const others = items.filter((i) => i.activo && i.id !== keep.id);
          const deactivated = [];
          try {
            for (const other of others) {
              assertStatus(
                await setActive(ruta, other.id, false),
                200,
                `desactivar ${other.nombre}`,
              );
              deactivated.push(other.id);
            }
            const off = await setActive(ruta, keep.id, false);
            assertStatus(off, 409, `desactivar la única ${label} activa`);
            assert(
              off.body.message.includes(`última ${label} activa`) ||
                off.body.message.includes(`último ${label} activo`),
              off.text,
            );
            const del = await remove(ruta, keep.id);
            assertStatus(del, 409, `eliminar la única ${label} activa`);
            assert(del.body.message.includes(label), del.text);

            // Un ítem inactivo sí se elimina aunque quede un solo activo.
            const temp = await create(ruta, `Temporal ${uniq()}`);
            assertStatus(await setActive(ruta, temp.id, false), 200, "desactivar el temporal");
            assertStatus(
              await remove(ruta, temp.id),
              200,
              "eliminar un inactivo con un solo activo",
            );
          } finally {
            for (const id of deactivated) await setActive(ruta, id, true);
          }
        }

        // Áreas no tiene la regla: se pueden desactivar todas, incluida la última.
        await create("areas", `Área ${uniq()}`);
        const actives = (await list("areas")).filter((i) => i.activo);
        try {
          for (const area of actives) {
            assertStatus(await setActive("areas", area.id, false), 200, "desactivar un área");
          }
          assert(
            (await list("areas")).every((i) => !i.activo),
            "quedó un área activa",
          );
        } finally {
          for (const area of actives) await setActive("areas", area.id, true);
        }
      },
    ),

    criterion(
      9,
      "Un proveedor con solo el nombre se guarda con los otros 4 campos en `null`. Un correo `soporte@` o un sitio `www.x.com` devuelve 400. Editarlo con un campo en blanco lo deja en `null`",
      async () => {
        const a = await admin();
        const nombre = `Proveedor ${uniq()}`;
        const created = await create("proveedores", nombre);
        same(
          [created.contacto, created.telefono, created.correo, created.sitioWeb],
          [null, null, null, null],
          "campos opcionales del alta",
        );

        for (const [campo, valor] of [
          ["correo", "soporte@"],
          ["sitioWeb", "www.x.com"],
          ["sitioWeb", "ftp://proveedor.com"],
        ]) {
          assertStatus(
            await a.post(path("proveedores"), { nombre: `${nombre} x`, [campo]: valor }),
            400,
            `${campo} "${valor}" en el alta`,
          );
          assertStatus(
            await patch("proveedores", created.id, { nombre, [campo]: valor }),
            400,
            `${campo} "${valor}" en la edición`,
          );
        }

        const full = {
          nombre,
          contacto: " Ana ",
          telefono: "+54 11 5555-0000 int. 2",
          correo: "soporte@proveedor.com",
          sitioWeb: "https://proveedor.com",
        };
        const edited = await patch("proveedores", created.id, full);
        assertStatus(edited, 200, "editar con todos los campos");
        same(
          [edited.body.contacto, edited.body.telefono, edited.body.correo, edited.body.sitioWeb],
          ["Ana", full.telefono, full.correo, full.sitioWeb],
          "campos tras editar",
        );

        const blanked = await patch("proveedores", created.id, { ...full, correo: "  " });
        assertStatus(blanked, 200, "editar con un campo en blanco");
        same(blanked.body.correo, null, "el correo en blanco");
        same(blanked.body.telefono, full.telefono, "los otros campos siguen");
      },
    ),

    criterion(
      10,
      "Un agente recibe 403 en `create`, `update`, `move`, `setActive`, `remove` y `history` de cualquier catálogo. Su `list` responde 200 con los inactivos (`activo: false`) y sin los eliminados",
      async () => {
        const agent = await loggedIn(await newUser());
        for (const { ruta } of CATALOGOS) {
          const item = await create(ruta, `Ítem ${uniq()}`);
          assertStatus(await agent.post(path(ruta), { nombre: "X" }), 403, `${ruta}.create`);
          assertStatus(
            await agent.patch(path(ruta, item.id), { nombre: "X" }),
            403,
            `${ruta}.update`,
          );
          assertStatus(
            await agent.post(path(ruta, item.id, "/move"), { direccion: "subir" }),
            403,
            `${ruta}.move`,
          );
          assertStatus(
            await agent.post(path(ruta, item.id, "/active"), { activo: false }),
            403,
            `${ruta}.setActive`,
          );
          assertStatus(await agent.delete(path(ruta, item.id)), 403, `${ruta}.remove`);
          assertStatus(await agent.get(path(ruta, item.id, "/history")), 403, `${ruta}.history`);
          const visible = await list(ruta, agent);
          assert(
            visible.some((i) => i.id === item.id),
            `${ruta}.list no devuelve el ítem al agente`,
          );
          assertStatus(await remove(ruta, item.id), 200, `${ruta}: limpiar`);
        }

        const inactive = await create("areas", `Inactiva ${uniq()}`);
        const deleted = await create("areas", `Eliminada ${uniq()}`);
        assertStatus(await setActive("areas", inactive.id, false), 200, "desactivar");
        assertStatus(await remove("areas", deleted.id), 200, "eliminar");
        const seen = await list("areas", agent);
        assert(
          seen.find((i) => i.id === inactive.id)?.activo === false,
          "el agente no ve el ítem inactivo con `activo: false`",
        );
        assert(!seen.some((i) => i.id === deleted.id), "el agente ve un ítem eliminado");
      },
    ),

    criterion(
      11,
      "`history` de un ítem devuelve al admin sus registros del más reciente al más antiguo. Un id sin registros devuelve `[]`",
      async () => {
        const a = await admin();
        const me = await adminId();
        const item = await create("modulos", `Módulo ${uniq()}`);
        assertStatus(
          await patch("modulos", item.id, { nombre: `${item.nombre} bis` }),
          200,
          "editar",
        );
        assertStatus(await setActive("modulos", item.id, false), 200, "desactivar");
        assertStatus(await remove("modulos", item.id), 200, "eliminar");

        const res = await a.get(path("modulos", item.id, "/history"));
        assertStatus(res, 200, "history");
        same(
          res.body.map((e) => e.action),
          ["delete", "update", "update", "create"],
          "orden del historial",
        );
        assert(
          res.body.every((e) => e.actor?.id === me),
          "algún registro no tiene al admin",
        );
        const times = res.body.map((e) => Date.parse(e.createdAt));
        assert(
          times.every((t, i) => i === 0 || t <= times[i - 1]),
          "las fechas no van de la más reciente a la más antigua",
        );

        const empty = await a.get(path("modulos", "id-sin-registros", "/history"));
        assertStatus(empty, 200, "history de un id sin registros");
        same(empty.body, [], "history de un id sin registros");
      },
    ),

    criterion(
      12,
      'El seed sobre una base vacía deja los 7 estados en orden (4 con su `clave`) y Baja, Media, Alta y Urgente, con 11 `create` de `actorId` null. Correrlo otra vez, después de renombrar "Pendiente", no crea nada ni deshace el renombre',
      async () => {
        // El estado inicial se lee del `AuditLog` del seed (`actorId` null), que no cambia aunque
        // los criterios anteriores hayan editado los ítems.
        const seeded = (entityType) =>
          sql(
            `SELECT "entityId", payload::text FROM audit_log
             WHERE "entityType" = '${entityType}' AND action = 'create' AND "actorId" IS NULL`,
          )
            .map(([entityId, ...payload]) => ({
              entityId,
              after: JSON.parse(payload.join("|")).after,
            }))
            .sort((x, y) => x.after.orden - y.after.orden);

        const estados = seeded("EstadoTicket");
        const prioridades = seeded("Prioridad");
        same(
          estados.map((e) => [e.after.orden, e.after.nombre, e.after.clave]),
          [
            [1, "Pendiente", null],
            [2, "En progreso", null],
            [3, "En espera", null],
            [4, "Finalizado", "FINALIZADO"],
            [5, "Cerrado", "CERRADO"],
            [6, "Cancelado", "CANCELADO"],
            [7, "Reabierto", "REABIERTO"],
          ],
          "estados del seed",
        );
        same(
          prioridades.map((p) => [p.after.orden, p.after.nombre]),
          [
            [1, "Baja"],
            [2, "Media"],
            [3, "Alta"],
            [4, "Urgente"],
          ],
          "prioridades del seed",
        );
        assert(estados.length + prioridades.length === 11, "no son 11 `create` del sistema");

        const me = await adminId();
        for (const [table, rows] of [
          ["estado_ticket", estados],
          ["prioridad", prioridades],
        ]) {
          const owned = scalar(
            `SELECT count(*) FROM ${table} WHERE id IN (${rows.map((r) => `'${q(r.entityId)}'`).join(",")})
             AND "createdBy" = '${q(me)}'`,
          );
          assert(Number(owned) === rows.length, `${table}: createdBy no es el admin raíz`);
        }

        // Segunda corrida, con "Pendiente" renombrado: no crea nada ni deshace el renombre.
        const pendiente = estados[0].entityId;
        const renamed = `Nuevo ${uniq()}`;
        assertStatus(await patch("estados", pendiente, { nombre: renamed }), 200, "renombrar");
        const before = {
          audit: auditCount(),
          estados: scalar(`SELECT count(*) FROM estado_ticket`),
          prioridades: scalar(`SELECT count(*) FROM prioridad`),
        };
        const seedRun = run(process.execPath, ["apps/api/dist/seed.mjs"], {
          env: cleanEnv({
            SEED_ADMIN_USERNAME: ADMIN.username,
            SEED_ADMIN_PASSWORD: ADMIN.password,
            SEED_ADMIN_NAME: ADMIN.name,
          }),
        });
        assert(seedRun.status === 0, `el seed falló:\n${tail(seedRun.output)}`);

        same(auditCount(), before.audit, "registros de auditoría tras el seed");
        same(scalar(`SELECT count(*) FROM estado_ticket`), before.estados, "estados tras el seed");
        same(
          scalar(`SELECT count(*) FROM prioridad`),
          before.prioridades,
          "prioridades tras el seed",
        );
        same(
          scalar(`SELECT nombre FROM estado_ticket WHERE id = '${q(pendiente)}'`),
          renamed,
          "nombre del estado renombrado",
        );
        same(
          scalar(`SELECT count(*) FROM estado_ticket WHERE "nombreNormalizado" = 'pendiente'`),
          "0",
          'estados llamados "Pendiente" tras el seed',
        );
      },
    ),

    // Corre los tests de la tabla y del menú; no necesita la API.
    criterion(
      13,
      'En la pestaña Estados, las 4 filas de sistema muestran "De sistema" y no tienen el botón Eliminar. El link "Catálogos" no aparece para un agente',
      async () => {
        webTests(
          "la tabla de catálogos o el menú",
          "src/features/catalogs/components/CatalogTable.test.tsx",
          "src/components/layout/Sidebar.test.tsx",
        );
      },
      { infra: false },
    ),

    turboCriterion(14),
  ],
});
