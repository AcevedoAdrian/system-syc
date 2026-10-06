# SPEC 06 — Comentarios, bandeja y detalle

> **Status:** Approved
> **Depends on:** SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos), SPEC 05 (tickets núcleo)
> **Date:** 2026-10-06
> **Objective:** comentarios inmutables en la pantalla del ticket (solo el admin los elimina) y una bandeja en `/tickets` con búsqueda sin mayúsculas ni acentos, filtros y 20 tickets por página, siempre acotada al departamento del agente.

## Por qué existe este spec

Es la etapa 5 del PRD §10, con este resultado verificable: "un agente encuentra y sigue tickets". SPEC 05 deja una lista mínima de los 50 más recientes, sin búsqueda: pasado ese número, un ticket solo se alcanza por URL. Q32 a Q35 y D3 (`specs/00-catalogo-specs.md`) fijan las reglas.

Esta versión (2026-10-06) ajusta el borrador del 2026-09-29 al código real de SPEC 05. Usa:

- `@RequirePermission` con `TicketDepartmentResolver` y `outOfScope: "not-found"` para los comentarios, igual que `get` y `history`.
- `PERMISSIONS.COMMENT_DELETE`, que ya existe en `src/common/permissions.ts` (solo admin).
- `writeAuditEntry` dentro de la transacción, `notDeleted` y `softDeleteData`.
- `TicketsTable` (TanStack Table v9) y `validateSearch` de TanStack Router, como en `/admin/catalogos`.

Además cierra lo que el borrador dejaba abierto, con decisiones del usuario del 2026-10-06:

- Búsqueda con la extensión `unaccent` de Postgres.
- Comentarios auditados en el historial del ticket, sin el texto.
- `TicketComentario` con los campos base completos de SPEC 03.
- Comentar no modifica el ticket.
- Filtro de departamento solo para el admin.
- Orden fijo, búsqueda al escribir, comentarios del más antiguo al más reciente.

## Alcance

**Dentro:**

- Modelo Prisma `TicketComentario` y la migración `comentarios`, que además activa la extensión `unaccent`.
- Contrato `packages/contracts/src/comments.ts` (`contract.comments.*`, 3 procedimientos).
- `packages/contracts/src/tickets.ts`: `tickets.list` pasa a recibir filtros y página, y devuelve una página con el total. `ticketSummarySchema` suma `area`.
- En `apps/api/src/modules/tickets` (PRD §8.2: `tickets` incluye comentarios):
  - `comments.repository.ts`, `comments.service.ts` y `comments.controller.ts`;
  - `TicketsRepository.findPage` reemplaza a `findRecent`, y `TicketsService.list` recibe los filtros.
- `apps/web`:
  - la bandeja en `/tickets` (reemplaza la lista mínima): búsqueda, filtros en la URL, paginación y la columna Área;
  - la sección "Comentarios" en `/tickets/$ticketId`, entre el formulario y el historial;
  - las líneas "Comentario agregado" y "Comentario eliminado" en el historial.
- Requests de Bruno en `bruno/comments/` y el listado con filtros en `bruno/tickets/`.
- `scripts/verify/specs/06-comentarios-bandeja.mjs` para `pnpm verify`.
- Actualizar `CLAUDE.md`, `apps/api/CLAUDE.md`, `packages/db/CLAUDE.md`, `docs/prd.md` y `specs/00-catalogo-specs.md` donde este spec cambia o fija reglas.

**Fuera de alcance (para specs futuros):**

- Exportar a CSV (Fase 2, PRD §5.2).
- Editar un comentario (Q32: inmutables).
- Adjuntos, menciones o notificaciones sobre comentarios (Fase 2 o descartado).
- Columnas ordenables o un orden elegido por el usuario.
- Filtro por agente asignado (Fase 2: el campo no existe).
- Selección múltiple de estados, o un atajo "abiertos/cerrados".
- Restaurar comentarios eliminados o listarlos (Q12).
- Paginación por cursor.

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model TicketComentario {
  id        String    @id @default(cuid())
  ticketId  String
  ticket    Ticket    @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  texto     String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt // solo cambia al eliminarlo: no hay edición
  createdBy String
  autor     User      @relation("TicketComentarioAutor", fields: [createdBy], references: [id], onDelete: Restrict)
  updatedBy String
  editor    User      @relation("TicketComentarioEditor", fields: [updatedBy], references: [id], onDelete: Restrict)
  deletedAt DateTime?

  @@index([ticketId, createdAt])
  @@map("ticket_comentario")
}

