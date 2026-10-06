import { existsSync } from "node:fs";
import path from "node:path";
import { adminId, auditRows, same } from "../lib/audit.mjs";
import {
  admin,
  departmentNamed,
  loggedIn,
  newDepartment,
  newTicket,
  newUser,
  ticketBody,
  uniq,
} from "../lib/fixtures.mjs";
import { sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, ROOT, run, tail } from "../lib/util.mjs";

// --- Fechas en hora de Argentina (la misma regla que el contrato) -----------------------------

// "YYYY-MM-DD" de hoy más `days` días, en America/Argentina/Buenos_Aires.
function day(days = 0) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// --- Ayudas ------------------------------------------------------------------------------------

const catalog = async (ruta) => {
  const res = await (await admin()).get(`/catalogs/${ruta}`);
  assertStatus(res, 200, `catalogs.${ruta}.list`);
  return res.body;
};

async function createItem(ruta, extra = {}) {
  const res = await (await admin()).post(`/catalogs/${ruta}`, {
    nombre: `${ruta} ${uniq()}`,
    ...extra,
  });
  assertStatus(res, 200, `crear en ${ruta}`);
  return res.body;
}

// Los estados de sistema se buscan por `clave`: el nombre puede haberlo cambiado el admin.
async function estadoDe(clave) {
  const found = (await catalog("estados")).find((e) => e.clave === clave);
  assert(found, `no existe el estado con clave ${clave} (¿corrió el seed?)`);
  return found;
}

// Un estado activo sin clave (Pendiente, En progreso, En espera).
async function estadoLibre(exceptId) {
  const found = (await catalog("estados")).find(
    (e) => e.clave === null && e.activo && e.id !== exceptId,
  );
  assert(found, "no hay un estado sin clave activo");
  return found;
}

async function proveedor() {
  return createItem("proveedores");
}

