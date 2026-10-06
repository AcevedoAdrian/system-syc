# SPEC 05 — Tickets núcleo

> **Status:** Approved
> **Depends on:** SPEC 02 (autenticación y acceso), SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos)
> **Date:** 2026-10-06
> **Objective:** módulo `tickets` con el ciclo completo de un ticket (alta con número `TE-` atómico, edición con bloqueo optimista, cambio de estado por `clave`, cambio de departamento y eliminación lógica, todo auditado y acotado por departamento en el guard), más una lista mínima, el alta y la pantalla del ticket con su historial en la web.

## Por qué existe este spec

Es el primer módulo de negocio real (PRD §1) y la etapa 4 del PRD §10, con este resultado verificable: "ciclo completo de un ticket". Q19 a Q31 (`specs/00-catalogo-specs.md`) fijan las reglas que el PRD dejaba abiertas.

Esta versión (2026-10-06) ajusta el borrador del 2026-09-29 al código real de SPEC 02, 03 y 04. Usa:

- `@RequirePermission` con `departmentFrom` y los permisos `TICKET_*` que ya existen en `src/common/permissions.ts`.
- `writeAuditEntry` dentro de la transacción, `computeDiff`, `notDeleted` y `softDeleteData`.
- `blankToNull` del contrato de catálogos y `useCatalogOptions`.
- El patrón de `DEPARTMENT_READER` para que catálogos y departamentos sepan si un ticket usa un ítem.

Además cierra lo que el borrador dejaba "para implementación", con decisiones del usuario del 2026-10-06:

- 404 para un ticket fuera del alcance.
- Edición que reemplaza todos los campos, con acciones aparte.
- Secuencia nativa de Postgres.
- "Hoy" en hora de Argentina.
- Departamento obligatorio y validado en el alta.
- Lista mínima, diálogo de estado e historial en pantalla.

## Alcance

**Dentro:**

- Modelo Prisma `Ticket` y la migración `tickets`, con:
  - la secuencia de `numero`;
  - las relaciones con `Organization`, los 7 catálogos y `User`;
  - el índice único parcial de `referenciaExterna`.
- Contrato `packages/contracts/src/tickets.ts` (`contract.tickets.*`, 8 procedimientos) y `packages/contracts/src/fields.ts` (piezas compartidas: `blankToNull`, `hoyArgentina`, fecha no futura).
- Módulo `apps/api/src/modules/tickets`:
  - `tickets.repository.ts`, `tickets.service.ts` y `tickets.controller.ts`;
  - `ticket-department.resolver.ts`, `ticket-audit-snapshot.ts` y `tickets.module.ts`.
- `PermissionsGuard`: opción `outOfScope: "not-found"` para responder 404 en vez de 403.
- `TicketUsageReader` (`src/common/ticket-usage-reader.ts`), que implementa el módulo `tickets`. Con él:
  - `CatalogsService.remove` rechaza un ítem que usa un ticket no eliminado;
  - `OrganizationsService.remove` rechaza un departamento con tickets, incluso eliminados.
- Las reglas de departamento desactivado de SPEC 02 Feature 2.3 sobre tickets: no admite altas ni recibe tickets movidos.
- Eliminar el endpoint temporal `modules/permissions-probe` y `bruno/_probe`, y pasar a tickets reales los criterios de `pnpm verify --spec 02` que lo usan.
- `apps/web`:
  - lista mínima `/tickets`, alta `/tickets/nuevo` y pantalla `/tickets/$ticketId` (formulario de datos, diálogo "Cambiar estado", "Cambiar departamento" y "Eliminar" para el admin, e historial);
  - link "Tickets" en el sidebar, `/` que redirige a `/tickets` y el indicador de `health.check` al pie del sidebar;
  - los primitivos `components/ui/textarea.tsx` y `components/ui/checkbox.tsx` (shadcn).
- Requests de Bruno en `bruno/tickets/`.
- `scripts/verify/specs/05-tickets.mjs` para `pnpm verify`.
- Actualizar `CLAUDE.md`, `apps/api/CLAUDE.md`, `docs/prd.md`, `specs/02-autenticacion-acceso.md` y `specs/06-comentarios-bandeja.md` donde este spec cambia o fija reglas.

**Fuera de alcance (para specs futuros):**

- Comentarios (SPEC 06).
- Bandeja con búsqueda, filtros, orden configurable y paginación (SPEC 06). La lista mínima de este spec se reemplaza ahí.
- Adjuntos, exportar CSV, campos personalizados y asignación a individuos (Fase 2).
- Notificaciones por correo (descartadas).
- Restaurar o listar tickets eliminados (Q12).
- Pantalla de auditoría global (Q11).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model Ticket {
  id                  String       @id @default(cuid())
  numero              Int          @unique @default(autoincrement()) // secuencia nativa `ticket_numero_seq`

  departamentoId      String
  departamento        Organization @relation(fields: [departamentoId], references: [id], onDelete: Restrict)
  areaId              String?
  area                Area?        @relation(fields: [areaId], references: [id], onDelete: Restrict)
  edificioId          String?
  edificio            Edificio?    @relation(fields: [edificioId], references: [id], onDelete: Restrict)
  tipoId              String?
  tipo                TipoTicket?  @relation(fields: [tipoId], references: [id], onDelete: Restrict)
  prioridadId         String
  prioridad           Prioridad    @relation(fields: [prioridadId], references: [id], onDelete: Restrict)
  moduloId            String?
  modulo              Modulo?      @relation(fields: [moduloId], references: [id], onDelete: Restrict)
  estadoId            String
  estado              EstadoTicket @relation(fields: [estadoId], references: [id], onDelete: Restrict)
  proveedorId         String?
  proveedor           Proveedor?   @relation(fields: [proveedorId], references: [id], onDelete: Restrict)

  titulo              String
  descripcion         String?
  actuacionSimple     String?
  referenciaExterna   String?      // "número/año" ya normalizado; único por proveedor (índice parcial)
  solucionDescripcion String?
  notificado          Boolean      @default(false)

  fechaRecepcion      DateTime     @db.Date
  fechaCierre         DateTime?    @db.Date
  fechaReabierto      DateTime?    @db.Date

  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt // también es la versión del bloqueo optimista
  createdBy           String
  creador             User         @relation("TicketCreador", fields: [createdBy], references: [id], onDelete: Restrict)
  updatedBy           String
  editor              User         @relation("TicketEditor", fields: [updatedBy], references: [id], onDelete: Restrict)
  deletedAt           DateTime?

  @@index([departamentoId])
  @@map("ticket")
}