// Relaciones inversas, sin columnas nuevas:
// - `Ticket` suma `comentarios TicketComentario[]`;
// - `User` suma `comentariosCreados` y `comentariosEditados`.
```

La migración `comentarios` suma a mano, con un comentario, `CREATE EXTENSION IF NOT EXISTS unaccent;`. `unaccent` viene en la imagen `postgres:17-alpine` y es una extensión *trusted*: no exige superusuario.

```ts
// packages/contracts/src/comments.ts
export const comentarioTextoSchema = z.string().trim().min(1).max(2000);

export const ticketCommentsInputSchema = z.object({ ticketId: z.string() });
export const createCommentInputSchema = z.object({ ticketId: z.string(), texto: comentarioTextoSchema });
export const removeCommentInputSchema = z.object({ ticketId: z.string(), comentarioId: z.string() });

export const commentSchema = z.object({
  id: z.string(),
  texto: z.string(),
  autor: z.object({ id: z.string(), nombre: z.string() }), // `nombre` = name del usuario
  createdAt: z.iso.datetime(),
});
```

```ts
// packages/contracts/src/tickets.ts (fragmento)
export const TICKETS_PAGE_SIZE = 20;

const filtroId = /* string vacío o ausente → undefined */;
export const listTicketsInputSchema = z.object({
  q: /* trim, max 200; en blanco → undefined */,
  estadoId: filtroId, areaId: filtroId, edificioId: filtroId, tipoId: filtroId,
  prioridadId: filtroId, proveedorId: filtroId, moduloId: filtroId,
  departamentoId: filtroId,                       // solo lo aplica el admin
  fechaRecepcionDesde: z.iso.date().optional(),   // inclusive
  fechaRecepcionHasta: z.iso.date().optional(),   // inclusive
  page: z.coerce.number().int().min(1).default(1), // llega como texto en la query string
}); // + refine: desde > hasta → error en `fechaRecepcionHasta`

export const ticketSummarySchema = ticketSchema.pick({
  id: true, numero: true, titulo: true, departamento: true, estado: true,
  prioridad: true, area: true, fechaRecepcion: true,
});

