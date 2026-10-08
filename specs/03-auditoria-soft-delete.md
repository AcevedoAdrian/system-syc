# SPEC 03 — Auditoría y eliminación lógica

> **Status:** Completed
> **Depends on:** SPEC 02 (autenticación y acceso)
> **Date:** 2026-10-05
> **Objective:** módulo `audit` reutilizable (tabla `AuditLog`, diff, historial por entidad) y las convenciones de campos de auditoría y eliminación lógica, aplicados a `users` y `organizations` de SPEC 02 y listos para `catalogs` y `tickets` (SPEC 04 y 05).

## Por qué existe este spec

El PRD exige trazabilidad (§2, "Falta de trazabilidad") y define la auditoría como transversal (§1, §8.2). Las mutaciones de usuarios y departamentos de SPEC 02 todavía no dejan registro (deuda declarada en sus Riesgos). Este spec cubre la etapa 2 del PRD §10.

Esta versión (2026-10-05) lo ajusta al código real de SPEC 02. Los usuarios se mutan con `auth.api.*` de Better Auth, fuera de una transacción propia; no existe la eliminación de usuarios (solo el ban); y el permiso para leer un historial depende de la entidad. Los criterios que dependían de catálogos y tickets pasan a SPEC 04 y 05.

## Alcance

**Dentro:**

