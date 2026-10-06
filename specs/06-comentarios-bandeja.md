# SPEC 06 — Comentarios, bandeja y detalle

> **Status:** Draft
> **Depends on:** SPEC 05 (tickets núcleo)
> **Date:** 2026-09-29
> **Objective:** comentarios de seguimiento inmutables, bandeja de tickets con búsqueda, filtros y paginación acotada al departamento del agente, y una vista de detalle que compone todo lo anterior.

## Por qué existe este spec

Es la etapa 5 del PRD §10 y el resultado verificable es "un agente encuentra y sigue tickets" — sin bandeja ni comentarios, SPEC 05 deja un ticket usable solo por `id` directo. Depende de SPEC 05 porque filtra y comenta sobre `Ticket`, y de SPEC 03 porque los comentarios usan la misma convención de soft delete.

## Alcance

**Dentro:**

- Modelo Prisma `TicketComentario`.
- Módulo `comments` (o sub-router de `tickets`) en `apps/api/src/modules/tickets`.
- Endpoint de listado de tickets con filtros, búsqueda de texto, orden y paginación. **Reemplaza** a `tickets.list` de SPEC 05, que hoy devuelve los 50 más recientes del alcance del usuario sin filtros (el contrato `tickets.list` y la ruta `/tickets` ya existen; este spec los amplía).
- `apps/web`: bandeja (`routes/_authenticated/tickets/index.tsx`, hoy la lista mínima de SPEC 05) con TanStack Table y filtros, y los comentarios en la pantalla del ticket (`routes/_authenticated/tickets/$ticketId.tsx`, que SPEC 05 ya crea con los campos, las acciones y el historial).

**Fuera de alcance (para specs futuros):**

- Exportar a CSV (Fase 2).
- Adjuntos, menciones o notificaciones sobre comentarios (Fase 2 o descartado).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model TicketComentario {
  id        String    @id @default(cuid())
  ticketId  String
  texto     String
  createdAt DateTime  @default(now())
  createdBy String
  deletedAt DateTime?

  @@index([ticketId])
}
```

Nota: `TicketComentario` no lleva `updatedAt` ni `updatedBy` porque es inmutable — no se edita, solo se crea o se elimina lógicamente (Q32). Sí sigue la convención de soft delete de SPEC 03.

```ts
// packages/contracts/src/comments.ts (fragmento)
export const createCommentInputSchema = z.object({
  ticketId: z.string(),
  texto: z.string().trim().min(1).max(2000),
});