export const ticketsPageSchema = z.object({
  items: z.array(ticketSummarySchema),
  total: z.number().int(),   // tickets que cumplen los filtros, en el alcance del usuario
  page: z.number().int(),
  pageSize: z.number().int(), // siempre TICKETS_PAGE_SIZE
});
```

**Procedimientos nuevos o cambiados:**

| Procedimiento | Método y path | Entrada | Salida | Permiso | Departamento del recurso |
|---|---|---|---|---|---|
| `tickets.list` | `GET /tickets` | `listTicketsInputSchema` (query string) | `ticketsPageSchema` | `TICKET_VIEW` | filtro por `user.scope` en el service |
| `comments.list` | `GET /tickets/{ticketId}/comments` | `ticketCommentsInputSchema` | `commentSchema[]` | `TICKET_VIEW` | `TicketDepartmentResolver`, 404 |
| `comments.create` | `POST /tickets/{ticketId}/comments` | `createCommentInputSchema` | `commentSchema` | `TICKET_EDIT` | `TicketDepartmentResolver`, 404 |
| `comments.remove` | `DELETE /tickets/{ticketId}/comments/{comentarioId}` | `removeCommentInputSchema` | `void` | `COMMENT_DELETE` (solo admin) | — |

**Auditoría de comentarios.** Se escribe como entrada del ticket, para que aparezca en su historial (PRD §6.3: "quedan en el historial"):

- `entityType: "Ticket"`, `entityId` = `ticketId`.
- Acciones nuevas: `comment_create` y `comment_delete`.
- `payload`: `{ comentarioId }`. **Nunca el texto**: si el admin elimina un comentario, el texto no reaparece en el historial. Queda solo en la fila eliminada lógicamente.

Convenciones:

- Un comentario eliminado deja de existir para la API: no sale en `comments.list`, no cuenta en la búsqueda y eliminarlo de nuevo es 404.
- "Normalizar" un texto para buscar es `lower(unaccent(texto))` en Postgres. Ejemplo: "Técnico" → "tecnico".

## Contrato

**Feature 6.1: Comentarios**

- **MUST:**
  - Cada comentario tiene `texto`, autor (`createdBy` = `@CurrentUser()`) y fecha (`createdAt`). Son inmutables: no existe una operación de edición (Q32, PRD §6.3).
  - Comentan el admin y los agentes del departamento del ticket, también con el ticket en un estado de cierre (PRD §4.2, Q23).
  - Leen los comentarios quienes pueden ver el ticket. `comments.list` los devuelve del más antiguo al más reciente (`createdAt` y luego `id`), sin paginar.
  - Comentar **no** modifica el ticket: no cambia su `updatedAt` ni su `updatedBy`. Así, quien está editando el formulario no recibe un 409 porque otro comentó.
  - Solo el admin elimina un comentario (`COMMENT_DELETE`), con `softDeleteData`. Ni un agente ni el propio autor pueden (Q32).
  - El alta y la eliminación dejan un `AuditLog` (`comment_create` o `comment_delete`, ver Modelo de datos), en la misma transacción.
  - Un comentario sigue a su ticket: un cambio de departamento lo conserva (SPEC 05 Feature 5.6).
- **EDGE CASES:**
  - Texto vacío o solo espacios tras el `trim`: 400. Más de 2000 caracteres: 400.
  - Un agente comenta o lista los comentarios de un ticket de otro departamento: 404, con el mismo cuerpo que un ticket inexistente (SPEC 05 Feature 5.8).
  - Comentar o listar un ticket inexistente o eliminado: 404 (al agente se lo da el guard; al admin, el service).
  - Un agente pide `comments.remove`: 403, también sobre un comentario de su departamento o propio.
  - `comments.remove` con un `comentarioId` inexistente, ya eliminado, de otro ticket, o de un ticket eliminado: 404 ("El comentario no existe").
- **MUST NOT:**
  - Editar un comentario.
  - Guardar el texto del comentario en el `payload` de auditoría.
  - Adjuntos, menciones o notificaciones.

**Feature 6.2: Bandeja (API)**

- **MUST:**
  - El alcance es un filtro obligatorio, como en SPEC 05: el agente ve solo los tickets de su departamento y el admin todos (PRD §4.2, P17).
  - `departamentoId` solo lo aplica el admin. Si lo manda un agente, se ignora: su alcance siempre gana.
  - Excluye los tickets eliminados.
  - Filtros por igualdad: estado, área, edificio, tipo, prioridad, proveedor, módulo y departamento (este, solo el admin). Rango de `fechaRecepcion` con `fechaRecepcionDesde` y `fechaRecepcionHasta`, los dos inclusive y opcionales (PRD §5.1, Q35).
  - Todos los filtros se combinan con AND y se resuelven en el servidor.
  - Se puede filtrar por un ítem de catálogo inactivo o eliminado: el filtro compara ids, no valida el ítem. Un id que no existe devuelve una página vacía, no un error.
  - Texto libre (`q`): busca en `titulo`, `descripcion`, `solucionDescripcion` y en el texto de los comentarios no eliminados del ticket. Alcanza con que coincida uno. Es "contiene", sin distinguir mayúsculas ni acentos (D3): "tecnico" encuentra "Técnico" y "TÉCNICO".
  - No busca en nombres de catálogo, en el número del ticket ni en el historial (Q33).
  - En `q` se escapan `%`, `_` y `\` antes de armar el `LIKE` (con `ESCAPE '\'`): "50%" busca el texto literal.
  - El texto libre se resuelve con SQL escrito a mano (`$queryRaw` con `Prisma.sql`, siempre parametrizado) en `TicketsRepository`, porque Prisma no expresa `unaccent`. Ese SQL repite a mano el alcance y `"deletedAt" IS NULL`, del ticket y del comentario.
  - Orden fijo: `fechaRecepcion` descendente y, si empata, `numero` descendente (Q34).
  - Páginas de `TICKETS_PAGE_SIZE` = 20 (Q34), con `OFFSET`. La respuesta trae `total`.
  - `TicketsService.list` sigue fallando sin `user.scope` (SPEC 05).