// Relaciones inversas, sin columnas nuevas:
// - `Organization` y cada uno de los 7 catálogos suman `tickets Ticket[]`;
// - `User` suma `ticketsCreados` y `ticketsEditados`.
```

**Numeración.** `@default(autoincrement())` sobre una columna que no es `@id` crea en Postgres la secuencia `ticket_numero_seq`. `nextval()` nunca repite un número entre transacciones concurrentes, y un alta que falla después de tomarlo deja un hueco (Q21). El número nunca llega del cliente ni cambia.

**Índice único parcial**, escrito a mano en el SQL de la migración `tickets`, con un comentario (como los de `catalogos`):

```sql
CREATE UNIQUE INDEX "ticket_proveedorId_referenciaExterna_key" ON "ticket" ("proveedorId", "referenciaExterna")
  WHERE "deletedAt" IS NULL AND "referenciaExterna" IS NOT NULL;
```

```ts
// packages/contracts/src/fields.ts (nuevo; `blankToNull` se mueve acá desde catalogs.ts)
export const blankToNull = /* igual que en SPEC 04 */;
export const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
export function hoyArgentina(): string; // "YYYY-MM-DD" según ZONA_HORARIA, en el navegador y en el servidor
// Hoy o anterior en hora de Argentina. Al validarse con el mismo esquema, la web y la API usan la misma regla.
export const fechaNoFuturaSchema = z.iso.date().refine((f) => f <= hoyArgentina(), "La fecha no puede ser futura");
```

```ts
// packages/contracts/src/tickets.ts (fragmento)
export const formatTicketNumber = (numero: number) => `TE-${String(numero).padStart(6, "0")}`; // TE-1000000 sin recorte

// "019092/2026" → "19092/2026". Número solo con dígitos y distinto de 0; año entre 2000 y 2100.
export const referenciaExternaSchema = z.string().trim() /* regex ^\d+\/\d{4}$ + rango de año + transform */;

const tituloSchema = z.string().trim().min(1).max(200);
const textoLargo = blankToNull(z.string().trim().max(5000));
const idOpcional = blankToNull(z.string());

export const createTicketInputSchema = z.object({
  departamentoId: z.string(),               // obligatorio para todos; el agente manda el suyo
  titulo: tituloSchema,
  descripcion: textoLargo,
  prioridadId: z.string(),
  fechaRecepcion: fechaNoFuturaSchema,
  actuacionSimple: blankToNull(z.string().trim().max(500)),
  proveedorId: idOpcional,
  referenciaExterna: blankToNull(referenciaExternaSchema),
}); // + refine: referenciaExterna sin proveedorId → error en `referenciaExterna`

// Reemplaza todos los campos editables (como `update` de catálogos): null borra el valor.
export const updateTicketInputSchema = z.object({
  ticketId: z.string(),
  updatedAt: z.iso.datetime(),              // bloqueo optimista
  titulo: tituloSchema,
  descripcion: textoLargo,
  actuacionSimple: blankToNull(z.string().trim().max(500)),
  prioridadId: z.string(),
  areaId: idOpcional, edificioId: idOpcional, tipoId: idOpcional, moduloId: idOpcional,
  proveedorId: idOpcional,
  referenciaExterna: blankToNull(referenciaExternaSchema),
  fechaRecepcion: fechaNoFuturaSchema,
  fechaCierre: fechaNoFuturaSchema.nullable(),     // ver Feature 5.3: solo se corrige si ya tiene valor
  fechaReabierto: fechaNoFuturaSchema.nullable(),
  solucionDescripcion: textoLargo,
  notificado: z.boolean(),
}); // + el mismo refine de referencia sin proveedor

export const changeTicketStatusInputSchema = z.object({
  ticketId: z.string(),
  updatedAt: z.iso.datetime(),
  estadoId: z.string(),
  fechaCierre: fechaNoFuturaSchema.optional(),     // obligatoria si el destino tiene clave de cierre
  fechaReabierto: fechaNoFuturaSchema.optional(),  // obligatoria si el destino tiene clave REABIERTO
  solucionDescripcion: textoLargo.optional(),      // solo con destino de cierre
});

export const changeTicketDepartmentInputSchema = z.object({
  ticketId: z.string(),
  updatedAt: z.iso.datetime(),
  departamentoId: z.string(),
});

export const ticketIdInputSchema = z.object({ ticketId: z.string() });

const ref = z.object({ id: z.string(), nombre: z.string() });
export const ticketSchema = z.object({
  id: z.string(),
  numero: z.number().int(),
  departamento: ref,
  area: ref.nullable(), edificio: ref.nullable(), tipo: ref.nullable(), modulo: ref.nullable(),
  prioridad: ref,
  estado: ref.extend({ clave: claveEstadoSchema.nullable() }),
  proveedor: ref.nullable(),
  titulo: z.string(), descripcion: z.string().nullable(), actuacionSimple: z.string().nullable(),
  referenciaExterna: z.string().nullable(), solucionDescripcion: z.string().nullable(),
  notificado: z.boolean(),
  fechaRecepcion: z.iso.date(), fechaCierre: z.iso.date().nullable(), fechaReabierto: z.iso.date().nullable(),
  creador: ref, editor: ref, // `nombre` = name del usuario
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});