// packages/contracts/src/tickets.ts (fragmento, listado)
export const listTicketsInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  estadoId: z.string().optional(),
  areaId: z.string().optional(),
  edificioId: z.string().optional(),
  tipoId: z.string().optional(),
  prioridadId: z.string().optional(),
  proveedorId: z.string().optional(),
  moduloId: z.string().optional(),
  fechaRecepcionDesde: z.string().date().optional(),
  fechaRecepcionHasta: z.string().date().optional(),
  page: z.number().int().min(1).default(1),
});
// departamento no es un filtro que elige el agente: el backend ya lo acota a
// partir de la sesión (SPEC 02 Feature 2.5). El admin, si se agrega ese filtro,
// puede elegir cualquiera; no está en el alcance de este spec pedirlo.
```

## Contrato

**Feature 6.1: Comentarios**

- **MUST:**
  - Cada comentario tiene `texto`, autor (`createdBy`, de la sesión) y fecha (`createdAt`). Son inmutables: no existe una operación de edición (PRD §6.3).
  - Comentan el admin y los agentes del departamento del ticket, incluso con el ticket en un estado de cierre (PRD §4.2, SPEC 05 Q23).
  - Lee los comentarios cualquiera que pueda ver el ticket — para un agente, eso ya excluye los tickets de otro departamento (SPEC 02 Feature 2.5).
  - Solo el admin puede eliminar un comentario, de forma lógica (`deletedAt`); ni un agente ni el propio autor pueden. Deja de mostrarse en el ticket y la eliminación queda en el historial (Q32).
- **EDGE CASES:**
  - Texto vacío o solo espacios tras el `trim`: 400. Largo máximo 2000 caracteres *(propuesta técnica)*.
  - Comentar un ticket que no existe o está eliminado: 404.
- **MUST NOT:** editar un comentario existente; adjuntos; menciones o notificaciones; que un agente o el autor lo elimine.

**Feature 6.2: Bandeja**

- **MUST:**
  - Búsqueda de texto libre y filtros por estado, área, edificio, tipo, prioridad y texto (PRD §5.1), más proveedor, módulo y rango de fecha de recepción (`fechaRecepcionDesde`/`fechaRecepcionHasta`) (Q35).
  - El agente ve **solo** los tickets de su propio departamento, sin poder quitar ese límite — no hay filtro de departamento para el agente, coincide con SPEC 02 Feature 2.5. El admin ve todos, sin filtro de departamento por defecto (PRD §4.2, reinterpretado 2026-09-29).
  - Excluye tickets eliminados lógicamente.
  - El texto libre busca en `titulo`, `descripcion`, `solucionDescripcion` y comentarios no eliminados; alcanza con que coincida en uno de esos campos. No busca en nombres de catálogo ni en el historial de auditoría (Q33). La comparación no distingue mayúsculas ni acentos, igual que la unicidad de nombres de catálogo en SPEC 04 (D1, corrige la respuesta original de Q33).
  - Orden por defecto: `fechaRecepcion` de más reciente a más antigua; si coincide, por `numero` de mayor a menor (Q34).
  - Paginación de 20 tickets por página (Q34).
  - Filtros resueltos en el servidor (`WHERE` + `LIMIT`/`OFFSET` o cursor), combinados con AND entre sí *(propuesta técnica)*. TanStack Table en el frontend solo renderiza la página recibida.
- **EDGE CASES:**
  - Sin resultados: estado vacío en la UI, no un error.
  - En el texto libre se escapan los caracteres especiales de `LIKE`/`ILIKE` (`%` y `_`) antes de armar la consulta.
  - Se puede filtrar por un ítem de catálogo inactivo (no eliminado), para encontrar tickets históricos que lo usaron *(propuesta técnica)*.
- **MUST NOT:** exportar CSV (Fase 2); filtrar por agente asignado (Fase 2, no existe ese campo); un filtro de departamento visible para el agente.

**Feature 6.3: Detalle del ticket**

- **MUST:**
  - Muestra todos los campos del ticket, sus comentarios (con el formulario para agregar uno nuevo) y su historial (SPEC 05 Feature 5.6).
  - Las acciones de editar, cambiar estado, comentar y eliminar aparecen en la UI solo si el usuario tiene permiso; el backend las rechaza igual aunque la UI fallara en ocultarlas (PRD §4.2, SPEC 02 Feature 2.5).
  - Ruta `/tickets/$ticketId` (ARCH), ya creada por SPEC 05.
- **EDGE CASES:** un ticket inexistente, o eliminado, o de un departamento que el agente no puede ver, devuelve 404 (no 403, para no confirmar que el ticket existe en otro departamento). *Resuelto en SPEC 05 (Feature 5.8): `@RequirePermission` con `outOfScope: "not-found"`. Los comentarios deben declarar lo mismo.*
- **MUST NOT:** que `routes/` llame directamente al cliente oRPC — pasa siempre por `features/tickets/hooks` (ARCH, PRD §8.1).

## Plan de implementación

1. Modelo `TicketComentario` + migración. Verificar: `prisma migrate dev` aplica limpio.
2. `packages/contracts/src/comments.ts` y el esquema de listado en `packages/contracts/src/tickets.ts`. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
3. `comments.service.ts`/`comments.repository.ts`: crear (con permisos de Feature 6.1) y eliminar (solo admin). Verificar: un agente que intenta eliminar un comentario recibe 403.
4. `tickets.repository.ts`: reemplazar `findRecent` (la lista mínima de SPEC 05, que ya acota por departamento) por el método de listado — filtros, búsqueda de texto con escape de `%`/`_`, orden y paginación, acotado por departamento cuando el usuario es agente. Verificar: un agente autenticado contra el endpoint de listado nunca recibe un ticket de otro departamento, ni pasando un filtro manipulado.
5. `apps/web`: `features/tickets/hooks/useTickets()` (ya existe, sin filtros; pasa a ser la bandeja, con filtros como query params de TanStack Router) y `useTicketComments()`/`useCreateComment()`. Verificar: cambiar un filtro actualiza la URL y la tabla.
6. `routes/_authenticated/tickets/index.tsx`: TanStack Table con columnas número, título, estado, área, prioridad, fecha de recepción; filtros en la cabecera. Verificar: la bandeja de un agente no muestra tickets de otro departamento aunque existan en la base.
7. `routes/_authenticated/tickets/$ticketId.tsx` (ya creada por SPEC 05, con campos, acciones e historial): suma los comentarios. Verificar: un ticket de otro departamento (para un agente) devuelve 404 al navegar directo a la URL.
8. Tests Vitest: `comments.service.spec.ts` (solo admin elimina) y `tickets.repository.spec.ts` o `tickets.service.spec.ts` para el listado (filtro por departamento, texto libre sin distinguir mayúsculas/acentos, orden y paginación). Verificar: `pnpm --filter @syc/api test` pasa.

## Criterios de aceptación

- [ ] Un agente y el admin pueden comentar un ticket, incluso cerrado; un agente no puede eliminar su propio comentario ni el de otro.
- [ ] Solo el admin elimina un comentario; deja de aparecer en el detalle pero sigue en el historial.
- [ ] La bandeja de un agente nunca muestra un ticket de otro departamento, ni con ningún filtro.
- [ ] Buscar "impresora" encuentra un ticket con "Impresora" o "IMPRESORA" en el título.
- [ ] Sin filtros, la bandeja ordena por fecha de recepción descendente y muestra 20 tickets por página.
- [ ] Filtrar por proveedor, módulo o un rango de fecha de recepción devuelve solo los tickets que coinciden.
- [ ] Navegar a `/tickets/$ticketId` de un ticket de otro departamento (como agente) devuelve 404.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** corregir Q33 para que la búsqueda de texto no distinga mayúsculas ni acentos, igual que la unicidad de nombres de catálogo (decisión del usuario, 2026-09-29). El texto original de Q33 decía lo contrario; se documenta el cambio acá.
- **Sí:** agregar proveedor, módulo y rango de fecha de recepción como filtros adicionales a los de PRD §5.1 (Q35); requiere actualizar `docs/prd.md` §5.1.
- **Sí:** 404 en vez de 403 al pedir el detalle de un ticket fuera de alcance, para no filtrar su existencia a un agente sin permiso.
- **No:** exportar CSV ni filtro por agente asignado — ambos Fase 2 (PRD §5.2).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La búsqueda de texto sin distinguir acentos puede requerir una extensión de Postgres (`unaccent`) o normalización en el WHERE. | Resolver en implementación con `unaccent` + índice funcional, o normalizando ambos lados de la comparación; verificar el costo con el volumen esperado (bajo, uso interno). |
| Paginar con `OFFSET` puede degradar en tablas grandes a futuro. | Fuera de alcance para el volumen esperado del MVP; si crece, se migra a paginación por cursor en una decisión nueva. |

## Qué **no** está en este spec

- Exportar a CSV, adjuntos, menciones o notificaciones (Fase 2 o descartado).
- Filtro de departamento para el agente (no existe: siempre está acotado).
- Auditoría más allá de leer `AuditLog` (SPEC 03).
