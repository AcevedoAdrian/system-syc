# apps/api (NestJS)

Un módulo por dominio de negocio, autocontenido: controla sus propias entidades, permisos y casos de uso, sin depender de los internos de otro módulo. Estructura planeada de carpetas en `docs/architecture.md`.

## Reglas del módulo

- El controller (o router oRPC) solo orquesta: valida con el esquema de `packages/contracts` y delega en el service.
- El service contiene la lógica de negocio y llama al repository; **nunca** importa Prisma directamente en el controller.
- El repository es la única capa que conoce Prisma; si cambia el ORM, el resto del módulo no se entera. **Única excepción: `modules/auth/auth.config.ts`**, la raíz de composición de Better Auth (arma su adapter Prisma). No la amplíes: ningún otro archivo fuera de un `*.repository.ts` importa `@syc/db` ni `@prisma/client`.
- Los permisos se resuelven con guards, **nunca** dentro del service. Se declaran en el endpoint con `@RequirePermission(permiso, { departmentFrom })`; los permisos y la matriz del PRD §4.2 viven en `src/common/permissions.ts`. El service no decide quién puede: recibe `user.scope` (`departmentId` para un agente, `null` para un admin) y lo usa como **filtro obligatorio** en los listados.
- Todo exige sesión salvo lo marcado con `@Public()` (`AuthGuard` global, denegar por defecto). Hoy son públicos `health.check` y los endpoints de Better Auth de la allowlist.
- Un router oRPC se implementa **completo** (`@Implement(contract.<módulo>)` devolviendo todos los procedimientos): así el compilador marca cualquiera que falte. Si un procedimiento necesita otro permiso que el resto (como `users.me`), va en su propio controller.

## Particularidades

- **Se empaqueta con `tsdown`** (ESM: `dist/main.mjs` y `dist/seed.mjs`). `@syc/contracts` y `@syc/db` son `devDependencies` que entran en el bundle porque exportan su fuente `.ts`. Prisma, Better Auth y `@orpc/*` van como `dependencies` (externos al bundle). Emite la decorator metadata que Nest necesita.
- **Biome tiene desactivado `useImportType` en `apps/api/**`**: Nest necesita los imports como valor para la inyección de dependencias. No los conviertas a `import type`.
- **`@orpc/nest` expone el contrato como OpenAPI/REST** (`GET /health`, `GET /users/me`, ...), no como RPC en `/rpc`. Los errores de negocio se lanzan con `ORPCError` (`CONFLICT` → 409, `BAD_REQUEST` → 400, `NOT_FOUND` → 404), con el mensaje en español que la web muestra tal cual.
- Las variables de entorno se validan con Zod al arrancar (`src/config`). Las del seed (`SEED_ADMIN_*`) las valida el propio `src/seed.ts` y **no** son obligatorias para la API.

## Auditoría y eliminación lógica

Convenciones de SPEC 03 (`specs/03-auditoria-soft-delete.md`); el módulo `modules/audit` las implementa y cualquier módulo nuevo las reutiliza sin modificarlo.

- **Toda mutación se audita.** Un módulo nuevo con mutaciones suma un criterio a su `pnpm verify` que lee `AuditLog`: si se olvida auditar, no falla nada más.
- **`AuditService.log({ entityType, entityId, action, actorId, payload })`**: el `actorId` llega explícito desde el controller (`@CurrentUser()`); los services no tienen contexto de request. `actorId: null` es el sistema (seed).
- **Dos formas de escribir, según quién muta:**
  - Con Prisma propio (`Organization`, `Member` y los modelos de negocio): el repository recibe la entrada y llama a `writeAuditEntry(tx, entry)` (exportada por `audit.repository.ts`) **dentro del mismo `$transaction`**. Si falla la auditoría, falla la mutación.
  - Con `auth.api.*` de Better Auth (usuarios): `AuditService.log` **después** de que Better Auth confirma. Si falla, se loguea y la request responde 500, pero el cambio ya quedó aplicado. Es la única excepción.