export const ticketSummarySchema = ticketSchema.pick({
  id: true, numero: true, titulo: true, departamento: true, estado: true, prioridad: true, fechaRecepcion: true,
});
```

**Procedimientos** (`contract.tickets`):

| Procedimiento | Método y path | Entrada | Permiso | Departamento del recurso |
|---|---|---|---|---|
| `list` | `GET /tickets` | — | `TICKET_VIEW` | filtro por `user.scope` en el service |
| `get` | `GET /tickets/{ticketId}` | `ticketIdInputSchema` | `TICKET_VIEW` | `TicketDepartmentResolver`, 404 |
| `create` | `POST /tickets` | `createTicketInputSchema` | `TICKET_CREATE` | `TicketCreateDepartmentResolver` (cuerpo), 403 |
| `update` | `PUT /tickets/{ticketId}` | `updateTicketInputSchema` | `TICKET_EDIT` | `TicketDepartmentResolver`, 404 |
| `changeStatus` | `POST /tickets/{ticketId}/status` | `changeTicketStatusInputSchema` | `TICKET_EDIT` | `TicketDepartmentResolver`, 404 |
| `changeDepartment` | `POST /tickets/{ticketId}/department` | `changeTicketDepartmentInputSchema` | `TICKET_CHANGE_DEPARTMENT` (solo admin) | — |
| `remove` | `DELETE /tickets/{ticketId}` | `ticketIdInputSchema` | `TICKET_DELETE` (solo admin) | — |
| `history` | `GET /tickets/{ticketId}/history` | `ticketIdInputSchema` | `TICKET_VIEW` | `TicketDepartmentResolver`, 404 |

Salidas:

- `list`: `ticketSummarySchema[]`.
- `get`, `create`, `update`, `changeStatus` y `changeDepartment`: `ticketSchema`.
- `remove`: `void`.
- `history`: `auditHistorySchema`.

**Foto auditable** (`ticket-audit-snapshot.ts`, `entityType: "Ticket"`):

- Datos del ticket: `numero`, `titulo`, `descripcion`, `actuacionSimple`, `referenciaExterna`, `solucionDescripcion`, `notificado`, `fechaRecepcion`, `fechaCierre` y `fechaReabierto`. Las fechas van como `"YYYY-MM-DD"`.
- Referencias, como `{ id, nombre }` o `null`: `departamento`, `area`, `edificio`, `tipo`, `prioridad`, `modulo`, `estado` y `proveedor`.
- El nombre va dentro de la foto para que el historial siga legible si después se renombra o se elimina el ítem.

Convenciones:

- `numero` es un entero. Solo se muestra con `formatTicketNumber`: 6 dígitos con ceros hasta `TE-999999`, y desde `TE-1000000` sin relleno (Q21, P9, P12).
- "Estado de cierre" significa uno con `clave` `FINALIZADO`, `CERRADO` o `CANCELADO` (SPEC 04 Feature 4.4). Ninguna regla compara `nombre`.
- "Hoy" es siempre `hoyArgentina()`, sin importar la zona horaria del contenedor.
- **Referencia válida** (catálogo o departamento): si el valor es el mismo que ya tiene el ticket, se acepta aunque el ítem hoy esté inactivo o eliminado. Si es un valor nuevo, debe existir, no estar eliminado y estar activo.

## Contrato

**Feature 5.1: Alta**

- **MUST:**
  - `departamentoId` es obligatorio en el payload para todos:
    - un agente solo puede mandar el suyo: `TicketCreateDepartmentResolver` lo lee del cuerpo y el guard compara;
    - el admin elige cualquiera (PRD §4.2, SPEC 02 Feature 2.5).
  - El departamento debe existir y estar activo. Un departamento desactivado no admite tickets nuevos, tampoco de sus propios agentes (SPEC 02 Feature 2.3).
  - Campos del alta, todos con los límites del contrato y recortados (Q19):
    - obligatorios: `titulo`, `departamentoId`, `prioridadId` y `fechaRecepcion`;
    - opcionales: `descripcion`, `actuacionSimple`, `proveedorId` y `referenciaExterna`.
  - `fechaRecepcion` es hoy o una fecha anterior. El formulario propone hoy (Q20).
  - `prioridadId` y `proveedorId` cumplen "referencia válida": en el alta siempre son valores nuevos.
  - `area`, `edificio`, `tipo` y `modulo` nacen en `null`; se completan en la edición (Q19).
  - El ticket nace en el primer estado activo según el orden de `catalogs.estados.list` (Q17). `notificado` nace en `false`. `fechaCierre`, `fechaReabierto` y `solucionDescripcion` nacen en `null`.
  - El número lo toma la secuencia (Feature 5.2).
  - `createdBy` = `updatedBy` = `@CurrentUser()`.
  - Se audita `create` con `{ after }` en la misma transacción.
  - Responde el ticket completo (`ticketSchema`).
- **EDGE CASES:**
  - Un agente manda el `departamentoId` de otro departamento, o no lo manda: 403.
  - Departamento inexistente: 400. Departamento desactivado: 409 ("El departamento está desactivado: no admite tickets nuevos").
  - `prioridadId` o `proveedorId` inexistente, eliminado o inactivo: 400.
  - `referenciaExterna` sin `proveedorId`: 400 (Feature 5.5).
  - `fechaRecepcion` futura: 400.
- **MUST NOT:**
  - Deducir el departamento del creador cuando carga el admin (PRD §4.1).
  - Pedir área, edificio, tipo, módulo, estado, fechas de cierre o reapertura, solución o `notificado` en el alta.
  - Aceptar `numero`, `estadoId`, `createdBy` o `updatedBy` desde el cliente.

**Feature 5.2: Numeración interna**

- **MUST:**
  - Una sola secuencia continua para todos los tickets, con prefijo fijo `TE`, sin año ni departamento (P9, P12).
  - La genera Postgres (`ticket_numero_seq`). Es única e inmutable.
  - Un ticket eliminado conserva su número, y ese número nunca se reutiliza (Q21).
  - Se toleran huecos (Q21).
- **EDGE CASES:** dos altas concurrentes reciben números distintos. Lo garantiza la secuencia, no la aplicación.
- **MUST NOT:** numerar por departamento, año o proveedor; que el prefijo codifique algo; que el usuario edite el número.

**Feature 5.3: Edición**

- **MUST:**
  - Editan el admin y los agentes del departamento del ticket, también con el ticket en un estado de cierre (Q23).
  - `update` reemplaza todos los campos editables (los de `updateTicketInputSchema`). `null` o un texto en blanco borra el valor opcional.
  - Las referencias cumplen "referencia válida": un área que se desactivó después se puede seguir mandando sin cambios.
  - `fechaRecepcion` se puede corregir, con la misma regla del alta.
  - `solucionDescripcion` se edita siempre.
  - `fechaCierre` y `fechaReabierto` se pueden corregir (hoy o anterior) solo si el ticket ya tiene un valor. No se pueden cargar desde `null` ni volver a `null` por esta vía: eso pasa solo al cambiar de estado (Feature 5.4).
  - **Bloqueo optimista** (Q22), igual en `update`, `changeStatus` y `changeDepartment`:
    - el cliente manda el `updatedAt` que leyó;
    - el repository escribe con `where: { id, updatedAt, deletedAt: null }`;
    - si no actualiza ninguna fila, responde 409 ("Otro usuario modificó este ticket. Recargá para ver los cambios.") y no guarda nada.
  - Si la foto auditable no cambia, responde 200 con el ticket, no escribe y no audita. El `updatedAt` desactualizado se chequea antes y da 409 aunque no haya cambios.
  - Cada edición con cambios actualiza `updatedBy` y `updatedAt`, y audita `update` con el diff.
- **EDGE CASES:**
  - `updatedAt` desactualizado: 409.
  - Un área (u otro catálogo) nueva inactiva o eliminada: 400.
  - Cargar `fechaCierre` en un ticket que no la tiene, o borrarla: 400.
  - Un ticket inexistente o eliminado: 404.
  - Un ticket de otro departamento, para un agente: 404 (Feature 5.8).
- **MUST NOT:** editar `numero`, `estadoId`, `departamentoId`, `createdAt` o `createdBy` por `update`.

**Feature 5.4: Cambio de estado y cierre**

- **MUST:**
  - Se puede pasar de cualquier estado a cualquier estado activo, sin máquina de transiciones (Q25).
  - Destino con clave de cierre:
    - exige `fechaCierre` en la misma request;
    - `solucionDescripcion` es opcional y, si viene, reemplaza la actual (en blanco la borra) (Q17, Q25);
    - si se pasa de un estado de cierre a otro, `fechaCierre` llega igual en la request (el diálogo propone la actual) y nunca se recalcula sola (Q25, Q26).
  - Destino con clave `REABIERTO`:
    - exige `fechaReabierto`;
    - `fechaCierre` y `solucionDescripcion` se conservan (Q25).
  - Destino sin clave, o con otra clave: ninguna fecha ni la solución se piden ni se modifican (Q26).
  - Elegir el estado actual sigue las mismas reglas. Sin cambios efectivos, no audita.
  - `notificado` no participa: es una casilla manual de `update`, que no dispara avisos (Q27).
  - Asociar o cambiar un proveedor no cambia el estado (Q28).
  - Aplica el bloqueo optimista de Feature 5.3.
  - Audita `update` con el diff (estado anterior y nuevo, y fechas o solución si cambiaron).
- **EDGE CASES:**
  - Destino de cierre sin `fechaCierre`: 400. Destino `REABIERTO` sin `fechaReabierto`: 400. El estado no cambia.
  - Mandar `fechaCierre`, `fechaReabierto` o `solucionDescripcion` con un destino que no las admite: 400.
  - Una fecha futura: 400.
  - Estado destino inactivo, eliminado o inexistente: 400.
- **MUST NOT:** una casilla `cerrado`; exigir `solucionDescripcion`; comparar `nombre`; notificaciones por correo.

**Feature 5.5: Proveedor y referencia externa**

- **MUST:**
  - `proveedor` es opcional siempre.
  - `referenciaExterna` exige `proveedorId` en la misma request (Q29).
  - Formato `número/año`: el número tiene solo dígitos, y el año 4 dígitos entre 2000 y 2100. El contrato quita los ceros a la izquierda (`019092/2026` → `19092/2026`) y rechaza el número `0` (Q29).
  - En blanco se guarda `null`.
  - Es única por proveedor entre los tickets no eliminados (P11):
    - el service chequea antes de escribir y responde 409;
    - el índice parcial cubre la carrera, y el repository traduce `P2002` a 409.
  - El mensaje del 409 nombra el ticket existente (`TE-000013`) solo si el usuario puede verlo. Si no, dice "Esa referencia ya está cargada en otro ticket de ese proveedor".
  - Al quitar el proveedor, la referencia se borra en la misma operación: mandar `proveedorId: null` con referencia es 400.
  - Al cambiar de proveedor, el formulario vacía la referencia y se guarda lo que se cargue para el nuevo (Q30). El historial conserva el valor anterior.
- **EDGE CASES:**
  - El mismo número con otro proveedor: se permite.
  - Eliminar el ticket libera la referencia.
  - `000/2026` o `5/1999`: 400.
- **MUST NOT:** guardar la referencia en el catálogo de Proveedores (P1); aceptar referencia sin proveedor.

**Feature 5.6: Cambio de departamento**

- **MUST:**
  - Solo el admin (`TICKET_CHANGE_DEPARTMENT`); un agente recibe 403 (Q24).
  - El departamento nuevo cumple "referencia válida": existe y está activo (SPEC 02 Feature 2.3).
  - Conserva número, historial y (desde SPEC 06) comentarios. Desde el cambio, editan los agentes del departamento nuevo.
  - Aplica el bloqueo optimista y audita `update` con `departamento` en el diff.
- **EDGE CASES:**
  - Departamento desactivado: 409. Inexistente: 400.
  - El mismo departamento: 200, sin auditoría.
- **MUST NOT:** un `departamentoId` dentro de `update`.

**Feature 5.7: Historial y eliminación**

- **MUST:**
  - `history` devuelve `AuditService.history("Ticket", ticketId)`, del más reciente al más antiguo. No hay tabla de historial propia.
  - Lo ve quien ve el ticket.
  - El admin puede leer el historial de un ticket eliminado por la API. Un agente recibe 404, porque el ticket ya no existe para él.
  - Eliminar es solo del admin (`TICKET_DELETE`); un agente recibe 403, también en su propio departamento (Q31).
  - La eliminación es lógica (`softDeleteData`) y se audita `delete` con `{}`.
  - El ticket eliminado sale de `list` y de `get`. Su número no se reutiliza y su referencia queda libre.
- **EDGE CASES:** eliminar un ticket ya eliminado o inexistente: 404.
- **MUST NOT:** `DELETE` físico.

**Feature 5.8: Alcance por departamento (guard)**

- **MUST:**
  - `@RequirePermission` suma la opción `outOfScope: "not-found"`. Con ella, `PermissionsGuard` responde 404 ("El ticket no existe") en vez de 403 cuando el resolver devuelve `null` o un departamento que no es el del agente. Sin la opción, el comportamiento sigue igual (403).
  - Los tickets la usan en `get`, `update`, `changeStatus` y `history`.
  - `create` no la usa: un payload manipulado no revela nada y sigue en 403 (SPEC 02 Feature 2.5).
  - `TicketDepartmentResolver` lee `params.ticketId` y devuelve el departamento del ticket no eliminado, o `null`.
  - El admin no pasa por el resolver: su 404 lo da el service.
  - `list` filtra con `user.scope.departmentId`: el agente ve su departamento y el admin todos.
  - Lo implementa el módulo `tickets`, que reemplaza al probe de SPEC 02. `modules/permissions-probe` y `bruno/_probe` se eliminan.
- **EDGE CASES:**
  - Un agente pide `get` de un ticket de otro departamento y de uno que no existe: los dos dan 404 con el mismo cuerpo.
  - Un agente sin `Member`: 403 (SPEC 02).
- **MUST NOT:** decidir permisos o alcance dentro del service; comparar contra `createdBy` (PRD §4.1).

**Feature 5.9: Ítems en uso**

- **MUST:**
  - `src/common/ticket-usage-reader.ts` define `TICKET_USAGE_READER` con dos métodos:
    - `countByCatalogItem(ruta, itemId)` cuenta los tickets **no eliminados**;
    - `countByDepartment(departmentId)` cuenta los tickets, **incluidos los eliminados**.
  - `TicketsModule` es `@Global()` y lo provee con `useExisting: TicketsRepository`.
  - `CatalogsService.remove` rechaza con 409 un ítem que usa un ticket no eliminado: "Lo usa al menos un ticket: desactivalo en lugar de eliminarlo" (Q13, PRD §6.2). Se corrige el comentario del método, que hoy dice "ni siquiera eliminados".
  - `OrganizationsService.remove` rechaza con 409 un departamento con tickets, incluso eliminados (D2 ajustado, SPEC 02 Feature 2.3), porque la FK es `Restrict` y `Organization` se borra físicamente.
- **EDGE CASES:**
  - Un ítem usado solo por tickets eliminados: se puede eliminar.
  - Un departamento con un solo ticket, eliminado: 409.
- **MUST NOT:** que `catalogs` u `organizations` consulten la tabla `ticket` directamente.

**Feature 5.10: Web**

- **MUST:**
  - Navegación:
    - El sidebar suma "Tickets" (`/tickets`) para todos los usuarios.
    - `/` redirige a `/tickets`.
    - El estado de `health.check` pasa a un indicador al pie del sidebar (`features/health/components/HealthIndicator.tsx`), que reemplaza a `HealthStatusCard` (SPEC 01 sigue cumpliéndose).
  - Lista mínima (`routes/_authenticated/tickets/index.tsx`):
    - Los 50 tickets más recientes por `numero` descendente, sin filtros ni paginación.
    - Columnas: Número, Título, Departamento, Estado, Prioridad y Fecha de recepción.
    - Cada fila abre `/tickets/$ticketId`.
    - Tiene el botón "Nuevo ticket" y un estado vacío.
  - Alta (`routes/_authenticated/tickets/nuevo.tsx`):
    - Departamento: el admin elige entre los activos; el agente ve el suyo como texto y se manda fijo.
    - Título, Prioridad (opciones activas), Fecha de recepción (propone hoy), Descripción, Actuación simple, Proveedor y Referencia externa (deshabilitada sin proveedor).
    - Al guardar, navega al ticket.
  - Pantalla del ticket (`routes/_authenticated/tickets/$ticketId.tsx`):
    - Encabezado: número, estado actual y departamento.
    - Botón "Cambiar estado", que abre un diálogo:
      - estados activos, sin el actual;
      - con destino de cierre: fecha de cierre (propone la actual, o si no hoy) y solución (precargada);
      - con destino `REABIERTO`: fecha de reapertura (propone hoy).
    - Formulario de datos con todos los campos de `update`:
      - `fechaCierre` y `fechaReabierto` solo aparecen si tienen valor;
      - al cambiar de proveedor se vacía la referencia.
    - Para el admin, además: "Cambiar departamento" (diálogo) y "Eliminar" (confirmación y vuelta a `/tickets`).
    - Historial debajo: fecha, usuario y una línea por campo ("Estado: Pendiente → En progreso"), con etiquetas en `features/tickets/ticket-fields.ts` y el `nombre` de las referencias de la foto.
  - Selectores de catálogo: ofrecen las opciones activas (`useCatalogOptions`) más el valor actual del ticket si está inactivo o eliminado, marcado "(inactivo)". El valor actual sale de `ticketSchema`.
  - Un 409 por bloqueo optimista muestra el mensaje y un botón "Recargar", que vuelve a leer el ticket y reinicia el formulario. Un 404 muestra "El ticket no existe" con un link a `/tickets`.
  - Hooks en `features/tickets/hooks`: `useTickets`, `useTicket`, `useTicketHistory`, `useCreateTicket`, `useUpdateTicket`, `useChangeTicketStatus`, `useChangeTicketDepartment` y `useRemoveTicket`. Cada mutación invalida el ticket, su historial y la lista.
  - Los formularios usan react-hook-form con los esquemas del contrato.
- **MUST NOT:**
  - Que una ruta llame al cliente oRPC directo.
  - Mostrar "Cambiar departamento" o "Eliminar" a un agente (la API igual lo rechaza).
  - Filtros o búsqueda en la lista (SPEC 06).

## Plan de implementación

1. **Esquema.** `Ticket` y las relaciones inversas en `schema.prisma`, y la migración `tickets`. Al SQL se le agrega a mano el índice parcial de referencia, con su comentario. Verificar:
   - `prisma migrate dev` aplica limpio, y un segundo `migrate dev` no genera nada;
   - `SELECT pg_get_serial_sequence('ticket','numero')` devuelve `public.ticket_numero_seq`.
2. **Contrato.** `fields.ts` (con `blankToNull` movido y reexportado sin romper `catalogs.ts`), `tickets.ts` y `contract.tickets` en `index.ts`. Verificar con `tickets.spec.ts`:
   - `019092/2026` → `19092/2026`;
   - `000/2026` y `5/1999` se rechazan;
   - referencia sin proveedor se rechaza;
   - mañana (en Argentina) se rechaza;
   - `formatTicketNumber(13)` = `TE-000013` y `formatTicketNumber(1000000)` = `TE-1000000`.
3. **Guard.** Opción `outOfScope: "not-found"` en `RequirePermissionOptions` y `PermissionsGuard`. Verificar con `permissions.guard.spec.ts`: con la opción, otro departamento y `null` dan 404; sin ella, siguen en 403.
4. **Alta, detalle y lista.** En `modules/tickets`:
   - repository: `create` con `writeAuditEntry`, `findDetail`, `findRecent(scope, 50)` y `findDepartmentId`;
   - `ticket-audit-snapshot.ts`;
   - service: `create`, `get` y `list` (Features 5.1 y 5.2).

   Verificar con `tickets.service.spec.ts`: estado inicial = primer activo; departamento desactivado → 409; prioridad inactiva → 400.
5. **Edición.** `update` con referencia válida, reglas de fechas y bloqueo optimista en el repository (Features 5.3 y 5.5). Verificar con tests: área inactiva sin cambios → ok; área nueva inactiva → 400; sin cambios → no audita; referencia duplicada → 409.
6. **Estado.** `changeStatus` (Feature 5.4). Verificar con tests: Finalizado sin fecha → 400; Reabierto conserva `fechaCierre` y solución; destino sin clave con `fechaCierre` → 400.
7. **Departamento, eliminación e historial.** `changeDepartment`, `remove` y `history` (Features 5.6 y 5.7). Verificar con tests: departamento desactivado → 409; eliminar dos veces → 404.
8. **Controller.** `tickets.controller.ts`:
   - un método `@Implement(contract.tickets.<procedimiento>)` por procedimiento, como `health.controller.ts`, porque cada uno tiene su permiso;
   - un `satisfies Record<keyof typeof contract.tickets, …>` para que el compilador marque el que falte;
   - los dos resolvers y `TicketsModule` en `app.module.ts`;
   - se eliminan `modules/permissions-probe` y `bruno/_probe`, y se suma `bruno/tickets/`.

   Los criterios de `scripts/verify/specs/02-autenticacion.mjs` que usan `/_probe` pasan a tickets reales (404 al ver o editar, 403 al crear en otro departamento). Verificar: `pnpm verify --spec 02` pasa.
9. **Ítems en uso.** `ticket-usage-reader.ts`, su provisión global y los chequeos en `CatalogsService.remove` y `OrganizationsService.remove` (Feature 5.9). Verificar con los tests de los dos services: en uso → 409; usado solo por eliminados → ok (catálogo).
10. **Web, base.**
    - `components/ui/textarea.tsx` y `checkbox.tsx`;
    - `features/tickets/hooks`;
    - `TicketsList` y la ruta `tickets/index.tsx`;
    - `CreateTicketForm` y la ruta `tickets/nuevo.tsx`;
    - el link del sidebar, `HealthIndicator` y la redirección de `/`.

    Verificar:
    - un agente crea un ticket y lo ve en la lista;
    - el alta no muestra estado, área, edificio, tipo ni módulo;
    - el test del indicador reemplaza el de Inicio.
11. **Web, pantalla del ticket.** `TicketForm`, `ChangeStatusDialog`, `ChangeDepartmentDialog`, la eliminación, `TicketHistory`, `ticket-fields.ts` y `CatalogOptionSelect` (activos más el actual inactivo). Verificar:
    - dos pestañas editan el mismo ticket y la segunda muestra el 409 con "Recargar";
    - el historial muestra "Estado: Pendiente → En progreso".
12. **Verificación y documentación.**
    - `scripts/verify/specs/05-tickets.mjs`, agregado a `specs/index.mjs`;
    - `CLAUDE.md`: estado del repositorio, sin el probe y con `pnpm verify` de SPEC 01 a 05;
    - `apps/api/CLAUDE.md`: módulo `tickets`, `outOfScope`, `TICKET_USAGE_READER`, controller con un método por procedimiento e índice parcial de referencia;
    - `packages/db/CLAUDE.md`: índice parcial y secuencia de `ticket`;
    - `docs/prd.md`:
      - §4.2: 404 fuera del alcance;
      - §6.1: `fechaRecepcion` editable, y `fechaCierre`, `fechaReabierto` y la solución corregibles en la edición;
      - §6.4: lista mínima;
    - `specs/02-autenticacion-acceso.md`: nota en Feature 2.5 sobre el 404 desde SPEC 05 y el fin del probe;
    - `specs/06-comentarios-bandeja.md`: el 404 ya está resuelto, la ruta es `/tickets/$ticketId` y la bandeja reemplaza a la lista mínima.

    Verificar: `pnpm verify --spec 05` pasa.

## Criterios de aceptación

- [ ] Un agente crea un ticket con su `departamentoId`, y el ticket queda en su departamento. Con el `departamentoId` de otro departamento, o sin él, recibe 403.
- [ ] El admin crea un ticket en cualquier departamento activo. En uno desactivado recibe 409, y un agente de ese departamento también.
- [ ] El ticket nace en el primer estado activo del orden, con `notificado: false`, área, edificio, tipo y módulo en `null`, y un `AuditLog` `create` del usuario.
- [ ] 20 altas en paralelo reciben 20 números distintos. `formatTicketNumber` da `TE-000013` y `TE-1000000`.
- [ ] `fechaRecepcion` de mañana (hora de Argentina) devuelve 400. Hoy funciona.
- [ ] `referenciaExterna` sin `proveedorId` devuelve 400. `019092/2026` se guarda como `19092/2026`, y `000/2026` devuelve 400.
- [ ] Dos tickets no eliminados con el mismo proveedor y la misma referencia: el segundo devuelve 409. Con otro proveedor funciona. Después de eliminar el primero, funciona.
- [ ] Editar con un `updatedAt` viejo devuelve 409 y no cambia nada. Una edición sin cambios responde 200 y no deja `AuditLog`.
- [ ] Un ticket cuya área se desactivó después se edita sin cambiar el área y guarda. Elegir otra área inactiva devuelve 400.
- [ ] Pasar a Finalizado sin `fechaCierre` devuelve 400. Con `fechaCierre` y sin solución funciona.
- [ ] Pasar a Reabierto exige `fechaReabierto` y conserva `fechaCierre` y `solucionDescripcion`.
- [ ] Renombrar "Finalizado" a "Resuelto" no cambia la exigencia de `fechaCierre`.
- [ ] Con el ticket cerrado, la edición corrige `fechaCierre` y la solución. Cargar `fechaCierre` en un ticket que nunca la tuvo devuelve 400.
- [ ] Un agente recibe 404, con el mismo cuerpo, en `get`, `update`, `changeStatus` y `history` de un ticket de otro departamento y de un id inexistente. `list` nunca le devuelve tickets de otro departamento.
- [ ] Un agente recibe 403 en `remove` y `changeDepartment`, también sobre un ticket de su propio departamento.
- [ ] El admin cambia el departamento de un ticket. Después, un agente del departamento nuevo lo edita y uno del anterior recibe 404.
- [ ] Un ticket eliminado no aparece en `list`, y `get` responde 404. Su historial sigue en `AuditLog` y el admin lo lee por `history`.
- [ ] Cada operación (`create`, `update`, `changeStatus`, `changeDepartment` y `remove`) deja exactamente un `AuditLog` con `entityType: "Ticket"`. El diff de estado muestra `{ id, nombre }`.
- [ ] Eliminar un ítem de catálogo que usa un ticket no eliminado devuelve 409. Si solo lo usan tickets eliminados, funciona.
- [ ] Eliminar un departamento con tickets, aunque estén eliminados, devuelve 409.
- [ ] Un ticket cuyo ítem de catálogo se eliminó sigue mostrando el nombre en `get` y en el historial.
- [ ] En la web, el agente crea un ticket desde `/tickets/nuevo`, lo ve en `/tickets`, lo pasa a Finalizado desde el diálogo y ve el cambio en el historial. No ve "Cambiar departamento" ni "Eliminar".
- [ ] `/_probe/*` responde 404. `pnpm verify --spec 02` sigue pasando con tickets reales.
- [ ] `pnpm verify --spec 05` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** 404 para un ticket fuera del alcance del agente, en ver, editar, cambiar estado e historial (decisión del usuario, 2026-10-06).
  - No confirma que el número existe en otro departamento.
  - Se implementa con la opción `outOfScope` del guard, así el resto de los endpoints sigue en 403.
  - Reemplaza el 403 de SPEC 02 Feature 2.5 para tickets y resuelve la propuesta de SPEC 06 Feature 6.3.
- **Sí:** `create` sigue en 403 ante un payload manipulado (SPEC 02 Feature 2.5): no revela la existencia de nada.
- **Sí:** `departamentoId` obligatorio en el alta, validado por el guard (decisión del usuario, 2026-10-06).
  - Descartado: ignorarlo en silencio, porque contradice el edge case de SPEC 02.
- **Sí:** `update` reemplaza todos los campos editables, y estado, departamento y eliminación son procedimientos aparte (decisión del usuario, 2026-10-06).
  - Cada uno lleva su permiso en el guard.
  - Borrar un campo es `null`, sin ambigüedad, igual que en catálogos.
  - Descartado: el PATCH parcial del borrador, que obligaba al service a decidir quién cambia el departamento.
- **Sí:** número con secuencia nativa de Postgres (`autoincrement()` → `ticket_numero_seq`) (decisión del usuario, 2026-10-06).
  - Descartado: la fila con `SELECT … FOR UPDATE`, porque serializa las altas sin necesidad. Q21 tolera huecos.
- **Sí:** "hoy" en `America/Argentina/Buenos_Aires`, calculado en el contrato (`hoyArgentina`), así la web y la API aplican la misma regla (decisión del usuario, 2026-10-06). Las fechas se guardan como `date` de Postgres.
- **Sí:** `TicketUsageReader` en `src/common`, provisto por `tickets`, igual que `DEPARTMENT_READER` (decisión del usuario, 2026-10-06).
  - Catálogos y departamentos no conocen la tabla `ticket`.
  - El repository de tickets sí lee las filas de catálogo que referencia (son sus FK), para validar activo o eliminado y para el detalle.
- **Sí:** un ítem de catálogo en uso cuenta solo tickets no eliminados (PRD §6.2), mientras que un departamento cuenta también los eliminados (SPEC 02 D2). Un catálogo eliminado es lógico y la FK sigue válida, pero un departamento se borra físicamente.
- **Sí:** "referencia válida": un valor sin cambios se acepta aunque esté inactivo o eliminado. Con la edición que reemplaza todo, cualquier ticket con un área desactivada quedaría imposible de guardar.
- **Sí:** foto auditable con `{ id, nombre }` en las referencias (decisión del usuario, 2026-10-06: historial en pantalla). El historial sigue legible si el ítem se renombra o se elimina.
- **Sí:** `fechaRecepcion` editable (decisión del usuario, 2026-10-06), con la misma regla del alta. El borrador la dejaba fija.
- **Sí:** `solucionDescripcion` editable siempre, y `fechaCierre` y `fechaReabierto` corregibles en la edición solo si ya tienen valor (decisión del usuario, 2026-10-06). Descartado: corregir eligiendo el mismo estado en el diálogo.
- **Sí:** diálogo "Cambiar estado" separado del formulario de datos (decisión del usuario, 2026-10-06). Descartado: un solo formulario que dispare dos procedimientos, porque uno podría guardar y el otro fallar.
- **Sí:** lista mínima de los 50 más recientes, sin filtros, que SPEC 06 reemplaza (decisión del usuario, 2026-10-06). Sin ella, un ticket solo se alcanza por URL.
- **Sí:** `/` redirige a `/tickets`, y `health.check` pasa a un indicador al pie del sidebar (decisión del usuario, 2026-10-06). SPEC 01 sigue cumpliéndose.
- **Sí:** el 409 por referencia duplicada nombra el ticket solo si el usuario lo puede ver, por coherencia con el 404.
- **Sí:** `solucionDescripcion` opcional, sin casilla `cerrado` y con `fechaReabierto` como campo nuevo (Q17, Q25, D1; ya volcados en `docs/prd.md` v4).
- **Sí:** solo el admin elimina tickets (Q31).
- **No:** máquina de estados con transiciones restringidas (Q25).
- **No:** una tabla de historial propia de `Ticket`: se usa `AuditLog`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `@orpc/nest` podría no exponer `request.params.ticketId` o `request.body` al guard, que corre antes del handler. | El paso 8 lo verifica con `pnpm verify --spec 02` y `--spec 05`. Si falla, el resolver lee la ruta de `request.url` con el patrón del contrato. |
| La excepción de Nest (404 del guard) no tiene el formato de error de oRPC, y la web podría no leer el mensaje. | La pantalla trata cualquier 404 como "El ticket no existe", sin depender del mensaje. Un test del guard fija el status. |
| Prisma no conoce el índice parcial de referencia, y un `migrate dev` futuro podría proponer borrarlo. | Igual que en catálogos: comentario en el SQL y verificación en el paso 1. |
| `TicketsModule` global, inyectado en `catalogs` y `organizations`, puede crear una dependencia circular de Nest. | `tickets` no importa ni `CatalogsModule` ni `OrganizationsModule`: lee sus FK desde su propio repository. |
| El bloqueo optimista frustra a quien guarda justo después de otro. | Mensaje claro y botón "Recargar" (Feature 5.10). |
| `hoyArgentina()` depende de que el runtime tenga datos de zona horaria (ICU). | Node 22 y los navegadores actuales traen ICU completo. Un test fija una fecha cerca de la medianoche. |

## Qué **no** está en este spec

- Comentarios, bandeja con búsqueda, filtros y paginación, y el detalle de SPEC 06 (que reemplaza la lista mínima).
- Adjuntos, exportar CSV, campos personalizados y asignación a individuos (Fase 2).
- Notificaciones por correo.
- Restaurar o listar tickets eliminados, y una pantalla de auditoría global.
- Máquina de estados restringida.
