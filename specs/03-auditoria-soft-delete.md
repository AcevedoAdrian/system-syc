# SPEC 03 — Auditoría y eliminación lógica

> **Status:** Draft
> **Depends on:** SPEC 02 (autenticación y acceso)
> **Date:** 2026-09-29
> **Objective:** módulo `audit` reutilizable por cualquier módulo, campos de auditoría base y eliminación lógica como convención, aplicados retroactivamente a `users` y `organizations` (SPEC 02) y listos para `catalogs` y `tickets` (SPEC 04 y 05).

## Por qué existe este spec

El PRD exige trazabilidad (§2, "Falta de trazabilidad") y marca la auditoría como transversal (§1, §8.2). SPEC 02 ya necesita auditar altas y bajas de usuarios y departamentos; sin este spec, esas mutaciones quedan sin registro. Cubre la etapa 2 del PRD §10.

## Alcance

**Dentro:**

- Módulo `audit` en `apps/api/src/modules/audit`: servicio inyectable `audit.log(entityType, entityId, action, payload)`.
- Modelo Prisma `AuditLog`.
- Convención de campos de auditoría base (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`) para todo modelo de negocio futuro.
- Convención de eliminación lógica (helper de repository o mixin de Prisma) que los módulos de SPEC 04 y 05 reutilizan.
- Endpoint de historial por entidad (`GET` vía oRPC) que lee `AuditLog` filtrado por `entityType` + `entityId`.
- Retrofit: `users` y `organizations` (SPEC 02) llaman a `audit.log(...)` en cada mutación.

**Fuera de alcance (para specs futuros):**

- Pantalla de auditoría global para el admin (Q11: no existe en el MVP).
- Restaurar registros eliminados o listar eliminados (Q12: no existe en el MVP).
- Auditoría de logins, logouts o intentos fallidos (Q10: fuera de alcance).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model AuditLog {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  actorId    String?
  action     String   // "create" | "update" | "delete" | valores propios del módulo
  payload    Json
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
}
```

```ts
// packages/contracts/src/audit.ts (fragmento)
export const auditEntrySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export const auditHistoryInputSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
});
```

Convención del `payload` (Q10):

```ts
// action = "create"
{ after: { campo1: valor1, campo2: valor2, ... } }

// action = "update"
{ before: { campo1: valorAnterior }, after: { campo1: valorNuevo } } // solo campos que cambiaron

// action = "delete"
{ } // sin datos adicionales; el hecho de la acción alcanza
```

## Contrato

**Feature 3.1: Módulo `audit`**

- **MUST:**
  - Servicio inyectable `audit.log(entityType, entityId, action, payload)` (ARCH), usado por cualquier módulo que mute datos.
  - Tabla `AuditLog` con `entityType`, `entityId`, `actorId`, `action`, `payload JSONB`, `createdAt` (PRD §8.3).
  - Toda mutación de negocio y de las tablas de Better Auth deja registro con usuario y fecha (PRD §5.1, P4).
  - El `payload` guarda un diff: en `update`, solo los campos que cambiaron con su valor anterior y nuevo; en `create`, los valores iniciales completos (Q10).
  - El registro se escribe en la misma transacción Prisma que la mutación: si falla la auditoría, falla la mutación completa *(propuesta técnica)*.
  - Es append-only: el módulo no expone `update` ni `delete` sobre `AuditLog` *(propuesta técnica)*.
  - No se auditan logins, logouts ni intentos fallidos de login (Q10).
  - Cualquier módulo futuro lo reutiliza sin modificar `audit` (PRD §8.2).
- **EDGE CASES:**
  - Una edición que no cambia ningún campo (el service detecta el diff vacío) no genera registro *(propuesta técnica)*.
  - Acciones del seed o del sistema: `actorId` es `null`, con `action` que identifica el origen (p. ej. `"seed"`) *(propuesta técnica)*.
- **MUST NOT:** guardar contraseñas, hashes o tokens en el `payload`, bajo ninguna acción; modelo EAV.

**Feature 3.2: Historial por entidad**

- **MUST:**
  - Un endpoint lee `AuditLog` filtrado por `entityType` + `entityId`, ordenado del más reciente al más antiguo.
  - El historial de una entidad lo puede ver cualquiera que tenga permiso para ver esa entidad — para tickets, eso ya excluye a un agente de otro departamento por Feature 2.5 (Q11).
  - No hay pantalla de auditoría global en el MVP: los cambios de usuarios y departamentos quedan auditados pero no se consultan desde la UI en esta etapa (Q11).
- **EDGE CASES:** una entidad sin historial devuelve lista vacía, no error.
- **MUST NOT:** una tabla de historial propia por dominio que duplique `AuditLog`.

**Feature 3.3: Campos de auditoría base**

- **MUST:**
  - `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt` en todo modelo de negocio: catálogos (SPEC 04), `Ticket`, `TicketComentario` (SPEC 05) (PRD §8.3).
  - Los carga el backend desde `@CurrentUser()`, nunca desde el payload que manda el cliente.
- **MUST NOT:** agregar estas columnas a las tablas de Better Auth — sus cambios se cubren con `audit`, no con columnas propias (P4). `Organization.activo` (SPEC 02) no es una de estas columnas y no aplica esta regla.

**Feature 3.4: Eliminación lógica**

- **MUST:**
  - Eliminar un registro de negocio setea `deletedAt`; nunca hay `DELETE` físico sobre modelos de negocio (PRD §5.1). (`Organization`, gestionada por Better Auth, sigue la regla propia de SPEC 02 Feature 2.3 — puede eliminarse físicamente solo sin historia.)
  - Toda consulta de listado o detalle excluye `deletedAt IS NOT NULL` por defecto (helper de repository compartido).
  - La eliminación queda auditada con `action: "delete"`.
  - Desactivar (`activo = false`) y eliminar (`deletedAt`) son mecanismos distintos: desactivar es reversible y solo oculta de selectores; eliminar es lógico, no reversible desde la UI, y el registro eliminado sigue existiendo para que el historial y las referencias ya cargadas (por ejemplo, un ticket que ya eligió ese ítem de catálogo) lo sigan mostrando (Q13).
  - Eliminar un ítem que está en uso (un catálogo referenciado por al menos un ticket no eliminado, o un departamento con agentes o tickets según SPEC 02) se rechaza con 409 (Q13).
- **EDGE CASES:**
  - Eliminar algo ya eliminado devuelve 404 *(propuesta técnica)*.
  - Un ticket ya cargado sigue mostrando el nombre de un catálogo eliminado después (no se rompe la referencia ni se oculta el dato histórico).
- **MUST NOT:** borrado físico de modelos de negocio; cascadas físicas; restaurar o listar eliminados desde la UI (Q12, fuera del MVP).

## Plan de implementación

1. Modelo `AuditLog` en `schema.prisma` + migración. Verificar: `prisma migrate dev` aplica limpio.
2. `AuditModule` con `AuditService.log(...)` en `apps/api/src/modules/audit`. Verificar: un test unitario llama a `log` y lee el registro creado.
3. Helper de repository para el diff en `update` (compara el objeto antes/después y arma el `payload`) y para el filtro `deletedAt: null` en listados. Verificar: un test unitario con dos objetos produce el diff esperado; un tercero sin cambios no genera diff.
4. `packages/contracts/src/audit.ts` con los esquemas de la sección Modelo de datos. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
5. Endpoint de historial (`audit.history`) vía oRPC, con el guard de permisos de la entidad consultada. Verificar: un agente de otro departamento pidiendo el historial de un ticket ajeno recibe 403 (una vez que exista `tickets` en SPEC 05; hasta entonces, probarlo contra `users`/`organizations`).
6. Retrofit de SPEC 02: `users.service.ts` y `organizations.service.ts` llaman a `audit.log(...)` en cada alta, edición, ban/unban, reseteo y eliminación. Verificar: dar de alta un usuario deja un `AuditLog` con `action: "create"`.
7. Tests Vitest: `audit.service.spec.ts` (transacción, payload, `actorId` nulo del seed). Verificar: `pnpm --filter @syc/api test` pasa.

## Criterios de aceptación

- [ ] Crear, editar y eliminar un usuario o un departamento (SPEC 02) deja un `AuditLog` correspondiente.
- [ ] El `payload` de una edición contiene solo los campos que cambiaron, con valor anterior y nuevo.
- [ ] Una edición sin cambios efectivos no genera un nuevo `AuditLog`.
- [ ] Eliminar un ítem de catálogo en uso (una vez que exista SPEC 04) devuelve 409.
- [ ] Un ticket con un catálogo eliminado después sigue mostrando ese valor en su detalle e historial (una vez que exista SPEC 05).
- [ ] Ningún `payload` en la tabla contiene una contraseña, hash o token, verificado por inspección manual tras correr los tests de SPEC 02.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** `payload` como diff, no snapshot completo. Es más liviano y más legible en el historial (Q10).
- **Sí:** sin pantalla de auditoría global ni auditoría de sesión en el MVP (Q11, Q10). Se puede agregar en una fase futura sin romper el modelo actual.
- **Sí:** sin restaurar ni listar eliminados (Q12). El dato queda en la base por trazabilidad, no por recuperación operativa.
- **No:** EAV para el `payload`. Es JSONB libre por registro, no una tabla de valores.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Si un módulo de negocio olvida llamar a `audit.log(...)`, la mutación queda sin trazar sin que falle nada. | El helper de repository compartido (paso 3) envuelve `create`/`update`/`delete` y llama a `audit` automáticamente, para que no dependa de que cada módulo lo recuerde. |
| El `payload` como diff puede crecer si un campo es un objeto grande (poco probable en este dominio). | No aplica en el MVP: los modelos de negocio tienen campos escalares. Revisar si se agrega un campo JSONB de negocio más adelante. |

## Qué **no** está en este spec

- Pantalla de auditoría global (Q11).
- Restaurar o listar eliminados (Q12).
- Auditoría de eventos de sesión (Q10).
- Catálogos y tickets en sí (SPEC 04 y 05); aquí solo se deja la convención que usan.