- Módulo `apps/api/src/modules/audit`: `AuditModule` (exportado), `AuditService` (`log`, `history`), `AuditRepository` (única capa que toca `AuditLog`) y el helper de diff.
- Modelo Prisma `AuditLog` + migración `auditoria`.
- Convención de campos de auditoría base (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`) y de eliminación lógica (`notDeleted`, `softDeleteData`) para los modelos de negocio de SPEC 04 y 05.
- Retrofit de SPEC 02: `users` (alta, edición con departamento, activar/desactivar, reseteo de contraseña), `organizations` (alta, renombrar, activar/desactivar, eliminar), cambio de la propia contraseña (hook de Better Auth) y seed.
- Endpoints `users.history` y `organizations.history` (solo admin, sin UI).
- `scripts/verify/specs/03-auditoria.mjs` para `pnpm verify`.

**Fuera de alcance (para specs futuros):**

- Pantalla de auditoría global y UI de historial de usuarios y departamentos (Q11).
- Restaurar o listar registros eliminados (Q12).
- Eventos de sesión: login, logout, intentos fallidos y la revocación de sesiones como efecto secundario (Q10).
- Las tablas internas de Better Auth `session`, `verification` y `rateLimit`, y `account` salvo el cambio de contraseña.
- Modelos de negocio con `deletedAt` (SPEC 04 y 05) y `tickets.history` (SPEC 05).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model AuditLog {
  id         String   @id @default(cuid())
  entityType String   // nombre del modelo: "User", "Organization", "Ticket", ...
  entityId   String   // sin FK: es polimórfico y la entidad puede ya no existir (Organization se borra físicamente)
  actorId    String?  // null = sistema (seed)
  actor      User?    @relation(fields: [actorId], references: [id], onDelete: Restrict)
  action     String   // "create" | "update" | "delete" | acción propia del módulo
  payload    Json
  createdAt  DateTime @default(now())

  @@index([entityType, entityId, createdAt])
}

// User suma solo la relación inversa (sin columnas nuevas): auditLogs AuditLog[]
```

```ts
// packages/contracts/src/audit.ts (fragmento)
export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.object({ id: z.string(), name: z.string() }).nullable(), // null = sistema
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const auditHistorySchema = z.array(auditEntrySchema);
```

Convención del `payload` (Q10):

```ts
// action = "create"  → valores iniciales completos de la foto auditable
{ after: { nombre: "Soporte", activo: true } }

// action = "update"  → solo los campos que cambiaron
{ before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } }

// action = "delete" | "reset_password" | "change_password"  → sin datos; el hecho alcanza
{}
```

**Foto auditable** por entidad: es la lista explícita de campos que entran en el diff. Nada que no esté en la lista llega al `payload`.

| `entityType` | Campos |
|---|---|
| `User` | `username`, `name`, `email`, `role`, `activo`, `departamento` (`{ id, nombre } \| null`) |
| `Organization` | `nombre`, `activo` |

## Contrato

**Feature 3.1: Módulo `audit`**

- **MUST:**
  - `AuditService.log({ entityType, entityId, action, actorId, payload })` escribe un registro. El `actorId` llega explícito desde el controller (`@CurrentUser()`): los services no tienen contexto de request.
  - Mutaciones que escribimos con Prisma (`Organization`, `Member` y, desde SPEC 04, los modelos de negocio): el `AuditLog` se escribe **en la misma transacción** que la mutación. Si falla la auditoría, falla la mutación. El repository del módulo recibe la entrada de auditoría y la escribe con la función que exporta `AuditRepository` para escribir dentro de una transacción ajena.
  - Mutaciones por `auth.api.*` de Better Auth (usuarios): el `AuditLog` se escribe **después** de que Better Auth confirma el cambio. Si esa escritura falla, se loguea el error y la request responde 500, pero el cambio ya quedó aplicado. Es la única excepción a la regla anterior.
  - Una operación de service deja **un** registro, aunque toque varias tablas. Ejemplo: editar nombre y departamento de un agente es un solo `update` con ambos campos en el diff.
  - Acciones: `create`, `update` y `delete`. Activar, desactivar, renombrar y cambiar de departamento son `update` con su diff. Además existen `reset_password` (el admin resetea la contraseña) y `change_password` (el usuario cambia la suya, auditado con un hook `after` de Better Auth y con el propio usuario como actor).
  - El diff se calcula sobre la foto auditable (helper `computeDiff(before, after)`). En `update` incluye solo los campos que cambiaron.
  - Seed: lo que el seed crea queda como `create` con `actorId: null`. Si vuelve a correr sin crear nada, no deja registros.
  - Es append-only: el módulo no expone `update` ni `delete` sobre `AuditLog`.
  - Cualquier módulo futuro lo reutiliza sin modificar `audit` (PRD §8.2).
- **EDGE CASES:**
  - Una edición sin cambios efectivos (mismo nombre, mismo estado `activo`, mismo departamento) no genera registro.
  - Eliminar físicamente un departamento conserva sus registros: `entityId` no tiene FK, y el nombre queda en el `create` y en los `update` anteriores.
- **MUST NOT:** guardar contraseñas, hashes o tokens en el `payload`, bajo ninguna acción; auditar eventos de sesión; modelo EAV.

**Feature 3.2: Historial por entidad**

- **MUST:**
  - `AuditService.history(entityType, entityId)` devuelve los registros del más reciente al más antiguo (`createdAt` desc, luego `id` desc), con el actor como `{ id, name }` o `null`.
  - Cada módulo expone su propio procedimiento de historial, con su guard: en este spec, `users.history` (`GET /users/{userId}/history`) y `organizations.history` (`GET /organizations/{organizationId}/history`), ambos con `PERMISSIONS.MANAGE`. SPEC 05 agrega `tickets.history` con su filtro por departamento (Q11).
  - No hay UI de historial en este spec (Q11).
- **EDGE CASES:** un id sin registros devuelve `[]`, no error. El historial de un departamento ya eliminado se sigue leyendo.
- **MUST NOT:** un `audit.history` genérico con permiso dinámico por `entityType`; una tabla de historial propia por dominio que duplique `AuditLog`.

**Feature 3.3: Campos de auditoría base**

- **MUST:**
  - `createdAt`, `updatedAt`, `createdBy`, `updatedBy` y `deletedAt` en todo modelo de negocio: catálogos (SPEC 04), `Ticket` (SPEC 05) y `TicketComentario` (SPEC 06, sin `updated*` porque es inmutable) (PRD §8.3).
  - `createdBy` y `updatedBy` son FK reales a `User`. Los usuarios nunca se borran físicamente.
  - El backend los carga desde `@CurrentUser()`, nunca desde el payload del cliente. En el alta, `updatedBy = createdBy`.
- **MUST NOT:** agregar estas columnas a las tablas de Better Auth: sus cambios se cubren con `audit` (P4). `Organization.activo` no es una de estas columnas.

**Feature 3.4: Eliminación lógica**

- **MUST:**
  - Eliminar un registro de negocio setea `deletedAt` (y `updatedBy`) con `softDeleteData(actorId)`. Nunca hay `DELETE` físico sobre modelos de negocio (PRD §5.1). `Organization` sigue su propia regla (SPEC 02 Feature 2.3): se borra físicamente, solo si no está en uso.
  - Todo listado y todo detalle filtra con la constante `notDeleted` (`{ deletedAt: null }`), escrita en el `where` de cada repository. Los `include` de una referencia ya cargada no filtran: un ticket sigue mostrando el ítem de catálogo eliminado.
  - La eliminación se audita con `action: "delete"` en la misma transacción.
  - Desactivar (`activo = false`) y eliminar (`deletedAt`) son mecanismos distintos (Q13). Desactivar es reversible y solo oculta el ítem de los selectores. Eliminar no se revierte desde la UI, y el registro sigue existiendo para el historial y las referencias.
  - Eliminar un ítem en uso se rechaza con 409 (Q13). La regla concreta la aplica cada spec: SPEC 04 para catálogos, SPEC 02/05 para departamentos.
- **EDGE CASES:** eliminar algo ya eliminado devuelve 404.
- **MUST NOT:** borrado físico de modelos de negocio; cascadas físicas; una extensión de Prisma que filtre `deletedAt` sin que se vea; restaurar o listar eliminados (Q12).

## Plan de implementación

1. `AuditLog` y la relación inversa en `User` dentro de `schema.prisma`, más la migración `auditoria`. Verificar: `prisma migrate dev` aplica limpio y `pnpm --filter @syc/db generate` pasa.
2. Módulo `modules/audit`: `audit.module.ts`, `audit.service.ts` (`log`, `history`), `audit.repository.ts` (escritura propia, escritura dentro de una transacción ajena, lectura del historial con el actor) y `audit-diff.ts` (`computeDiff`). Verificar: `audit-diff.spec.ts` (un cambio da el diff esperado; sin cambios da `null`; un campo fuera de la foto no aparece) y `audit.service.spec.ts` pasan.
3. `src/common/soft-delete.ts` con `notDeleted` y `softDeleteData`. Verificar: un test unitario pasa.
4. Retrofit de `organizations`: los métodos de mutación del repository reciben la entrada de auditoría y la escriben en el mismo `$transaction`; el service arma la foto, el diff y omite lo que no cambia; el controller pasa el actor. Verificar: `organizations.service.spec.ts` actualizado (renombrar al mismo nombre no audita) pasa.
5. Retrofit de `users`: el service arma la foto antes y después, y llama a `AuditService.log` cuando `auth.api.*` y `setMembership` terminan bien (`create`, un solo `update` por edición, `update` de `activo`, `reset_password`). Verificar: `users.service.spec.ts` actualizado pasa.
6. `change_password`: `createAuth(env, { onPasswordChanged })` registra un hook `after` sobre `/change-password` que audita cuando la respuesta es exitosa; `AuthModule` lo cablea a `AuditService`. Verificar: test del hook pasa.
7. Seed: audita como `create` (actor `null`) el admin y cada departamento que efectivamente crea. Verificar: correrlo dos veces sobre una base vacía deja 5 registros, no 10.
8. Contratos: `packages/contracts/src/audit.ts`, más `history` en `usersContract` y `organizationsContract`, implementados en sus controllers. Verificar: `pnpm typecheck` pasa (el `@Implement` completo marca lo que falta).
9. `scripts/verify/specs/03-auditoria.mjs` (agregado a `specs/index.mjs`). Actualizar `CLAUDE.md` (estado del repo), `apps/api/CLAUDE.md` (reglas de auditoría y soft delete) y la firma de `audit.log` en `docs/architecture.md`. Verificar: `pnpm verify --spec 03` pasa.

## Criterios de aceptación

- [X] Crear, renombrar, desactivar, reactivar y eliminar un departamento deja, en cada paso, un `AuditLog` con `entityType: "Organization"`, el admin como actor y la acción y el `payload` de la convención.
- [X] Crear un usuario, editarlo (nombre, rol y departamento a la vez), desactivarlo, reactivarlo y resetearle la contraseña deja, respectivamente, `create`, **un** `update`, `update`, `update` y `reset_password`.
- [X] Renombrar "Soporte" a "Mesa de ayuda" deja exactamente `{ before: { nombre: "Soporte" }, after: { nombre: "Mesa de ayuda" } }`.
- [X] Una edición sin cambios efectivos (mismo nombre o mismo estado `activo`) no genera `AuditLog`.
- [X] Con un trigger temporal que hace fallar el `INSERT` en `AuditLog`, renombrar un departamento devuelve 500 y el nombre no cambia.
- [X] Cambiar la propia contraseña deja `change_password` con el propio usuario como actor; login y logout no dejan registro.
- [X] Correr el seed sobre una base vacía deja 5 `create` con `actorId: null` (admin y 4 departamentos); correrlo otra vez no agrega registros.
- [X] `users.history` y `organizations.history` devuelven al admin los registros del más reciente al más antiguo, con el actor `{ id, name }`; un agente recibe 403; un id sin registros devuelve `[]`.
- [X] Ningún `payload` de la base temporal contiene las claves `password`, `hash` o `token`, ni las contraseñas usadas en los criterios.
- [X] `pnpm turbo lint typecheck test build` termina con código 0.

Los criterios que necesitan catálogos y tickets están en SPEC 04 (ítem en uso → 409) y SPEC 05 (un ticket sigue mostrando un catálogo eliminado).

## Decisiones

- **Sí:** `payload` como diff y no como snapshot completo: es más liviano y más legible (Q10).
- **Sí:** atomicidad mixta. Las mutaciones por Prisma propio auditan en la misma transacción; las de Better Auth auditan después, con 500 si falla. Descartado: reescribir el ABM de usuarios con Prisma (reabre SPEC 02 y obliga a hashear contraseñas y cerrar sesiones a mano). Descartado: los `databaseHooks` de Better Auth (tampoco comparten transacción y el actor sale de un contexto implícito).
- **Sí:** acciones genéricas (`create`/`update`/`delete`) más `reset_password` y `change_password`. Activar, desactivar y cambiar de departamento son `update` con diff. Descartado: una acción por operación (más vocabulario, y SPEC 05 tendría que seguirlo).
- **Sí:** auditar `change_password`. Es un cambio de credencial, no un evento de sesión.
- **Sí:** lo que crea el seed es `create` con `actorId: null` (null = sistema). Descartado: `action: "seed"`, que mezclaba el origen con la acción.
- **Sí:** un endpoint de historial por módulo, cada uno con su guard. Descartado: `audit.history` genérico con un registro de permisos por `entityType` (guard dinámico, se aparta de `@RequirePermission`).
- **Sí:** `notDeleted` explícito en cada `where`. Descartado: una extensión de Prisma que filtre sola (oculta el caso del catálogo eliminado que hay que seguir mostrando).
- **Sí:** `actorId`, `createdBy` y `updatedBy` como FK reales a `User`; `entityId` sin FK porque es polimórfico.
- **Sí:** `AuditService.log` recibe `actorId` explícito. Difiere de la firma de `docs/architecture.md`, que no lo incluía; se descarta un contexto de request implícito (CLS).
- **Sí:** foto auditable con lista explícita de campos por entidad: un campo sensible no puede colarse en el `payload` por accidente.
- **Sí:** el departamento entra al diff como `{ id, nombre }`, porque el nombre puede cambiar o el departamento borrarse.
- **Sí:** sin pantalla global, sin auditoría de sesión y sin restaurar eliminados (Q10, Q11, Q12).
- **No:** EAV para el `payload`. Es JSONB libre por registro.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un módulo nuevo olvida auditar una mutación y no falla nada. | La regla queda en `apps/api/CLAUDE.md` y cada spec con mutaciones incluye en su `pnpm verify` un criterio que lee `AuditLog`. |
| En un usuario, el cambio de Better Auth se aplica y la escritura del `AuditLog` falla: el cambio queda sin rastro. | La request responde 500 y el error queda logueado. Es poco probable, porque es la misma base y la misma conexión. Excepción declarada en Feature 3.1. |
| El hook `after` de Better Auth (`change_password`) depende de su API interna. | La versión está fijada (1.7.7) y hay un test del hook. |
| El `payload` como diff puede crecer si un campo es un objeto grande. | No aplica en el MVP (campos escalares). Revisarlo si aparece un campo JSONB de negocio. |

## Qué **no** está en este spec

- Pantalla de auditoría global ni UI de historial de usuarios y departamentos (Q11).
- Restaurar o listar eliminados (Q12).
- Auditoría de eventos de sesión (Q10).
- Catálogos y tickets en sí, y `tickets.history` (SPEC 04 y 05). Aquí solo queda la convención que usan.