- **EDGE CASES:**
  - Sin resultados: `{ items: [], total: 0 }`, no un error.
  - Una página posterior a la última: `items: []` con el `total` real.
  - `fechaRecepcionDesde` posterior a `fechaRecepcionHasta`: 400.
  - `page` no numérico o menor que 1: 400.
  - `q` de solo espacios: equivale a no buscar.
- **MUST NOT:**
  - Filtrar o paginar en el navegador.
  - Exportar CSV, ni filtrar por agente asignado.
  - Interpolar `q` en el SQL sin parámetro.

**Feature 6.3: Bandeja (web)**

- **MUST:**
  - `/tickets` reemplaza la lista mínima de SPEC 05.
  - Los filtros, la búsqueda y la página viven en la URL (`validateSearch` con un esquema que descarta valores inválidos con `.catch`). Recargar o compartir el link muestra lo mismo.
  - Búsqueda: un campo de texto que dispara la consulta cuando el usuario deja de escribir 300 ms, y actualiza la URL con `replace` (sin llenar el historial del navegador).
  - Filtros:
    - selectores de Estado, Área, Edificio, Tipo, Prioridad, Proveedor y Módulo;
    - "Departamento" solo para el admin;
    - "Recepción desde" y "Recepción hasta";
    - cada selector ofrece los ítems activos y, al final, los inactivos marcados "(inactivo)", con los datos de `catalogs.<catálogo>.list`;
    - "Limpiar filtros" vuelve a la bandeja sin filtros.
  - Cambiar un filtro o la búsqueda vuelve a la página 1.
  - Columnas: Número, Título, Departamento, Estado, Prioridad, Área y Fecha de recepción. Número y título abren el ticket. La tabla solo muestra la página recibida.
  - Paginación: "Anterior" y "Siguiente", con "Página 2 de 7 · 134 tickets".
  - Mientras llega la página nueva, se sigue mostrando la anterior (`placeholderData: keepPreviousData`), sin parpadeo.
  - Estados:
    - sin tickets y sin filtros: "Todavía no hay tickets. Creá el primero con «Nuevo ticket».";
    - sin resultados con filtros: "Ningún ticket coincide con la búsqueda", con "Limpiar filtros";
    - página posterior a la última: el mismo mensaje, con un link a la página 1;
    - error: "No se pudieron cargar los tickets. Intentá de nuevo."
  - Mantiene el botón "Nuevo ticket".
  - `useTickets(filtros)` en `features/tickets/hooks`.
- **MUST NOT:**
  - Que la ruta llame al cliente oRPC directo (ARCH, PRD §8.1).
  - Mostrar el filtro de departamento a un agente.
  - Ordenar al hacer clic en una columna.

**Feature 6.4: Comentarios e historial en la pantalla del ticket**

- **MUST:**
  - Sección "Comentarios" (`features/tickets/components/TicketComments.tsx`) entre el formulario de datos y el historial.
  - Cada comentario muestra autor, fecha y hora (`formatTimestamp`) y el texto, respetando saltos de línea. Del más antiguo al más reciente.
  - Al final, un `Textarea` con el botón "Comentar". Valida con `comentarioTextoSchema` (react-hook-form). Al guardar, se vacía y el comentario aparece en la lista.
  - Se puede comentar con el formulario de datos con cambios sin guardar: comentar no toca el ticket.
  - El admin ve "Eliminar" en cada comentario, con confirmación (`ConfirmDialog`). Un agente no lo ve.
  - Sin comentarios: "Todavía no hay comentarios."
  - El historial muestra `comment_create` como "Comentario agregado" y `comment_delete` como "Comentario eliminado", con fecha y usuario, sin el texto.
  - Hooks: `useTicketComments`, `useCreateComment` y `useRemoveComment`. Cada mutación invalida los comentarios del ticket, su historial y la bandeja (la búsqueda incluye comentarios). No invalidan el ticket: no cambió.
  - La pantalla conserva todo lo de SPEC 05 Feature 5.10: el 404 de un ticket ajeno, las acciones según el rol y el bloqueo optimista.
