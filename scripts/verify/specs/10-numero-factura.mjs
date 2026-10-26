import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { auditRows, same } from "../lib/audit.mjs";
import { admin, createItem, departmentNamed, newTicket, ticketBody } from "../lib/fixtures.mjs";
import { scalar, sql } from "../lib/infra.mjs";
import { turboCriterion } from "../lib/shared-criteria.mjs";
import { criterion, defineSpec } from "../lib/spec.mjs";
import { assert, assertStatus, ROOT, vitest } from "../lib/util.mjs";

// --- Ayudas ------------------------------------------------------------------------------------

// "YYYY-MM-DD" de hoy en America/Argentina/Buenos_Aires (la misma regla que el contrato).
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(),
  );

const proveedor = () => createItem("proveedores");

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
  numeroFactura: t.numeroFactura,
  fechaRecepcion: t.fechaRecepcion,
  fechaCierre: t.fechaCierre,
  fechaReabierto: t.fechaReabierto,
  solucionDescripcion: t.solucionDescripcion,
  notificado: t.notificado,
  ...extra,
});

const update = (client, t, extra) => client.put(`/tickets/${t.id}`, editBody(t, extra));

const MIGRATIONS = path.join(ROOT, "packages/db/migrations");

// SPEC 10 — número de factura del ticket.
export default defineSpec({
  id: "10",
  title: "Número de factura del ticket",
  infra: true,
  criteria: [
    criterion(
      1,
      "Después de `prisma migrate deploy`, la tabla `ticket` tiene la columna `numeroFactura` nullable, y los tickets existentes la tienen en `null`",
      async () => {
        // La base temporal ya tiene todas las migraciones aplicadas por `migrate deploy`.
        const [[nullable, type]] = sql(
          `SELECT is_nullable, data_type FROM information_schema.columns
           WHERE table_name = 'ticket' AND column_name = 'numeroFactura'`,
        );
        same([nullable, type], ["YES", "text"], "columna ticket.numeroFactura");

        // La migración solo agrega la columna: sin DEFAULT ni NOT NULL, así lo que ya existía queda en
        // null; y no toca los índices parciales escritos a mano.
        const dir = readdirSync(MIGRATIONS).find((d) => d.endsWith("_numero_factura"));
        assert(dir, "no existe la migración `numero_factura`");
        const migration = readFileSync(path.join(MIGRATIONS, dir, "migration.sql"), "utf8");
        const statements = migration
          .split("\n")
          .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"));
        same(
          statements.map((s) => s.replace(/\s+/g, " ").trim()),
          ['ALTER TABLE "ticket" ADD COLUMN "numeroFactura" TEXT;'],
          "SQL de la migración numero_factura",
        );

        // Un ticket sin factura queda en null en la base.
        const a = await admin();
        const t = await newTicket(a, (await departmentNamed("Técnico")).id);
        same(
          scalar(`SELECT "numeroFactura" IS NULL FROM ticket WHERE id = '${t.id}'`),
          "t",
          "ticket sin factura",
        );
      },
    ),

    criterion(
      2,
      '`tickets.create` con proveedor, sin referencia externa y con `numeroFactura: "0003-00004567"` devuelve 200, y `tickets.get` trae `numeroFactura: "0003-00004567"`',
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prov = await proveedor();

        const t = await newTicket(a, tecnico.id, {
          proveedorId: prov.id,
          numeroFactura: "0003-00004567",
        });

        same(t.numeroFactura, "0003-00004567", "numeroFactura al crear");
        same(t.referenciaExterna, null, "sin referencia externa");
        same((await get(a, t.id)).numeroFactura, "0003-00004567", "numeroFactura en tickets.get");
      },
    ),

    criterion(
      3,
      "`tickets.create` con `numeroFactura` y sin `proveedorId` devuelve 400",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");

        assertStatus(
          await a.post("/tickets", await ticketBody(tecnico.id, { numeroFactura: "A-12" })),
          400,
          "factura sin proveedor",
        );
      },
    ),

    criterion(
      4,
      "`tickets.update` con `proveedorId: null` y `numeroFactura` cargado devuelve 400",
      async () => {
        const a = await admin();
        const prov = await proveedor();
        const t = await newTicket(a, (await departmentNamed("Técnico")).id, {
          proveedorId: prov.id,
          numeroFactura: "A-12",
        });

        assertStatus(
          await update(a, t, { proveedorId: null, numeroFactura: "A-12" }),
          400,
          "quitar el proveedor con la factura cargada",
        );
        same((await get(a, t.id)).numeroFactura, "A-12", "el ticket no cambió");
      },
    ),

    criterion(
      5,
      "`numeroFactura` de 51 caracteres devuelve 400, en `create` y en `update`",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prov = await proveedor();

        assertStatus(
          await a.post(
            "/tickets",
            await ticketBody(tecnico.id, { proveedorId: prov.id, numeroFactura: "a".repeat(51) }),
          ),
          400,
          "create con 51 caracteres",
        );
        const t = await newTicket(a, tecnico.id, { proveedorId: prov.id });
        assertStatus(
          await update(a, t, { numeroFactura: "a".repeat(51) }),
          400,
          "update con 51 caracteres",
        );
        // El límite es inclusivo: 50 se acepta.
        assertStatus(
          await update(a, t, { numeroFactura: "a".repeat(50) }),
          200,
          "update con 50 caracteres",
        );
      },
    ),

    criterion(
      6,
      '`numeroFactura: "   "` se guarda como `null`, y `"  A-12  "` como `"A-12"`',
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prov = await proveedor();

        const enBlanco = await newTicket(a, tecnico.id, { numeroFactura: "   " });
        same(enBlanco.numeroFactura, null, "factura en blanco al crear");
        const recortada = await newTicket(a, tecnico.id, {
          proveedorId: prov.id,
          numeroFactura: "  A-12  ",
        });
        same(recortada.numeroFactura, "A-12", "factura recortada al crear");

        const editada = await update(a, recortada, { numeroFactura: "   " });
        assertStatus(editada, 200, "vaciar la factura con espacios");
        same(editada.body.numeroFactura, null, "factura en blanco al editar");
        const vuelta = await update(a, editada.body, { numeroFactura: "  B-7  " });
        assertStatus(vuelta, 200, "cargar la factura con espacios");
        same(vuelta.body.numeroFactura, "B-7", "factura recortada al editar");
      },
    ),

    criterion(
      7,
      "Dos tickets del mismo proveedor con el mismo `numeroFactura` se guardan los dos (200)",
      async () => {
        const a = await admin();
        const tecnico = await departmentNamed("Técnico");
        const prov = await proveedor();
        const factura = "0003-00004567";

        const uno = await newTicket(a, tecnico.id, {
          proveedorId: prov.id,
          numeroFactura: factura,
        });
        const dos = await newTicket(a, tecnico.id, {
          proveedorId: prov.id,
          numeroFactura: factura,
        });

        assert(uno.id !== dos.id, "se esperaban dos tickets distintos");
        same([uno.numeroFactura, dos.numeroFactura], [factura, factura], "misma factura");
      },
    ),

    criterion(
      8,
      "Cambiar la factura de un ticket deja un `AuditLog` `update` cuyo diff tiene `numeroFactura` antes y después",
      async () => {
        const a = await admin();
        const prov = await proveedor();
        const t = await newTicket(a, (await departmentNamed("Técnico")).id, {
          proveedorId: prov.id,
          numeroFactura: "A-12",
        });

        assertStatus(await update(a, t, { numeroFactura: "A-13" }), 200, "cambiar la factura");

        const rows = auditRows("Ticket", t.id);
        same(
          rows.map((r) => r.action),
          ["create", "update"],
          "acciones auditadas",
        );
        same(
          rows[1].payload,
          { before: { numeroFactura: "A-12" }, after: { numeroFactura: "A-13" } },
          "diff de la edición",
        );
        same(rows[0].payload.after.numeroFactura, "A-12", "la foto del alta guarda la factura");
      },
    ),

    criterion(
      9,
      "Una edición que solo agrega espacios en los extremos de la factura responde 200 y no deja `AuditLog`",
      async () => {
        const a = await admin();
        const prov = await proveedor();
        const t = await newTicket(a, (await departmentNamed("Técnico")).id, {
          proveedorId: prov.id,
          numeroFactura: "A-12",
        });

        const res = await update(a, t, { numeroFactura: "  A-12  " });

        assertStatus(res, 200, "edición solo con espacios");
        same(res.body.numeroFactura, "A-12", "la factura sigue igual");
        same(
          auditRows("Ticket", t.id).map((r) => r.action),
          ["create"],
          "sin auditoría nueva",
        );
        same((await get(a, t.id)).updatedAt, t.updatedAt, "el ticket no se escribió");
      },
    ),

    criterion(10, "`tickets.list` no incluye `numeroFactura` en sus filas", async () => {
      const a = await admin();
      const prov = await proveedor();
      // De hoy: la bandeja ordena por fecha de recepción descendente, así el ticket sale en la página 1.
      const t = await newTicket(a, (await departmentNamed("Técnico")).id, {
        proveedorId: prov.id,
        numeroFactura: "A-12",
        fechaRecepcion: today(),
      });

      const res = await a.get("/tickets");
      assertStatus(res, 200, "tickets.list");
      assert(
        res.body.items.some((item) => item.id === t.id),
        "el ticket con factura no aparece en la primera página",
      );
      for (const item of res.body.items) {
        assert(!("numeroFactura" in item), `la fila ${item.id} trae numeroFactura`);
      }
    }),

    // Corren los tests de los componentes de la web; no necesitan la API.
    criterion(
      11,
      "En la web, el campo «N.º de factura» está deshabilitado sin proveedor, en el alta y en la edición",
      async () => {
        vitest(
          "@syc/web",
          "los formularios del ticket",
          "test/tickets/components/CreateTicketForm.test.tsx",
          "test/tickets/components/TicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      12,
      "En la web, en la edición, cambiar el proveedor vacía el campo «N.º de factura»",
      async () => {
        vitest(
          "@syc/web",
          "el formulario de edición del ticket",
          "test/tickets/components/TicketForm.test.tsx",
        );
      },
      { infra: false },
    ),

    criterion(
      13,
      "En la web, el historial del ticket muestra el cambio con la etiqueta «N.º de factura»",
      async () => {
        vitest(
          "@syc/web",
          "el historial del ticket",
          "test/tickets/components/TicketHistory.test.tsx",
          "test/tickets/ticket-fields.test.ts",
        );
      },
      { infra: false },
    ),

    criterion(
      14,
      "La tabla §6.1 del PRD tiene la fila `numeroFactura`",
      async () => {
        const prd = readFileSync(path.join(ROOT, "docs/prd.md"), "utf8");
        const section = prd.slice(prd.indexOf("### 6.1 Campos"));
        const end = section.indexOf("\n### ", 1);
        const fila = (end === -1 ? section : section.slice(0, end))
          .split("\n")
          .find((line) => line.startsWith("|") && line.includes("`numeroFactura`"));
        assert(fila, "la tabla §6.1 de docs/prd.md no tiene una fila `numeroFactura`");
      },
      { infra: false },
    ),

    turboCriterion(15),
  ],
});
