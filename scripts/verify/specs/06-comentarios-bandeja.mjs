import { adminId, auditRows, same } from "../lib/audit.mjs";
import { admin, loggedIn, newDepartment, newTicket, newUser, uniq } from "../lib/fixtures.mjs";
import { scalar } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

const PAGE_SIZE = 20;

// Un agente en un departamento nuevo, con su sesión: el departamento solo tiene los tickets que cada
// criterio crea, así la bandeja se puede comparar entera sin depender de lo que dejaron otros criterios.
async function agentIn(department) {
  const user = await newUser({ organizationId: department.id });
  return { user, client: await loggedIn(user) };
}

const commentsOf = async (client, ticketId) => {
  const res = await client.get(`/tickets/${ticketId}/comments`);
  assertStatus(res, 200, "comments.list");
  return res.body;
};
const comment = (client, ticketId, texto) =>
  client.post(`/tickets/${ticketId}/comments`, { texto });
const removeComment = (client, ticketId, comentarioId) =>
  client.delete(`/tickets/${ticketId}/comments/${comentarioId}`);

// `tickets.list` con la query string que arma `params`; devuelve la página (`items`, `total`, ...).
async function inbox(client, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  const res = await client.get(`/tickets?${query}`);
  assertStatus(res, 200, `tickets.list ?${query}`);
  return res.body;
}
const idsOf = (page) => page.items.map((t) => t.id);
const sorted = (ids) => [...ids].sort();

async function estadoDe(clave) {
  const res = await (await admin()).get("/catalogs/estados");
  assertStatus(res, 200, "catalogs.estados.list");
  const found = res.body.find((e) => e.clave === clave);
  assert(found, `no existe el estado con clave ${clave} (¿corrió el seed?)`);
  return found;
}

// Un estado activo sin clave (Pendiente, En progreso, En espera) distinto de `exceptId`.
async function estadoLibre(exceptId) {
  const res = await (await admin()).get("/catalogs/estados");
  assertStatus(res, 200, "catalogs.estados.list");
  const found = res.body.find((e) => e.clave === null && e.activo && e.id !== exceptId);
  assert(found, "no hay un estado sin clave activo");
  return found;
}

async function createItem(ruta) {
  const res = await (await admin()).post(`/catalogs/${ruta}`, { nombre: `${ruta} ${uniq()}` });
  assertStatus(res, 200, `crear en ${ruta}`);
  return res.body;
}

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