- **MUST NOT:**
  - Botón de editar comentario.
  - Mostrar el texto de un comentario eliminado.

## Plan de implementación

1. **Esquema.** `TicketComentario` y sus relaciones inversas en `schema.prisma`, y la migración `comentarios`, con `CREATE EXTENSION IF NOT EXISTS unaccent;` agregado a mano y comentado. Verificar:
   - `prisma migrate dev` aplica limpio, y un segundo `migrate dev` no genera nada;
   - `SELECT lower(unaccent('TÉCNICO'))` devuelve `tecnico`.
2. **Contrato de comentarios.** `comments.ts` y `contract.comments` en `index.ts`. Verificar con `comments.spec.ts`: texto de solo espacios y de 2001 caracteres se rechazan; el texto se recorta.
3. **API de comentarios.** En `modules/tickets`:
   - `comments.repository.ts`: `findByTicket`, `create` y `softDelete`, con `writeAuditEntry` en la transacción;
   - `comments.service.ts`: chequea que el ticket exista (404 para el admin) y que el comentario sea de ese ticket;
   - `comments.controller.ts`: un método por procedimiento, con `ownTicket` en `list` y `create`, `COMMENT_DELETE` en `remove`, y `commentsProcedures satisfies Record<keyof typeof contract.comments, …>`;
   - registrarlos en `TicketsModule`.

   Verificar con `comments.service.spec.ts`: ticket eliminado → 404; comentario de otro ticket → 404; eliminar dos veces → 404; el alta no llama a ninguna escritura de `Ticket`.
4. **Contrato del listado.** `listTicketsInputSchema`, `ticketsPageSchema`, `TICKETS_PAGE_SIZE` y `area` en `ticketSummarySchema`. `tickets.list` cambia de entrada y salida. En el mismo paso, `TicketsList` lee `data.items` y `findRecent` suma `area`, para que nada quede roto. Verificar con `tickets.spec.ts`: `page: "2"` → 2; `q: "  "` → `undefined`; desde > hasta → error.
5. **API de la bandeja.** `TicketsRepository.findPage(departmentId, filtros)` reemplaza a `findRecent`. Los filtros por igualdad y fecha van por Prisma; el texto libre, por un `$queryRaw` que devuelve los ids que coinciden, dentro del alcance y sin eliminados. `count` y la página usan el mismo `where`. `TicketsService.list(actor, filtros)` ignora `departamentoId` si el usuario es agente. Verificar con `tickets.service.spec.ts`: un agente que manda otro `departamentoId` recibe su propio alcance; el admin lo aplica.
6. **Web, bandeja.**
   - `validateSearch` en `routes/_authenticated/tickets/index.tsx`;
   - `useTickets(filtros)` con `keepPreviousData`;
   - `TicketsFilters.tsx` (búsqueda con pausa de 300 ms y selectores);
   - paginación y estados en `TicketsList.tsx`;
   - columna Área en `TicketsTable.tsx`.

   Verificar con tests de componente: cambiar un filtro actualiza la URL y vuelve a la página 1; el agente no ve "Departamento"; un selector muestra un ítem inactivo con "(inactivo)".
7. **Web, comentarios.** `TicketComments.tsx`, los tres hooks, las líneas nuevas de `TicketHistory` y su lugar en `TicketDetail`. Verificar con tests de componente: comentar vacía el campo y muestra el comentario; un agente no ve "Eliminar"; el historial muestra "Comentario eliminado" sin el texto.
8. **Verificación y documentación.**
   - `bruno/comments/` y el listado con filtros en `bruno/tickets/`;
   - `scripts/verify/specs/06-comentarios-bandeja.mjs`, agregado a `specs/index.mjs`;
   - `CLAUDE.md`: estado del repositorio (comentarios, bandeja, `comments.*`, migración `comentarios`) y `pnpm verify` de SPEC 01 a 06;
   - `apps/api/CLAUDE.md`: comentarios, acciones `comment_create` y `comment_delete`, y el SQL a mano del texto libre (dónde vive y que repite `deletedAt` y el alcance);
   - `packages/db/CLAUDE.md`: `TicketComentario` y la extensión `unaccent`;
   - `docs/prd.md`: §6.3 (el historial muestra que hubo un comentario, sin el texto) y §6.4 (se quita el párrafo de la lista mínima);
   - `specs/00-catalogo-specs.md`: la fila de SPEC 06 sin cambios; nota en D3 de que se resolvió con `unaccent`.

   Verificar: `pnpm verify --spec 06` pasa.