- **Una operación de service = un registro**, aunque toque varias tablas. Acciones: `create`, `update`, `delete`, y `reset_password` / `change_password` en usuarios. Activar, desactivar y cambiar de departamento son `update` con diff.
- **`payload`**: `create` → `{ after }`; `update` → `{ before, after }` solo con lo que cambió (`computeDiff`, `null` si no cambió nada: entonces no se escribe ni se audita); `delete` y las acciones de contraseña → `{}`. Los campos salen de una lista explícita por entidad (`pickSnapshot`): `User` en `modules/users/user-audit-snapshot.ts`, `Organization` en el service. **Nunca** contraseñas, hashes ni tokens.
- **Historial**: cada módulo expone su propio `history` con su guard (`users.history`, `organizations.history`, ambos `MANAGE`). No hay un `audit.history` genérico. Un id sin registros devuelve `[]` y no se chequea que la entidad exista (el de un departamento eliminado se sigue leyendo).
- **`change_password`** lo audita un hook `after` de Better Auth (`createAuth(env, { onPasswordChanged })`, cableado en `AuthModule` con `auth-audit.ts`). Login, logout y las demás tablas de Better Auth no se auditan.
- **Campos base y eliminación lógica de los modelos de negocio** (SPEC 04 y 05): `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (FK reales a `User`, cargadas desde `@CurrentUser()`, nunca del cliente) y `deletedAt`. Se elimina con `softDeleteData(actorId)` y todo listado y detalle filtra con `notDeleted`, escrito en el `where` de cada repository (`src/common/soft-delete.ts`; no hay extensión de Prisma que filtre sola). Eliminar algo ya eliminado es 404 y un ítem en uso se rechaza con 409. `Organization` no sigue esto: se borra físicamente, solo si no está en uso, y su `activo` es otra cosa.

## Better Auth

- **Montaje** (`modules/auth/auth.handler.ts`, llamado desde `main.ts`): Nest se crea con `bodyParser: false`, el handler de Better Auth va **antes** de `app.useBodyParser("json")` (lee el cuerpo del stream) y solo deja pasar la allowlist (`POST /sign-in/username`, `POST /sign-out`, `GET /get-session`, `POST /change-password`). El resto responde 404.
- **Usuarios**: el ABM llama a `auth.api.*` reenviando las cabeceras del admin (`@RequestHeaders()`), porque casi todos los endpoints de su plugin `admin` exigen una sesión real; solo `createUser` funciona sin ella. El plugin `username` normaliza a minúsculas, pero su validación de unicidad al editar compara contra el admin que llama, no contra el usuario editado: el service chequea duplicados por su cuenta (409).
- **Departamentos y `Member`**: se escriben con Prisma desde su repository, no con `auth.api.*` de `organization`. Esas rutas crean un `Member` con rol `owner`, validan el rol contra `owner`/`admin`/`member` (no existe `agente`) y exigen ser miembro; el admin no tiene departamento. Cambiar el departamento de un agente es una transacción (agrega el nuevo y quita los anteriores).
- **Sesiones**: 12 h, renovadas con actividad cada 1 h, sin `cookieCache`: el rol, el departamento y el ban se ven en la siguiente request (el guard lee `Member` en cada una). Desactivar (ban) y resetear la contraseña cierran las sesiones del usuario; cambiar la propia cierra las otras (un hook de Better Auth fuerza `revokeOtherSessions`).
- **Rate limit del login**: 5 por minuto, guardado en la base (tabla `RateLimit`). Sin proxy no hay IP del cliente y el contador es uno solo por ruta; SPEC 07 debe configurar `advanced.ipAddress`.
- **Esquema**: lo genera el CLI de Better Auth (paquete `auth`, devDependency; el viejo `@better-auth/cli` quedó congelado en la 1.4). Necesita un archivo que exporte `auth`; como `createAuth(env)` recibe el `env`, se usa uno temporal. El CLI no actualiza modelos que ya existen: para regenerar hay que partir del schema sin ellos. Cualquier cambio queda en una migración de Prisma.

## Seed

`pnpm --filter @syc/api seed` (`src/seed.ts`) crea el admin raíz (`SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`) y los 4 departamentos, y deja cada uno como `create` en `AuditLog` con `actorId: null`. Es manual, nunca corre al arrancar la API, y es idempotente: no duplica ni cambia la contraseña de un admin que ya existe. Como no hay sesión, crea el usuario por `auth.$context` (API interna de Better Auth; puede cambiar entre versiones, por eso la versión está fijada). Corre `tsdown` antes, así que reconstruye `dist/`.