// SPEC 06 — comentarios y bandeja.
export default defineSpec({
  id: "06",
  title: "Comentarios y bandeja",
  infra: true,
  criteria: [
    criterion(
      1,
      "Un agente comenta un ticket de su departamento, también en estado Finalizado. El comentario sale en `comments.list` con su nombre y la fecha",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { user, client } = await agentIn(dept);
        const t = await newTicket(client, dept.id);

        const abierto = await comment(client, t.id, "Con el ticket abierto");
        assertStatus(abierto, 200, "comentar con el ticket abierto");

        const finalizado = await estadoDe("FINALIZADO");
        assertStatus(
          await client.post(`/tickets/${t.id}/status`, {
            updatedAt: t.updatedAt,
            estadoId: finalizado.id,
            fechaCierre: "2020-01-02",
          }),
          200,
          "pasar a Finalizado",
        );
        const cerrado = await comment(client, t.id, "Con el ticket Finalizado");
        assertStatus(cerrado, 200, "comentar con el ticket Finalizado");

        // También lo lee el admin, que ve todos los departamentos.
        for (const [who, label] of [
          [client, "agente"],
          [a, "admin"],
        ]) {
          const list = await commentsOf(who, t.id);
          same(
            list.map((c) => c.texto),
            ["Con el ticket abierto", "Con el ticket Finalizado"],
            `comentarios vistos por el ${label}, del más antiguo al más reciente`,
          );
          same(list[0].autor, { id: user.id, nombre: user.name }, "autor del comentario");
          assert(
            !Number.isNaN(Date.parse(list[0].createdAt)) &&
              Math.abs(Date.now() - Date.parse(list[0].createdAt)) < 5 * 60_000,
            `createdAt no es una fecha reciente: ${list[0].createdAt}`,
          );
        }
      },
    ),

    criterion(
      2,
      "Comentar no cambia el `updatedAt` del ticket: un `update` con el `updatedAt` leído antes del comentario guarda sin 409",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const t = await newTicket(a, dept.id);

        assertStatus(await comment(client, t.id, "Un comentario ajeno"), 200, "comentar");

        const despues = await a.get(`/tickets/${t.id}`);
        assertStatus(despues, 200, "tickets.get");
        same(despues.body.updatedAt, t.updatedAt, "updatedAt tras comentar");
        same(despues.body.editor, t.editor, "editor tras comentar");

        // El formulario que se abrió antes del comentario sigue guardando con su versión.
        assertStatus(
          await update(a, t, { titulo: "Editado después de un comentario" }),
          200,
          "update con el updatedAt leído antes del comentario",
        );
      },
    ),

    criterion(3, "Un comentario de solo espacios, o de 2001 caracteres, devuelve 400", async () => {
      const a = await admin();
      const dept = await newDepartment();
      const t = await newTicket(a, dept.id);

      for (const [label, texto] of [
        ["vacío", ""],
        ["solo espacios", "   \n\t "],
        ["2001 caracteres", "a".repeat(2001)],
      ]) {
        assertStatus(await comment(a, t.id, texto), 400, `comentario ${label}`);
      }
      assertStatus(await comment(a, t.id, "a".repeat(2000)), 200, "2000 caracteres es el límite");
      same((await commentsOf(a, t.id)).length, 1, "solo quedó el válido");
    }),

    criterion(
      4,
      "Un agente recibe 404, con el mismo cuerpo, en `comments.list` y `comments.create` de un ticket de otro departamento y de un id inexistente",
      async () => {
        const a = await admin();
        const [propio, otro] = [await newDepartment(), await newDepartment()];
        const { client } = await agentIn(propio);
        const ajeno = await newTicket(a, otro.id);
        const sembrado = await comment(a, ajeno.id, "No debería leerlo");
        assertStatus(sembrado, 200, "comentario en el ticket ajeno");

        const llamadas = (id) => [
          ["comments.list", () => client.get(`/tickets/${id}/comments`)],
          ["comments.create", () => comment(client, id, "Hola")],
        ];
        const deAjeno = llamadas(ajeno.id);
        const deInexistente = llamadas("no-existe");
        for (const [i, [label, call]] of deAjeno.entries()) {
          const [res, ref] = [await call(), await deInexistente[i][1]()];
          assertStatus(res, 404, `${label} de otro departamento`);
          assertStatus(ref, 404, `${label} de un id inexistente`);
          same(res.body, ref.body, `${label}: ajeno e inexistente dan el mismo cuerpo`);
        }
        same((await commentsOf(a, ajeno.id)).length, 1, "el agente no llegó a comentar el ajeno");

        // Al admin, un ticket inexistente también le da 404 (lo responde el service).
        assertStatus(
          await a.get("/tickets/no-existe/comments"),
          404,
          "list del admin, inexistente",
        );
        assertStatus(await comment(a, "no-existe", "Hola"), 404, "create del admin, inexistente");
      },
    ),

    criterion(
      5,
      "Un agente recibe 403 en `comments.remove`, también sobre su propio comentario",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const t = await newTicket(a, dept.id);
        const propio = (await comment(client, t.id, "Mío")).body;
        const delAdmin = (await comment(a, t.id, "Del admin")).body;

        assertStatus(await removeComment(client, t.id, propio.id), 403, "su propio comentario");
        assertStatus(await removeComment(client, t.id, delAdmin.id), 403, "uno de su departamento");
        same((await commentsOf(a, t.id)).length, 2, "ninguno se eliminó");
      },
    ),

    criterion(
      6,
      "El admin elimina un comentario: deja de salir en `comments.list` y eliminarlo otra vez devuelve 404",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const [t, otro] = [await newTicket(a, dept.id), await newTicket(a, dept.id)];
        const c = (await comment(client, t.id, "Para eliminar")).body;
        const queda = (await comment(client, t.id, "Este queda")).body;

        // De otro ticket, inexistente: 404 sin tocar nada.
        assertStatus(await removeComment(a, otro.id, c.id), 404, "comentario de otro ticket");
        assertStatus(await removeComment(a, t.id, "no-existe"), 404, "comentario inexistente");
        same((await commentsOf(a, t.id)).length, 2, "nada se eliminó todavía");

        assertStatus(await removeComment(a, t.id, c.id), 200, "eliminar");
        same(
          (await commentsOf(client, t.id)).map((x) => x.id),
          [queda.id],
          "comentarios tras eliminar",
        );
        assertStatus(await removeComment(a, t.id, c.id), 404, "eliminar dos veces");

        // Eliminado lógicamente: la fila sigue, con `deletedAt`.
        same(
          scalar(
            `SELECT count(*) FROM ticket_comentario WHERE id = '${c.id}' AND "deletedAt" IS NOT NULL`,
          ),
          "1",
          "fila eliminada lógicamente",
        );
      },
    ),

    criterion(
      7,
      'Comentar y eliminar dejan cada uno exactamente un `AuditLog` con `entityType: "Ticket"`, acción `comment_create` o `comment_delete`, y un `payload` sin el texto',
      async () => {
        const a = await admin();
        const me = await adminId();
        const dept = await newDepartment();
        const { user, client } = await agentIn(dept);
        const t = await newTicket(a, dept.id);
        const secreto = `secreto-${uniq()}`;

        const c = (await comment(client, t.id, secreto)).body;
        assertStatus(await removeComment(a, t.id, c.id), 200, "eliminar");

        const rows = auditRows("Ticket", t.id);
        same(
          rows.map((r) => r.action),
          ["create", "comment_create", "comment_delete"],
          "una entrada por operación",
        );
        same(rows[1].actorId, user.id, "actor del alta del comentario");
        same(rows[2].actorId, me, "actor de la eliminación");
        same(rows[1].payload, { comentarioId: c.id }, "payload de comment_create");
        same(rows[2].payload, { comentarioId: c.id }, "payload de comment_delete");
        assert(
          !JSON.stringify(rows).includes(secreto),
          "el texto del comentario quedó en el AuditLog",
        );
        same(
          scalar(`SELECT count(*) FROM audit_log WHERE "entityType" = 'TicketComentario'`),
          "0",
          "no se audita con entityType TicketComentario",
        );

        // Y salen en el historial del ticket, también sin el texto.
        const history = await a.get(`/tickets/${t.id}/history`);
        assertStatus(history, 200, "historial");
        same(
          history.body.map((e) => e.action),
          ["comment_delete", "comment_create", "create"],
          "historial, del más reciente al más antiguo",
        );
        assert(!history.text.includes(secreto), "el texto del comentario salió en el historial");
      },
    ),

    criterion(
      8,
      "`tickets.list` de un agente nunca devuelve un ticket de otro departamento, tampoco mandando el `departamentoId` de otro. El admin, con `departamentoId`, recibe solo los de ese departamento",
      async () => {
        const a = await admin();
        const [propio, otro] = [await newDepartment(), await newDepartment()];
        const { client } = await agentIn(propio);
        const mios = [await newTicket(a, propio.id), await newTicket(a, propio.id)];
        const ajeno = await newTicket(a, otro.id);

        const sinFiltro = await inbox(client);
        same(sorted(idsOf(sinFiltro)), sorted(mios.map((t) => t.id)), "lista del agente");
        same(sinFiltro.total, 2, "total del agente");

        // Su alcance gana: mandar el departamento de otro no cambia nada.
        const conOtro = await inbox(client, { departamentoId: otro.id });
        same(
          sorted(idsOf(conOtro)),
          sorted(mios.map((t) => t.id)),
          "con el departamentoId de otro",
        );
        same(conOtro.total, 2, "total con el departamentoId de otro");
        const buscandoAjeno = await inbox(client, { departamentoId: otro.id, q: ajeno.titulo });
        same(buscandoAjeno.total, 0, "buscar el título del ajeno");

        // El admin lo aplica.
        const deOtro = await inbox(a, { departamentoId: otro.id });
        same(idsOf(deOtro), [ajeno.id], "admin con departamentoId");
        const dePropio = await inbox(a, { departamentoId: propio.id });
        same(
          sorted(idsOf(dePropio)),
          sorted(mios.map((t) => t.id)),
          "admin con el otro departamento",
        );
        const todos = await inbox(a, { q: ajeno.titulo });
        same(idsOf(todos), [ajeno.id], "el admin sin departamentoId ve todos los departamentos");
      },
    ),

    criterion(
      9,
      'Buscar "tecnico" encuentra un ticket con "Técnico" en el título, y uno con "TÉCNICO" en la descripción',
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const u = uniq();
        const enTitulo = await newTicket(a, dept.id, { titulo: `Falla del Técnico${u}` });
        const enDescripcion = await newTicket(a, dept.id, {
          descripcion: `Avisó el TÉCNICO${u} de turno`,
        });
        const enSolucion = await newTicket(a, dept.id);
        const finalizado = await estadoDe("FINALIZADO");
        assertStatus(
          await a.post(`/tickets/${enSolucion.id}/status`, {
            updatedAt: enSolucion.updatedAt,
            estadoId: finalizado.id,
            fechaCierre: "2020-01-02",
            solucionDescripcion: `Lo resolvió el técnico${u}`,
          }),
          200,
          "cerrar con solución",
        );
        const otro = await newTicket(a, dept.id, { titulo: `Sin relación ${u}` });

        const esperados = sorted([enTitulo.id, enDescripcion.id, enSolucion.id]);
        for (const q of [`tecnico${u}`, `TECNICO${u}`, `técnico${u}`, `TÉCNICO${u}`]) {
          const page = await inbox(a, { q, departamentoId: dept.id });
          same(sorted(idsOf(page)), esperados, `búsqueda "${q}"`);
          assert(!idsOf(page).includes(otro.id), `"${q}" encontró un ticket sin relación`);
        }
        // No es una búsqueda por palabra completa: "contiene".
        same(
          (await inbox(a, { q: `ecnico${u}`, departamentoId: dept.id })).total,
          3,
          "búsqueda por un trozo",
        );
      },
    ),

    criterion(
      10,
      "Buscar una palabra que solo está en un comentario encuentra el ticket. Después de que el admin elimina ese comentario, ya no lo encuentra",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const t = await newTicket(a, dept.id);
        const palabra = `zorro${uniq()}`;

        same((await inbox(client, { q: palabra })).total, 0, "antes del comentario");
        const c = (await comment(client, t.id, `Lo vio un ${palabra.toUpperCase()} en la sala`))
          .body;

        same(idsOf(await inbox(client, { q: palabra })), [t.id], "el agente lo encuentra");
        same(idsOf(await inbox(a, { q: palabra })), [t.id], "el admin lo encuentra");

        assertStatus(await removeComment(a, t.id, c.id), 200, "eliminar el comentario");
        same((await inbox(client, { q: palabra })).total, 0, "el agente ya no lo encuentra");
        same((await inbox(a, { q: palabra })).total, 0, "el admin ya no lo encuentra");
      },
    ),

    criterion(
      11,
      'Buscar "50%" encuentra un ticket con "50%" en el título y no uno con "500" en el título',
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const u = uniq();
        const conPorcentaje = await newTicket(a, dept.id, { titulo: `Descuento 50% ${u}` });
        const conCeros = await newTicket(a, dept.id, { titulo: `Descuento 500 ${u}` });
        const conGuion = await newTicket(a, dept.id, { titulo: `Sala a_b ${u}` });
        const sinGuion = await newTicket(a, dept.id, { titulo: `Sala axb ${u}` });
        const conBarra = await newTicket(a, dept.id, { titulo: `Ruta c:\\temp ${u}` });

        // Sin escapar, "50% u" también encontraría "500 u" (el % sería un comodín).
        const porcentaje = await inbox(a, { q: `50% ${u}`, departamentoId: dept.id });
        same(idsOf(porcentaje), [conPorcentaje.id], 'búsqueda "50%"');
        assert(!idsOf(porcentaje).includes(conCeros.id), 'el "500" no debería coincidir');

        same(
          idsOf(await inbox(a, { q: `a_b ${u}`, departamentoId: dept.id })),
          [conGuion.id],
          'búsqueda "a_b": el _ es literal',
        );
        assert(sinGuion.id !== conGuion.id, "fixture");
        same(
          idsOf(await inbox(a, { q: `c:\\temp ${u}`, departamentoId: dept.id })),
          [conBarra.id],
          "búsqueda con una barra invertida",
        );

        // Un texto armado para romper el SQL se busca como texto: sin error y sin resultados.
        for (const q of [`x' OR '1'='1`, `'; DROP TABLE ticket; --`, "\\", "%", "_"]) {
          const page = await inbox(a, { q, departamentoId: dept.id });
          assert(page.total <= 5, `"${q}" devolvió ${page.total} (¿se interpretó como SQL?)`);
        }
        assert(
          Number(scalar("SELECT count(*) FROM ticket")) > 0,
          "la tabla de tickets sigue existiendo",
        );
      },
    ),

    criterion(
      12,
      "Un ticket eliminado no aparece en la bandeja con ningún filtro ni búsqueda",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const palabra = `eliminado${uniq()}`;
        const t = await newTicket(client, dept.id, {
          titulo: `Titulo ${palabra}`,
          descripcion: `Descripcion ${palabra}`,
        });
        assertStatus(await comment(client, t.id, `Comentario ${palabra}`), 200, "comentar");
        // Antes de eliminarlo se encuentra por todos lados.
        same(idsOf(await inbox(a, { q: palabra })), [t.id], "antes de eliminar");

        assertStatus(await a.delete(`/tickets/${t.id}`), 200, "eliminar el ticket");

        const consultas = [
          {},
          { q: palabra },
          { q: t.titulo },
          { estadoId: t.estado.id },
          { prioridadId: t.prioridad.id },
          { departamentoId: dept.id },
          { fechaRecepcionDesde: t.fechaRecepcion, fechaRecepcionHasta: t.fechaRecepcion },
          { q: palabra, departamentoId: dept.id, estadoId: t.estado.id },
        ];
        for (const [who, label] of [
          [a, "admin"],
          [client, "agente"],
        ]) {
          for (const params of consultas) {
            const page = await inbox(who, params);
            assert(
              !idsOf(page).includes(t.id),
              `el eliminado salió para el ${label} con ${JSON.stringify(params)}`,
            );
          }
          same((await inbox(who, { q: palabra })).total, 0, `total buscando, ${label}`);
        }
      },
    ),

    criterion(
      13,
      "Con 25 tickets: sin filtros, la página 1 trae 20 ordenados por `fechaRecepcion` descendente (y `numero` descendente al empatar), la página 2 trae 5 y las dos informan `total: 25`",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const { client } = await agentIn(dept);
        const fechas = ["2020-01-03", "2020-01-01", "2020-01-02"];
        const creados = [];
        for (let i = 0; i < 25; i++) {
          creados.push(await newTicket(client, dept.id, { fechaRecepcion: fechas[i % 3] }));
        }
        // fechaRecepcion descendente y, si empata, numero descendente.
        const esperado = [...creados]
          .sort((x, y) =>
            x.fechaRecepcion === y.fechaRecepcion
              ? y.numero - x.numero
              : y.fechaRecepcion.localeCompare(x.fechaRecepcion),
          )
          .map((t) => t.id);

        for (const [who, label] of [
          [client, "agente"],
          [a, "admin"],
        ]) {
          const params = label === "admin" ? { departamentoId: dept.id } : {};
          const [uno, dos, tres] = [
            await inbox(who, params),
            await inbox(who, { ...params, page: 2 }),
            await inbox(who, { ...params, page: 3 }),
          ];
          same(uno.items.length, PAGE_SIZE, `${label}: tamaño de la página 1`);
          same(idsOf(uno), esperado.slice(0, PAGE_SIZE), `${label}: orden de la página 1`);
          same(idsOf(dos), esperado.slice(PAGE_SIZE), `${label}: página 2 (los 5 restantes)`);
          same(
            [uno.total, dos.total, uno.page, dos.page, uno.pageSize, dos.pageSize],
            [25, 25, 1, 2, PAGE_SIZE, PAGE_SIZE],
            `${label}: total, página y tamaño`,
          );
          same([tres.items.length, tres.total], [0, 25], `${label}: página posterior a la última`);
        }
      },
    ),

    criterion(
      14,
      "Filtrar por proveedor, por módulo y por un rango de fecha de recepción (con los dos extremos inclusive) devuelve solo los tickets que coinciden. Filtrar por un área desactivada encuentra sus tickets",
      async () => {
        const a = await admin();
        const dept = await newDepartment();
        const [proveedor, modulo, area] = [
          await createItem("proveedores"),
          await createItem("modulos"),
          await createItem("areas"),
        ];
        const t1 = await newTicket(a, dept.id, {
          proveedorId: proveedor.id,
          fechaRecepcion: "2020-01-10",
        });
        const t2 = await newTicket(a, dept.id, {
          proveedorId: proveedor.id,
          fechaRecepcion: "2020-01-15",
        });
        const t3 = await newTicket(a, dept.id, {
          proveedorId: proveedor.id,
          fechaRecepcion: "2020-01-20",
        });
        const t4 = await newTicket(a, dept.id, { fechaRecepcion: "2020-01-12" });

        // Módulo y área se asignan al editar; el estado, al cambiarlo.
        assertStatus(
          await update(a, t1, { moduloId: modulo.id, areaId: area.id }),
          200,
          "asignar módulo y área",
        );
        const enProgreso = await estadoLibre(t2.estado.id);
        assertStatus(
          await a.post(`/tickets/${t2.id}/status`, {
            updatedAt: t2.updatedAt,
            estadoId: enProgreso.id,
          }),
          200,
          "cambiar el estado de t2",
        );

        const en = async (label, params, esperados) =>
          same(
            sorted(idsOf(await inbox(a, { departamentoId: dept.id, ...params }))),
            sorted(esperados.map((t) => t.id)),
            label,
          );

        await en("proveedor", { proveedorId: proveedor.id }, [t1, t2, t3]);
        await en("módulo", { moduloId: modulo.id }, [t1]);
        await en("estado", { estadoId: enProgreso.id }, [t2]);
        await en(
          "rango con los dos extremos inclusive",
          { fechaRecepcionDesde: "2020-01-10", fechaRecepcionHasta: "2020-01-15" },
          [t1, t2, t4],
        );
        await en("solo «desde» (inclusive)", { fechaRecepcionDesde: "2020-01-15" }, [t2, t3]);
        await en("solo «hasta» (inclusive)", { fechaRecepcionHasta: "2020-01-12" }, [t1, t4]);
        await en(
          "un solo día",
          { fechaRecepcionDesde: "2020-01-20", fechaRecepcionHasta: "2020-01-20" },
          [t3],
        );
        await en(
          "los filtros se combinan con AND",
          { proveedorId: proveedor.id, fechaRecepcionDesde: "2020-01-12" },
          [t2, t3],
        );
        await en("un id de filtro que no existe", { proveedorId: "no-existe" }, []);

        // Un área desactivada sigue encontrando sus tickets.
        assertStatus(
          await a.post(`/catalogs/areas/${area.id}/active`, { activo: false }),
          200,
          "desactivar el área",
        );
        await en("área desactivada", { areaId: area.id }, [t1]);
      },
    ),

    criterion(
      15,
      "`fechaRecepcionDesde` posterior a `fechaRecepcionHasta` devuelve 400",
      async () => {
        const a = await admin();
        const invertido = await a.get(
          "/tickets?fechaRecepcionDesde=2026-10-05&fechaRecepcionHasta=2026-10-01",
        );
        assertStatus(invertido, 400, "rango invertido");
        assertStatus(
          await a.get("/tickets?fechaRecepcionDesde=2026-10-05&fechaRecepcionHasta=2026-10-05"),
          200,
          "el mismo día es un rango válido",
        );
        for (const page of ["0", "-1", "abc"]) {
          assertStatus(await a.get(`/tickets?page=${page}`), 400, `page=${page}`);
        }
        assertStatus(
          await a.get("/tickets?q=%20%20"),
          200,
          "q de solo espacios equivale a no buscar",
        );
      },
    ),

    criterion(
      16,
      "En la web, un agente busca un ticket por una palabra de un comentario, lo abre desde la bandeja, agrega un comentario y lo ve en la lista. No ve «Eliminar» en los comentarios ni el filtro «Departamento»",
      async () => {
        // Sin navegador: corren las pruebas de los componentes de cada paso del recorrido.
        vitest(
          "@syc/web",
          "Las pruebas de la bandeja y los comentarios",
          "src/features/tickets/components/TicketsFilters.test.tsx",
          "src/features/tickets/components/TicketsList.test.tsx",
          "src/features/tickets/components/TicketComments.test.tsx",
          "src/features/tickets/components/TicketDetail.test.tsx",
          "src/features/tickets/hooks/useCommentMutations.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      17,
      "En la web, recargar `/tickets?q=impresora&page=2` muestra la misma búsqueda y la misma página",
      async () => {
        vitest(
          "@syc/web",
          "Las pruebas de la URL de la bandeja",
          "src/features/tickets/tickets-search.test.ts",
          "src/routes/_authenticated/tickets/index.test.ts",
          "src/features/tickets/components/TicketsFilters.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      18,
      "En la web, el admin elimina un comentario y el historial muestra «Comentario eliminado» sin el texto",
      async () => {
        vitest(
          "@syc/web",
          "Las pruebas de eliminar un comentario",
          "src/features/tickets/components/TicketComments.test.tsx",
          "src/features/tickets/components/TicketHistory.test.tsx",
          "src/features/tickets/hooks/useCommentMutations.test.tsx",
        );
      },
      { infra: false },
    ),

    turboCriterion(19),
  ],
});