## Criterios de aceptación

- [ ] Un agente comenta un ticket de su departamento, también en estado Finalizado. El comentario sale en `comments.list` con su nombre y la fecha.
- [ ] Comentar no cambia el `updatedAt` del ticket: un `update` con el `updatedAt` leído antes del comentario guarda sin 409.
- [ ] Un comentario de solo espacios, o de 2001 caracteres, devuelve 400.
- [ ] Un agente recibe 404, con el mismo cuerpo, en `comments.list` y `comments.create` de un ticket de otro departamento y de un id inexistente.
- [ ] Un agente recibe 403 en `comments.remove`, también sobre su propio comentario.
- [ ] El admin elimina un comentario: deja de salir en `comments.list` y eliminarlo otra vez devuelve 404.
- [ ] Comentar y eliminar dejan cada uno exactamente un `AuditLog` con `entityType: "Ticket"`, acción `comment_create` o `comment_delete`, y un `payload` sin el texto.
- [ ] `tickets.list` de un agente nunca devuelve un ticket de otro departamento, tampoco mandando el `departamentoId` de otro. El admin, con `departamentoId`, recibe solo los de ese departamento.
- [ ] Buscar "tecnico" encuentra un ticket con "Técnico" en el título, y uno con "TÉCNICO" en la descripción.
- [ ] Buscar una palabra que solo está en un comentario encuentra el ticket. Después de que el admin elimina ese comentario, ya no lo encuentra.
- [ ] Buscar "50%" encuentra un ticket con "50%" en el título y no uno con "500" en el título.
- [ ] Un ticket eliminado no aparece en la bandeja con ningún filtro ni búsqueda.
- [ ] Con 25 tickets: sin filtros, la página 1 trae 20 ordenados por `fechaRecepcion` descendente (y `numero` descendente al empatar), la página 2 trae 5 y las dos informan `total: 25`.
- [ ] Filtrar por proveedor, por módulo y por un rango de fecha de recepción (con los dos extremos inclusive) devuelve solo los tickets que coinciden. Filtrar por un área desactivada encuentra sus tickets.
- [ ] `fechaRecepcionDesde` posterior a `fechaRecepcionHasta` devuelve 400.
- [ ] En la web, un agente busca un ticket por una palabra de un comentario, lo abre desde la bandeja, agrega un comentario y lo ve en la lista. No ve "Eliminar" en los comentarios ni el filtro "Departamento".
- [ ] En la web, recargar `/tickets?q=impresora&page=2` muestra la misma búsqueda y la misma página.
- [ ] En la web, el admin elimina un comentario y el historial muestra "Comentario eliminado" sin el texto.
- [ ] `pnpm verify --spec 06` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** búsqueda sin mayúsculas ni acentos con la extensión `unaccent` de Postgres (decisión del usuario, 2026-10-06; resuelve D3).
  - No guarda datos derivados: una edición del título ya cuenta en la búsqueda.
  - El costo es SQL escrito a mano en el repository, solo para el texto libre.
  - Descartado: columnas normalizadas como `nombreNormalizado` de catálogos, porque cada escritura del ticket tendría que recalcularlas y los tickets existentes necesitarían un relleno.
- **Sí:** los comentarios se auditan como entradas del ticket (`comment_create` y `comment_delete`), sin el texto (decisión del usuario, 2026-10-06).
  - Aparecen en el historial del ticket sin otra consulta.
  - Un comentario que el admin elimina no reaparece en el historial; el texto queda solo en la fila eliminada lógicamente.
  - Descartado: auditar con `entityType: "TicketComentario"`, que no saldría en el historial del ticket.
  - Descartado: mostrar el texto en el historial.