const get = async (client, id) => {
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
const changeStatus = (client, t, extra) =>
  client.post(`/tickets/${t.id}/status`, { updatedAt: t.updatedAt, ...extra });
const changeDepartment = (client, t, departamentoId) =>
  client.post(`/tickets/${t.id}/department`, { updatedAt: t.updatedAt, departamentoId });

// Una referencia externa que no se repite entre corridas.
const referencia = () => `${10 + Math.floor(Math.random() * 90000)}/2026`;

const auditActions = (ticketId) => auditRows("Ticket", ticketId).map((r) => r.action);

// Corre los tests de Vitest de un paquete; no necesita la API.
function vitest(filter, label, ...files) {
  const result = run("pnpm", ["--filter", filter, "exec", "vitest", "run", ...files]);
  assert(result.status === 0, `${label} falla:\n${tail(result.output, 40)}`);
}

// SPEC 05 — tickets núcleo.
export default defineSpec({
  id: "05",
  title: "Tickets núcleo",
  infra: true,
  criteria: [
    criterion(
      1,
      "Un agente crea un ticket sin poder elegir departamento; el ticket queda en el suyo",
      async () => {
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const client = await loggedIn(await newUser({ organizationId: tecnico.id }));

        const created = await newTicket(client, tecnico.id);
        same(created.departamento.id, tecnico.id, "departamento del ticket");
        same(
          (await get(client, created.id)).departamento.id,
          tecnico.id,
          "se lee en su departamento",
        );

        // El departamento de otro, o ninguno, es un payload manipulado: 403.
        assertStatus(
          await client.post("/tickets", await ticketBody(redes.id)),
          403,
          "crear en otro departamento",
        );
        const sinDepartamento = await ticketBody(tecnico.id);
        delete sinDepartamento.departamentoId;
        assertStatus(await client.post("/tickets", sinDepartamento), 403, "crear sin departamento");
      },
    ),

    criterion(
      2,
      "El admin crea un ticket en cualquier departamento activo; en uno desactivado devuelve 409, y un agente de ese departamento también",
      async () => {
        const a = await admin();
        for (const nombre of ["Técnico", "Redes", "Administrativo"]) {
          const dept = await departmentNamed(nombre);
          const t = await newTicket(a, dept.id);
          same(t.departamento.id, dept.id, `ticket del admin en ${nombre}`);
        }

        const dept = await newDepartment("Desactivado");
        const agente = await loggedIn(await newUser({ organizationId: dept.id }));
        assertStatus(
          await a.post(`/organizations/${dept.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        assertStatus(
          await a.post("/tickets", await ticketBody(dept.id)),
          409,
          "admin en desactivado",
        );
        assertStatus(
          await agente.post("/tickets", await ticketBody(dept.id)),
          409,
          "agente en desactivado",
        );
      },
    ),

    criterion(
      3,
      "Un ticket nace en el primer estado activo por `orden`, sin que el alta lo pregunte, con `notificado: false`, área, edificio, tipo y módulo sin asignar, y un `AuditLog` `create` del usuario",
      async () => {
        const tecnico = await departmentNamed("Técnico");
        const user = await newUser({ organizationId: tecnico.id });
        const client = await loggedIn(user);
        const primero = (await catalog("estados")).find((e) => e.activo);

        const t = await newTicket(client, tecnico.id);

        same(t.estado.id, primero.id, "estado inicial");
        same(
          [t.notificado, t.area, t.edificio, t.tipo, t.modulo, t.fechaCierre, t.fechaReabierto],
          [false, null, null, null, null, null, null],
          "valores iniciales",
        );
        const [row, ...resto] = auditRows("Ticket", t.id);
        same([row.action, row.actorId, resto.length], ["create", user.id, 0], "auditoría del alta");
        same(
          row.payload.after.estado,
          { id: primero.id, nombre: primero.nombre },
          "estado auditado",
        );
        same(row.payload.after.numero, t.numero, "número auditado");
      },
    ),

    criterion(
      4,
      "Dos tickets creados en paralelo reciben números distintos, nunca repetidos; `TE-000013` y `TE-1000000` se formatean como corresponde",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const body = await ticketBody(tecnico.id);
        const results = await Promise.all(
          Array.from({ length: 20 }, () => a.post("/tickets", body)),
        );
        for (const res of results) assertStatus(res, 200, "alta en paralelo");

        const numeros = results.map((r) => r.body.numero);
        assert(new Set(numeros).size === 20, `números repetidos: ${numeros.join(",")}`);
        assert(
          numeros.every((n) => Number.isInteger(n) && n > 0),
          "algún número no es un entero positivo",
        );
        vitest("@syc/contracts", "El formato del número", "src/tickets.spec.ts");
      },
    ),

    criterion(
      5,
      "Una fecha de recepción futura (hora de Argentina) devuelve 400; hoy funciona",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");

        assertStatus(
          await a.post("/tickets", await ticketBody(tecnico.id, { fechaRecepcion: day(1) })),
          400,
          "mañana",
        );
        assertStatus(
          await a.post("/tickets", await ticketBody(tecnico.id, { fechaRecepcion: day(0) })),
          200,
          "hoy",
        );
        assertStatus(
          await a.post("/tickets", await ticketBody(tecnico.id, { fechaRecepcion: day(-1) })),
          200,
          "ayer",
        );
      },
    ),

    criterion(
      6,
      "Cargar `referenciaExterna` sin `proveedorId` devuelve 400; `019092/2026` se guarda como `19092/2026` y `000/2026` devuelve 400",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prov = await proveedor();

        assertStatus(
          await a.post("/tickets", await ticketBody(tecnico.id, { referenciaExterna: "1/2026" })),
          400,
          "referencia sin proveedor",
        );
        const t = await newTicket(a, tecnico.id, {
          proveedorId: prov.id,
          referenciaExterna: "019092/2026",
        });
        same(t.referenciaExterna, "19092/2026", "referencia normalizada");
        for (const invalida of ["000/2026", "5/1999", "abc", "19092"]) {
          assertStatus(
            await a.post(
              "/tickets",
              await ticketBody(tecnico.id, { proveedorId: prov.id, referenciaExterna: invalida }),
            ),
            400,
            `referencia ${invalida}`,
          );
        }
      },
    ),

    criterion(
      7,
      "Dos tickets con el mismo proveedor y la misma `referenciaExterna` (no eliminados): el segundo devuelve 409. Con otro proveedor funciona, y después de eliminar el primero, también",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const [uno, otro] = [await proveedor(), await proveedor()];
        const ref = referencia();
        const body = { proveedorId: uno.id, referenciaExterna: ref };

        const primero = await newTicket(a, tecnico.id, body);
        const duplicado = await a.post("/tickets", await ticketBody(tecnico.id, body));
        assertStatus(duplicado, 409, "mismo proveedor y referencia");
        assert(
          duplicado.body.message.includes(`TE-${String(primero.numero).padStart(6, "0")}`),
          `el 409 no nombra el ticket existente: ${duplicado.text}`,
        );
        await newTicket(a, tecnico.id, { proveedorId: otro.id, referenciaExterna: ref });

        assertStatus(await a.delete(`/tickets/${primero.id}`), 200, "eliminar el primero");
        await newTicket(a, tecnico.id, body);
      },
    ),

    criterion(
      8,
      "Dos ediciones simultáneas sobre el mismo ticket: la segunda devuelve 409 por `updatedAt` desactualizado; una edición sin cambios responde 200 y no deja `AuditLog`",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const t = await newTicket(a, tecnico.id);

        const primera = await update(a, t, { titulo: "Primera" });
        assertStatus(primera, 200, "primera edición");
        const vieja = await update(a, t, { titulo: "Segunda" });
        assertStatus(vieja, 409, "edición con la versión vieja");
        same((await get(a, t.id)).titulo, "Primera", "la edición rechazada no guardó nada");

        // Sin cambios: 200 y ningún registro nuevo.
        const antes = auditRows("Ticket", t.id).length;
        assertStatus(await update(a, primera.body, {}), 200, "edición sin cambios");
        same(auditRows("Ticket", t.id).length, antes, "registros de auditoría");

        // Carrera real: dos ediciones con la misma versión, exactamente una gana.
        const fresco = await get(a, t.id);
        const res = await Promise.all([
          update(a, fresco, { titulo: "A" }),
          update(a, fresco, { titulo: "B" }),
        ]);
        same(res.map((r) => r.status).sort(), [200, 409], "carrera de dos ediciones");
      },
    ),

    criterion(
      9,
      "Un ticket cuya área se desactivó después se edita sin cambiar el área y guarda; elegir otra área desactivada devuelve 400",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const [area, otra] = [await createItem("areas"), await createItem("areas")];
        const t = await newTicket(a, tecnico.id);
        const conArea = await update(a, t, { areaId: area.id });
        assertStatus(conArea, 200, "asignar el área");

        for (const item of [area, otra]) {
          assertStatus(
            await a.post(`/catalogs/areas/${item.id}/active`, { activo: false }),
            200,
            "desactivar",
          );
        }
        const editado = await update(a, conArea.body, { titulo: "Con el área desactivada" });
        assertStatus(editado, 200, "editar con el área desactivada");
        same(editado.body.area.id, area.id, "el área se conserva");

        assertStatus(
          await update(a, editado.body, { areaId: otra.id }),
          400,
          "otra área desactivada",
        );
        assertStatus(
          await update(a, editado.body, { areaId: "no-existe" }),
          400,
          "área inexistente",
        );
      },
    ),

    criterion(
      10,
      "Pasar un ticket a «Finalizado» sin `fechaCierre` devuelve 400; con `fechaCierre` y sin `solucionDescripcion` funciona",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const t = await newTicket(a, tecnico.id);
        const fin = await estadoDe("FINALIZADO");

        assertStatus(await changeStatus(a, t, { estadoId: fin.id }), 400, "sin fecha de cierre");
        same((await get(a, t.id)).estado.id, t.estado.id, "el estado no cambió");

        const ok = await changeStatus(a, t, { estadoId: fin.id, fechaCierre: day(0) });
        assertStatus(ok, 200, "con fecha de cierre");
        same(
          [ok.body.estado.clave, ok.body.fechaCierre, ok.body.solucionDescripcion],
          ["FINALIZADO", day(0), null],
          "ticket finalizado",
        );
        // Lo que ese estado no admite, o una fecha futura, también es 400.
        const otro = await newTicket(a, tecnico.id);
        assertStatus(
          await changeStatus(a, otro, { estadoId: fin.id, fechaCierre: day(1) }),
          400,
          "fecha de cierre futura",
        );
        assertStatus(
          await changeStatus(a, otro, {
            estadoId: fin.id,
            fechaCierre: day(0),
            fechaReabierto: day(0),
          }),
          400,
          "fecha de reapertura en un cierre",
        );
      },
    ),

    criterion(
      11,
      "Pasar un ticket a «Reabierto» exige `fechaReabierto` y conserva `fechaCierre` y `solucionDescripcion` anteriores",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const [fin, rea] = [await estadoDe("FINALIZADO"), await estadoDe("REABIERTO")];
        const t = await newTicket(a, tecnico.id);
        const cerrado = await changeStatus(a, t, {
          estadoId: fin.id,
          fechaCierre: day(-2),
          solucionDescripcion: "Se cambió el toner",
        });
        assertStatus(cerrado, 200, "cerrar con solución");

        assertStatus(
          await changeStatus(a, cerrado.body, { estadoId: rea.id }),
          400,
          "sin fecha de reapertura",
        );
        const reabierto = await changeStatus(a, cerrado.body, {
          estadoId: rea.id,
          fechaReabierto: day(0),
        });
        assertStatus(reabierto, 200, "con fecha de reapertura");
        same(
          [
            reabierto.body.estado.clave,
            reabierto.body.fechaReabierto,
            reabierto.body.fechaCierre,
            reabierto.body.solucionDescripcion,
          ],
          ["REABIERTO", day(0), day(-2), "Se cambió el toner"],
          "ticket reabierto",
        );
        assertStatus(
          await changeStatus(a, reabierto.body, {
            estadoId: rea.id,
            fechaReabierto: day(0),
            fechaCierre: day(0),
          }),
          400,
          "fecha de cierre en una reapertura",
        );
      },
    ),

    criterion(
      12,
      "Renombrar «Finalizado» a «Resuelto» no cambia la exigencia de `fechaCierre`",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const fin = await estadoDe("FINALIZADO");
        const nuevoNombre = `Resuelto ${uniq()}`;
        assertStatus(
          await a.patch(`/catalogs/estados/${fin.id}`, { nombre: nuevoNombre }),
          200,
          "renombrar",
        );
        try {
          same(
            (await estadoDe("FINALIZADO")).nombre,
            nuevoNombre,
            "la clave sigue en el estado renombrado",
          );
          const t = await newTicket(a, tecnico.id);
          assertStatus(
            await changeStatus(a, t, { estadoId: fin.id }),
            400,
            "renombrado, sin fecha",
          );
          assertStatus(
            await changeStatus(a, t, { estadoId: fin.id, fechaCierre: day(0) }),
            200,
            "renombrado, con fecha",
          );
        } finally {
          assertStatus(
            await a.patch(`/catalogs/estados/${fin.id}`, { nombre: fin.nombre }),
            200,
            "devolver el nombre",
          );
        }
      },
    ),

    criterion(
      13,
      "Con el ticket cerrado, la edición corrige `fechaCierre` y la solución; cargar `fechaCierre` en uno que nunca la tuvo devuelve 400",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const fin = await estadoDe("FINALIZADO");
        const t = await newTicket(a, tecnico.id);

        assertStatus(
          await update(a, t, { fechaCierre: day(0) }),
          400,
          "cargar fechaCierre donde no hay",
        );
        const cerrado = await changeStatus(a, t, { estadoId: fin.id, fechaCierre: day(-1) });
        assertStatus(cerrado, 200, "cerrar");

        const corregido = await update(a, cerrado.body, {
          fechaCierre: day(-3),
          solucionDescripcion: "Cambio de toner",
        });
        assertStatus(corregido, 200, "corregir un ticket cerrado");
        same(
          [
            corregido.body.fechaCierre,
            corregido.body.solucionDescripcion,
            corregido.body.estado.clave,
          ],
          [day(-3), "Cambio de toner", "FINALIZADO"],
          "ticket corregido",
        );
        assertStatus(
          await update(a, corregido.body, { fechaCierre: null }),
          400,
          "borrar la fechaCierre",
        );
        assertStatus(
          await update(a, corregido.body, { fechaCierre: day(1) }),
          400,
          "fechaCierre futura",
        );
      },
    ),

    criterion(
      14,
      "Un agente recibe 404, con el mismo cuerpo, en `get`, `update`, `changeStatus` y `history` de un ticket de otro departamento y de un id inexistente; `list` nunca le devuelve tickets de otro departamento",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const client = await loggedIn(await newUser({ organizationId: tecnico.id }));
        const propio = await newTicket(a, tecnico.id);
        const ajeno = await newTicket(a, redes.id);
        const estado = await estadoLibre();
        const inexistente = { ...ajeno, id: "no-existe" };

        const llamadas = (t) => [
          ["get", () => client.get(`/tickets/${t.id}`)],
          ["update", () => update(client, t, { titulo: "x" })],
          ["changeStatus", () => changeStatus(client, t, { estadoId: estado.id })],
          ["history", () => client.get(`/tickets/${t.id}/history`)],
        ];
        const deAjeno = llamadas(ajeno);
        const deInexistente = llamadas(inexistente);
        for (const [i, [label, call]] of deAjeno.entries()) {
          const [res, ref] = [await call(), await deInexistente[i][1]()];
          assertStatus(res, 404, `${label} de otro departamento`);
          assertStatus(ref, 404, `${label} de un id inexistente`);
          same(res.body, ref.body, `${label}: ajeno e inexistente dan el mismo cuerpo`);
        }

        const lista = await client.get("/tickets");
        assertStatus(lista, 200, "list del agente");
        assert(
          lista.body.every((t) => t.departamento.id === tecnico.id),
          "la lista del agente trae tickets de otro departamento",
        );
        assert(
          lista.body.some((t) => t.id === propio.id) && !lista.body.some((t) => t.id === ajeno.id),
          "la lista del agente no coincide con su departamento",
        );
        assert(
          (await a.get("/tickets")).body.some((t) => t.id === ajeno.id),
          "el admin no ve todos",
        );
      },
    ),

    criterion(
      15,
      "Un agente que intenta eliminar un ticket, o cambiarle el departamento, recibe 403, también en su propio departamento",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const client = await loggedIn(await newUser({ organizationId: tecnico.id }));
        const propio = await newTicket(client, tecnico.id);
        const ajeno = await newTicket(a, redes.id);

        for (const [label, t] of [
          ["propio", propio],
          ["ajeno", ajeno],
        ]) {
          assertStatus(await client.delete(`/tickets/${t.id}`), 403, `eliminar ${label}`);
          assertStatus(
            await changeDepartment(client, t, redes.id),
            403,
            `cambiar departamento ${label}`,
          );
        }
        same((await get(a, propio.id)).departamento.id, tecnico.id, "el ticket no se movió");
      },
    ),

    criterion(
      16,
      "El admin cambia el departamento de un ticket; después un agente del departamento nuevo lo edita y uno del anterior recibe 404",
      async () => {
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const [deTecnico, deRedes] = [
          await loggedIn(await newUser({ organizationId: tecnico.id })),
          await loggedIn(await newUser({ organizationId: redes.id })),
        ];
        const t = await newTicket(a, tecnico.id);
        assertStatus(await update(deRedes, t, { titulo: "x" }), 404, "antes, el de Redes no lo ve");

        const movido = await changeDepartment(a, t, redes.id);
        assertStatus(movido, 200, "cambiar el departamento");
        same(
          [movido.body.departamento.id, movido.body.numero],
          [redes.id, t.numero],
          "departamento nuevo y mismo número",
        );

        assertStatus(
          await update(deRedes, movido.body, { titulo: "Editado en Redes" }),
          200,
          "agente nuevo",
        );
        assertStatus(
          await deTecnico.get(`/tickets/${t.id}`),
          404,
          "agente del departamento anterior",
        );

        // El destino debe existir y estar activo; el mismo departamento no cambia nada.
        const inactivo = await newDepartment("Sin recibir");
        assertStatus(
          await a.post(`/organizations/${inactivo.id}/active`, { activo: false }),
          200,
          "desactivar",
        );
        const fresco = await get(a, t.id);
        assertStatus(await changeDepartment(a, fresco, inactivo.id), 409, "destino desactivado");
        assertStatus(await changeDepartment(a, fresco, "no-existe"), 400, "destino inexistente");
        same(
          (await changeDepartment(a, fresco, redes.id)).body.updatedAt,
          fresco.updatedAt,
          "el mismo departamento no escribe",
        );
      },
    ),

    criterion(
      17,
      "Un ticket eliminado no aparece en ningún listado, pero su historial sigue existiendo en `AuditLog`",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const client = await loggedIn(await newUser({ organizationId: tecnico.id }));
        const t = await newTicket(client, tecnico.id);

        assertStatus(await a.delete(`/tickets/${t.id}`), 200, "eliminar");

        assert(
          !(await a.get("/tickets")).body.some((x) => x.id === t.id),
          "sigue en la lista del admin",
        );
        assert(
          !(await client.get("/tickets")).body.some((x) => x.id === t.id),
          "sigue en la del agente",
        );
        assertStatus(await a.get(`/tickets/${t.id}`), 404, "get del eliminado, admin");
        assertStatus(await client.get(`/tickets/${t.id}`), 404, "get del eliminado, agente");
        assertStatus(
          await client.get(`/tickets/${t.id}/history`),
          404,
          "historial del eliminado, agente",
        );
        assertStatus(await a.delete(`/tickets/${t.id}`), 404, "eliminar dos veces");

        const history = await a.get(`/tickets/${t.id}/history`);
        assertStatus(history, 200, "historial del eliminado, admin");
        same(
          history.body.map((e) => e.action),
          ["delete", "create"],
          "historial, del más reciente al más antiguo",
        );
        same(auditActions(t.id), ["create", "delete"], "AuditLog");
        // La fila sigue en la base: el borrado es lógico.
        same(
          sql(`SELECT count(*) FROM ticket WHERE id = '${t.id}' AND "deletedAt" IS NOT NULL`)[0][0],
          "1",
          "fila",
        );
      },
    ),

    criterion(
      18,
      'Cada operación sobre un ticket deja exactamente un `AuditLog` con `entityType: "Ticket"`; el diff de estado y el de departamento muestran `{ id, nombre }`',
      async () => {
        const me = await adminId();
        const a = await admin();
        const [tecnico, redes] = [await departmentNamed("Técnico"), await departmentNamed("Redes")];
        const t = await newTicket(a, tecnico.id);
        const prog = await estadoLibre(t.estado.id);

        const editado = await update(a, t, { titulo: "Editado" });
        const enProgreso = await changeStatus(a, editado.body, { estadoId: prog.id });
        const movido = await changeDepartment(a, enProgreso.body, redes.id);
        assertStatus(editado, 200, "update");
        assertStatus(enProgreso, 200, "changeStatus");
        assertStatus(movido, 200, "changeDepartment");
        assertStatus(await a.delete(`/tickets/${t.id}`), 200, "remove");

        const rows = auditRows("Ticket", t.id);
        same(
          rows.map((r) => r.action),
          ["create", "update", "update", "update", "delete"],
          "una entrada por operación",
        );
        assert(
          rows.every((r) => r.actorId === me),
          "algún registro no tiene al admin como actor",
        );
        same(
          rows[1].payload,
          { before: { titulo: t.titulo }, after: { titulo: "Editado" } },
          "update",
        );
        same(
          rows[2].payload,
          {
            before: { estado: { id: t.estado.id, nombre: t.estado.nombre } },
            after: { estado: { id: prog.id, nombre: prog.nombre } },
          },
          "cambio de estado",
        );
        same(
          rows[3].payload,
          {
            before: { departamento: { id: tecnico.id, nombre: tecnico.nombre } },
            after: { departamento: { id: redes.id, nombre: redes.nombre } },
          },
          "cambio de departamento",
        );
        same(rows[4].payload, {}, "delete");
      },
    ),

    criterion(
      19,
      "Eliminar un ítem de catálogo (área, edificio, tipo, prioridad, módulo, proveedor o estado) que usa un ticket no eliminado devuelve 409; sigue funcionando para un ítem que ningún ticket usa",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const items = {
          areas: await createItem("areas"),
          edificios: await createItem("edificios"),
          tipos: await createItem("tipos"),
          modulos: await createItem("modulos"),
          proveedores: await createItem("proveedores"),
          prioridades: await createItem("prioridades"),
          estados: await createItem("estados"),
        };
        const sinUso = await createItem("areas");

        const t = await newTicket(a, tecnico.id, { prioridadId: items.prioridades.id });
        const completo = await update(a, t, {
          areaId: items.areas.id,
          edificioId: items.edificios.id,
          tipoId: items.tipos.id,
          moduloId: items.modulos.id,
          proveedorId: items.proveedores.id,
        });
        assertStatus(completo, 200, "completar el ticket");
        assertStatus(
          await changeStatus(a, completo.body, { estadoId: items.estados.id }),
          200,
          "estado propio",
        );

        for (const [ruta, item] of Object.entries(items)) {
          const res = await a.delete(`/catalogs/${ruta}/${item.id}`);
          assertStatus(res, 409, `eliminar ${ruta} en uso`);
          assert(
            /Lo usa al menos un ticket/.test(res.body.message),
            `mensaje de ${ruta}: ${res.text}`,
          );
        }
        assertStatus(await a.delete(`/catalogs/areas/${sinUso.id}`), 200, "un ítem que nadie usa");
        // Desactivar sigue permitido aunque esté en uso.
        assertStatus(
          await a.post(`/catalogs/areas/${items.areas.id}/active`, { activo: false }),
          200,
          "desactivar uno en uso",
        );

        // Un ítem que solo usan tickets eliminados se puede eliminar.
        assertStatus(await a.delete(`/tickets/${t.id}`), 200, "eliminar el ticket");
        for (const [ruta, item] of Object.entries(items)) {
          assertStatus(
            await a.delete(`/catalogs/${ruta}/${item.id}`),
            200,
            `${ruta}: usado solo por un eliminado`,
          );
        }
      },
    ),

    criterion(
      20,
      "Eliminar un departamento con tickets, aunque estén eliminados, devuelve 409",
      async () => {
        const a = await admin();
        const dept = await newDepartment("Con tickets");
        const t = await newTicket(a, dept.id);

        const conTicket = await a.delete(`/organizations/${dept.id}`);
        assertStatus(conTicket, 409, "con un ticket");
        assert(/tiene tickets/.test(conTicket.body.message), `mensaje: ${conTicket.text}`);
        assertStatus(await a.delete(`/tickets/${t.id}`), 200, "eliminar el ticket");
        assertStatus(await a.delete(`/organizations/${dept.id}`), 409, "con un ticket eliminado");

        const vacio = await newDepartment("Vacío");
        assertStatus(await a.delete(`/organizations/${vacio.id}`), 200, "uno sin tickets");
      },
    ),

    criterion(
      21,
      "Un ticket cuyo ítem de catálogo se eliminó después sigue mostrando ese valor en su detalle y en su historial",
      async () => {
        // Por la API un ítem en uso no se puede eliminar (criterio 19), así que el borrado se simula
        // directo en la base: es el caso de una carrera, o de un ítem eliminado antes de este spec.
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const [area, proveedorItem] = [await createItem("areas"), await createItem("proveedores")];
        const t = await newTicket(a, tecnico.id);
        const completo = await update(a, t, { areaId: area.id, proveedorId: proveedorItem.id });
        assertStatus(completo, 200, "completar el ticket");

        sql(`UPDATE area SET "deletedAt" = now() WHERE id = '${area.id}'`);
        sql(`UPDATE proveedor SET "deletedAt" = now() WHERE id = '${proveedorItem.id}'`);

        const detalle = await get(a, t.id);
        same(detalle.area, { id: area.id, nombre: area.nombre }, "área eliminada en el detalle");
        same(
          detalle.proveedor,
          { id: proveedorItem.id, nombre: proveedorItem.nombre },
          "proveedor eliminado",
        );
        const history = await a.get(`/tickets/${t.id}/history`);
        const update1 = history.body.find((e) => e.action === "update");
        same(
          update1.payload.after.area,
          { id: area.id, nombre: area.nombre },
          "área en el historial",
        );
        // Editar sin tocar el área sigue funcionando: el valor que ya tenía se acepta aunque esté eliminado.
        const editado = await update(a, detalle, { titulo: "Con el área eliminada" });
        assertStatus(editado, 200, "editar sin tocar el área eliminada");
        same(editado.body.area.id, area.id, "el área eliminada se conserva");
      },
    ),

    criterion(
      22,
      "En la web, el agente crea un ticket desde `/tickets/nuevo`, lo ve en `/tickets`, lo pasa a Finalizado desde el diálogo y ve el cambio en el historial; no ve «Cambiar departamento» ni «Eliminar»",
      async () => {
        // Sin navegador: corren las pruebas de los componentes de cada paso del recorrido.
        vitest(
          "@syc/web",
          "Las pruebas de la pantalla de tickets",
          "src/features/tickets/components/CreateTicketForm.test.tsx",
          "src/features/tickets/components/TicketsList.test.tsx",
          "src/features/tickets/components/ChangeStatusDialog.test.tsx",
          "src/features/tickets/components/TicketHistory.test.tsx",
          "src/features/tickets/components/TicketDetail.test.tsx",
          "src/features/tickets/components/TicketForm.test.tsx",
          "src/components/layout/Sidebar.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(23, "`/_probe/*` responde 404 y el módulo temporal ya no existe", async () => {
      const a = await admin();
      const tecnico = await departmentNamed("Técnico");
      for (const [label, call] of [
        ["GET", () => a.get(`/_probe/departments/${tecnico.id}`)],
        ["POST", () => a.post(`/_probe/departments/${tecnico.id}`)],
        ["DELETE", () => a.delete(`/_probe/departments/${tecnico.id}`)],
      ]) {
        assertStatus(await call(), 404, `${label} /_probe`);
      }
      for (const gone of ["apps/api/src/modules/permissions-probe", "bruno/_probe"]) {
        assert(!existsSync(path.join(ROOT, gone)), `${gone} todavía existe`);
      }
      // Los criterios 19 y 20 de SPEC 02 usan tickets reales y se verifican con `pnpm verify --spec 02`.
    }),

    turboCriterion(24),
  ],
});