- **Sí:** `TicketComentario` con los campos base completos de SPEC 03 (`updatedAt` y `updatedBy` incluidos) y `softDeleteData` (decisión del usuario, 2026-10-06). Sin endpoint de edición, solo cambian al eliminarlo. Descartado: el modelo mínimo del borrador, que rompía la convención.
- **Sí:** comentar no modifica el ticket (decisión del usuario, 2026-10-06). Si actualizara `updatedAt`, quien edita el formulario recibiría un 409 por un comentario ajeno y perdería lo escrito.
- **Sí:** filtro de departamento solo para el admin; si lo manda un agente, se ignora (decisión del usuario, 2026-10-06). Descartado: responder 403, porque el filtro no revela nada y el alcance ya está forzado.
- **Sí:** vista por defecto con todos los tickets (abiertos y cerrados) y filtro de estado de un solo valor (decisión del usuario, 2026-10-06; Q34). Descartados: ocultar los cerrados por defecto y la selección múltiple.
- **Sí:** orden fijo, `fechaRecepcion` y `numero` descendentes (decisión del usuario, 2026-10-06; Q34). Columnas ordenables, si hacen falta, son otro spec.
- **Sí:** búsqueda al escribir, con una pausa de 300 ms (decisión del usuario, 2026-10-06). Descartado: confirmar con Enter.
- **Sí:** columnas de la lista mínima más Área, con Departamento visible para todos (decisión del usuario, 2026-10-06). Una sola tabla para los dos roles.
- **Sí:** comentarios del más antiguo al más reciente, con el formulario al final (decisión del usuario, 2026-10-06). Se leen como una conversación.
- **Sí:** los selectores de filtro ofrecen ítems inactivos, marcados "(inactivo)" (decisión del usuario, 2026-10-06). Los tickets históricos de un área desactivada se siguen encontrando.
- **Sí:** los comentarios viven en `modules/tickets` (PRD §8.2), con su propio contrato (`contract.comments`) y controller. Así `ticketsProcedures` no cambia y cada procedimiento declara su permiso.
- **Sí:** `tickets.list` cambia de forma (filtros y página) en lugar de sumar un procedimiento nuevo: la lista mínima de SPEC 05 existía para ser reemplazada.
- **Sí:** paginación por número de página con `OFFSET` y `total`, para mostrar "Página 2 de 7". El volumen esperado es bajo (uso interno).
- **Sí:** un id de filtro inexistente devuelve una página vacía, sin 400: el filtro compara, no valida.
- **No:** índice para el texto libre. `unaccent` no es `IMMUTABLE` y no admite un índice funcional directo; con el volumen esperado alcanza un recorrido secuencial.
- **No:** exportar CSV, filtro por agente asignado, adjuntos, menciones ni notificaciones (PRD §5.2).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El SQL a mano del texto libre no pasa por las convenciones de Prisma: un olvido de `"deletedAt" IS NULL` o del alcance mostraría tickets eliminados o ajenos. | Criterios de `pnpm verify` específicos: ticket eliminado, comentario eliminado y agente de otro departamento, todos con búsqueda. |
| La query string de un `GET` llega como texto: `page` sería `"2"` y fallaría la validación. | `z.coerce.number()` en `page` y un test del contrato. `pnpm verify` llama por HTTP real. |
| El usuario de la base de producción podría no poder crear la extensión. | `unaccent` es *trusted* desde Postgres 13: alcanza con permiso `CREATE` en la base. SPEC 07 usa la misma imagen. |
| Sin índice, la búsqueda recorre toda la tabla de tickets y de comentarios. | Uso interno, volumen bajo. Si crece, se evalúa `pg_trgm` con una función `unaccent` envuelta como `IMMUTABLE`, en una decisión nueva. |
| `OFFSET` se degrada con muchas páginas. | Fuera de alcance para el volumen del MVP. Si crece, paginación por cursor en otro spec. |
| La búsqueda al escribir dispara una consulta por pausa. | Pausa de 300 ms y `keepPreviousData`; TanStack Query reutiliza la caché de cada combinación de filtros. |

## Qué **no** está en este spec

- Exportar a CSV, adjuntos, menciones o notificaciones (Fase 2 o descartado).
- Editar comentarios, o restaurar y listar los eliminados.
- Columnas ordenables, selección múltiple de estados o un atajo "abiertos/cerrados".
- Filtro por agente asignado y filtro de departamento para el agente.
- Paginación por cursor e índices de texto.
- Una pantalla de auditoría global (Q11).
