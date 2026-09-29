# SPEC 02 — Autenticación y acceso

> **Status:** Draft
> **Depends on:** SPEC 01 (esqueleto)
> **Date:** 2026-09-29
> **Objective:** Better Auth con los plugins `username`, `organization` y `admin` cableado de punta a punta: login por usuario, sesión, seed del admin raíz y los 4 departamentos, ABM de departamentos y de usuarios, y guards que hacen cumplir la matriz de permisos del PRD §4.2.

## Por qué existe este spec

`docs/architecture.md` deja auth para después del esqueleto. Este spec cubre la etapa 1 del PRD §10: sin login no hay nada que proteger, y sin departamentos no hay `Ticket.departamento` que asignar en SPEC 05. Las respuestas a `specs/00-catalogo-specs.md` (Q2 a Q9) y las decisiones D2 y D4 fijan el modelo exacto.

## Alcance

**Dentro:**

- Better Auth con adapter Prisma, plugins `username`, `organization` (departamentos) y `admin` (rol global).
- Migración inicial de Prisma: tablas de Better Auth (`User`, `Session`, `Account`, `Verification`, `Organization`, `Member`).
- `AuthGuard`, `PermissionsGuard`, `@CurrentUser()`, `@RequirePermission()` en `apps/api/src/common`.
- Módulos `auth`, `organizations`, `users` en `apps/api/src/modules`.
- Seed idempotente: admin raíz + 4 departamentos (Administrativo, Técnico, Redes, Desarrollo).
- ABM de departamentos (crear, renombrar, desactivar, reactivar, eliminar) desde la UI del admin.
- ABM de usuarios (alta, edición, desactivar/reactivar, resetear contraseña) desde la UI del admin.
- Login, logout, pantalla `/login`, redirección de `_authenticated/*` sin sesión.
- Feature `auth` en `apps/web` (única garantizada junto al esqueleto, ARCH).

**Fuera de alcance (para specs futuros):**

- Auditoría de estas operaciones: el `audit.log(...)` se invoca desde aquí, pero el módulo `audit` en sí es SPEC 03. Hasta que exista, estas mutaciones no dejan registro (ver Riesgos).
- Cualquier módulo de negocio (catálogos, tickets): SPEC 04 y 05.
- Recuperación de contraseña por correo: descartada (PRD §5.2).
- Registro público: descartado (P6).

## Modelo de datos

Better Auth gestiona sus propias tablas vía su adapter Prisma; no se escriben a mano. `Organization` recibe un campo adicional `activo` (boolean, default `true`) para el ABM de departamentos — no es una columna de auditoría de negocio, así que no contradice P4.

```prisma
// packages/db/schema.prisma (fragmento ilustrativo; el generador de Better Auth
// produce el detalle exacto de sus tablas — este bloque documenta el campo propio)
model Organization {
  // ...columnas de Better Auth...
  activo Boolean @default(true)
}
```

```ts
// packages/contracts/src/auth.ts (fragmento)
export const loginInputSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(128),
});

export const createUserInputSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i),
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  role: z.enum(["agente", "admin"]),
  // organizationId es requerido si role === "agente"; ausente si role === "admin"
  organizationId: z.string().optional(),
});

export const resetPasswordInputSchema = z.object({
  userId: z.string(),
  password: z.string().min(8).max(128),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8).max(128),
});

export const organizationInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
});
```

Convenciones:

- Sesión: duración 12 horas, renovada a diario mientras hay actividad (`updateAge` de Better Auth). Sin casilla "recordarme".
- `username`: 3 a 30 caracteres, letras, números, `_` y `.`, único sin distinguir mayúsculas *(propuesta técnica, valores por defecto del plugin `username`)*.
- El email es opcional en el alta (D4). Si no se carga, se guarda `<username>@syc.local`, que no se muestra en ninguna pantalla ni se usa para login ni para nada más.

## Contrato

**Feature 2.1: Login, logout y sesión**

- **MUST:**
  - Login con `username` + contraseña. Registro público deshabilitado; solo entran usuarios creados por el admin (P6, Q2).
  - Sesión de 12 horas, renovada a diario con actividad; sin "recordarme" (Q3).
  - Las rutas `_authenticated/*` redirigen a `/login` sin sesión (ARCH).
  - Todo procedimiento de dominio exige sesión (`AuthGuard`); solo `health.check` y los endpoints de `auth` son públicos *(propuesta técnica)*.
  - Un usuario baneado (desactivado, ver Feature 2.4) no puede iniciar sesión.
- **EDGE CASES:**
  - Credenciales inválidas: mensaje genérico que no revela si el `username` existe *(propuesta técnica)*.
  - Sesión expirada en medio del uso: 401 y redirección a `/login` *(propuesta técnica)*.
- **MUST NOT:** registro público, login social, recuperación de contraseña por correo (PRD §5.2).

**Feature 2.2: Admin raíz y departamentos por seed**

- **MUST:**
  - Seed idempotente: crea el admin raíz (rol global `admin`, sin departamento) y los 4 departamentos activos: Administrativo, Técnico, Redes, Desarrollo (PRD §10, etapa 1).
  - Credenciales del admin raíz desde variables de entorno validadas con Zod *(propuesta técnica)*.
- **EDGE CASES:**
  - Correr el seed dos veces no duplica nada (upsert por `username` y por nombre de organización).
  - Si faltan las variables del admin raíz, el seed aborta con un mensaje que las nombra.
- **MUST NOT:** credenciales hardcodeadas ni commiteadas.

**Feature 2.3: Departamentos (ABM)**

- **MUST:**
  - Departamento = `Organization` de Better Auth. No existe una tabla `Departamento` aparte (PRD §4.1).
  - El admin crea, renombra, desactiva, reactiva y elimina departamentos desde la UI (Q5).
  - Desactivar un departamento: sale de los selectores de alta de usuario y de ticket; no se le pueden asignar agentes nuevos ni crear tickets nuevos en él; no se puede mover un ticket existente hacia él. Los tickets que ya lo tienen lo siguen mostrando y no se mueven solos. Los agentes que ya pertenecen a él siguen entrando, y ven, editan y comentan esos tickets; no pueden crear tickets mientras esté desactivado. Se puede reactivar.
  - Eliminar un departamento solo se permite si nunca tuvo agentes asignados ni tickets, ni siquiera eliminados lógicamente (D2, resuelve el conflicto entre Q5 y Q12: `Organization` no lleva `deletedAt`, así que eliminar es un `DELETE` real y por eso se restringe a "nunca tuvo historia").
  - No se puede desactivar ni eliminar el último departamento activo.
- **EDGE CASES:**
  - Intentar eliminar un departamento con agentes o tickets (activos o eliminados): 409, se sugiere desactivar en su lugar.
  - Intentar desactivar o eliminar el último departamento activo: 409.
- **MUST NOT:** tabla propia de departamentos; borrado físico de un departamento con historia; derivar tickets entre departamentos (P7).

**Feature 2.4: Gestión de usuarios (admin)**

- **MUST:**
  - Solo el admin da de alta, edita, desactiva/reactiva y resetea contraseñas (PRD §5.1).
  - Alta: `username`, nombre, contraseña (el admin la escribe, 8 a 128 caracteres), rol (`agente` | `admin`), email opcional (D4). Si `role = agente`, `organizationId` es obligatorio y debe estar activo; si `role = admin`, no lleva departamento (Q6, Q7, Q9).
  - Un agente pertenece exactamente a un departamento. Editar el departamento de un agente exige que el resultado siga teniendo exactamente uno; no se puede dejar sin departamento (Q6, Q7).
  - Desactivar un usuario = `ban` del plugin `admin`, sin fecha de vencimiento. Cierra las sesiones activas de inmediato y bloquea el login. Reactivar = `unban` (Q4).
  - El usuario desactivado sigue visible para el admin en el listado y como autor en historiales y comentarios pasados; no se borra (Q4, P4: sin `deletedAt` en tablas de Better Auth).
  - Resetear contraseña: el admin escribe la nueva (8 a 128 caracteres) sin necesidad de conocer la anterior. No hay contraseña temporal ni obligación de cambiarla en el próximo login (Q8).
  - El propio usuario puede cambiar su contraseña si conoce la actual (Q8).
  - No se puede desactivar ni degradar (quitar rol `admin`) al último admin activo, ni desactivarse o degradarse a sí mismo. Al degradar a otro admin a `agente`, la misma acción exige asignarle un departamento activo (Q9).
- **EDGE CASES:**
  - `username` duplicado (sin distinguir mayúsculas): error de validación.
  - Alta de `agente` sin `organizationId`, o con uno inactivo o inexistente: 400.
  - Intentar desactivar/degradar al último admin activo o a uno mismo: 409.
  - Degradar a un admin sin indicar departamento en la misma request: 400.
- **MUST NOT:** que un agente gestione usuarios; borrado físico de usuarios (PRD §5.1); email obligatorio para el login.

**Feature 2.5: Autorización (guards y matriz PRD §4.2)**

- **MUST:**
  - `AuthGuard`, `PermissionsGuard`, `@RequirePermission()`, `@CurrentUser()` en `apps/api/src/common` (ARCH).
  - Un agente ve, crea, edita, cambia estado y comenta **solo** tickets de su propio departamento. No puede abrir ni listar tickets de otro departamento (decisión del usuario sobre PRD §4.2, 2026-09-29 — más estricto que "ver en solo lectura").
  - El admin: todo, en todos los departamentos, además de usuarios, departamentos y catálogos.
  - El permiso se evalúa siempre contra `ticket.departamento`, nunca contra `createdBy` (PRD §4.1).
  - La barrera real está en el backend; la UI solo oculta acciones que el usuario no podría ejecutar *(propuesta técnica)*.
- **EDGE CASES:**
  - Un agente intenta crear, ver, editar o comentar un ticket de otro departamento (por URL directa o payload manipulado): 403.
  - Cambiar el rol o el departamento de un usuario con sesión abierta: los permisos se reevalúan en la siguiente request, no hace falta invalidar la sesión *(propuesta técnica)*.
- **MUST NOT:** permisos resueltos dentro de un service; roles adicionales a `agente` y `admin` en el MVP.
- **Verificable:** un agente entra y solo ve/opera en su departamento; un agente no encuentra tickets de otro departamento ni por URL directa; el admin ve y opera en todos.

## Plan de implementación

1. Agregar Better Auth (`better-auth`) con adapter Prisma y plugins `username`, `organization`, `admin` en `apps/api/src/modules/auth`. Verificar: `pnpm --filter @syc/db generate` incorpora las tablas de Better Auth sin error.
2. Migración inicial: `prisma migrate dev` genera las tablas de Better Auth más el campo `activo` en `Organization`. Verificar: la migración aplica limpia sobre una base vacía.
3. `env.schema.ts`: agregar `BETTER_AUTH_SECRET`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`. Verificar: la API aborta con mensaje claro si falta alguna.
4. Script de seed (`packages/db/src/seed.ts` o similar): admin raíz + 4 departamentos, idempotente. Verificar: correrlo dos veces no duplica nada.
5. `AuthGuard` y `@CurrentUser()` que leen la sesión de Better Auth. Verificar: un endpoint protegido devuelve 401 sin sesión.
6. `packages/contracts/src/auth.ts` con los esquemas de login, alta de usuario, reseteo, cambio de contraseña y ABM de organización. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
7. Módulo `organizations`: router oRPC + service + repository para el ABM de departamentos, con las reglas de Feature 2.3. Verificar: eliminar un departamento con agentes devuelve 409; eliminar uno vacío funciona.
8. Módulo `users`: router oRPC + service + repository para alta, edición, ban/unban, reseteo y cambio de contraseña propio, con las reglas de Feature 2.4. Verificar: alta de agente sin departamento devuelve 400; degradar al último admin devuelve 409.
9. `PermissionsGuard` + `@RequirePermission()`: matriz de Feature 2.5 aplicada sobre un endpoint de prueba temporal (se reutiliza en SPEC 05). Verificar: un agente contra el departamento de otro recibe 403.
10. `apps/web`: feature `auth` (login, logout), rutas `_authenticated/*` con guard de sesión, y pantallas de admin para departamentos y usuarios. Verificar: sin sesión, cualquier ruta protegida redirige a `/login`.
11. Tests Vitest: `users.service.spec.ts` (últimos admin, alta sin departamento) y `organizations.service.spec.ts` (eliminar con historia). Verificar: `pnpm --filter @syc/api test` pasa.

## Criterios de aceptación

- [ ] Un usuario creado por el admin puede iniciar sesión con `username` + contraseña; uno no creado no puede.
- [ ] El seed corrido dos veces deja exactamente un admin raíz y 4 departamentos.
- [ ] Un agente sin departamento no se puede dar de alta (400).
- [ ] Desactivar al último admin activo, o a uno mismo, devuelve 409.
- [ ] Desactivar un usuario cierra sus sesiones activas de inmediato.
- [ ] El admin resetea la contraseña de un agente sin conocer la anterior; el agente cambia la propia solo si conoce la actual.
- [ ] Eliminar un departamento con al menos un ticket (activo o eliminado) o un agente devuelve 409; desactivarlo funciona.
- [ ] Desactivar o eliminar el último departamento activo devuelve 409.
- [ ] Un agente que pide un ticket de otro departamento por URL directa recibe 403.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** login por `username`, no por email (Q2). El email queda opcional y sin uso funcional (D4).
- **Sí:** `Organization.activo` como campo propio, distinto de las columnas de auditoría de negocio; no contradice P4 porque P4 habla de `createdAt/updatedAt/createdBy/updatedBy/deletedAt`.
- **Sí:** eliminar un departamento exige que nunca haya tenido historia (D2). Evita huérfanos en `AuditLog` y en tickets eliminados lógicamente que aún así siguen en la base (Q12).
- **Sí:** el agente no ve tickets de otro departamento (ni en solo lectura). Reinterpreta la matriz PRD §4.2 según la decisión del usuario del 2026-09-29; **requiere actualizar el PRD** (ver plan superior).
- **No:** email obligatorio. Rompería el flujo de alta por `username` sin agregar valor en el MVP.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El módulo `audit` (SPEC 03) todavía no existe: las mutaciones de este spec no quedan auditadas hasta que se implemente. | Se documenta aquí como deuda conocida; SPEC 03 debe verificar retroactivamente que `users` y `organizations` llaman a `audit.log(...)`. |
| El plugin `username` de Better Auth puede tener reglas de normalización distintas de las asumidas aquí. | Verificar la documentación de la versión exacta al implementar; si difiere, documentar el cambio en una decisión nueva. |
| Cambiar la visibilidad del agente (de "solo lectura en otros departamentos" a "sin acceso") es una reinterpretación del PRD §4.2. | Actualizar `docs/prd.md` §4.2 antes o junto con este spec, para que quede una sola fuente de verdad. |

## Qué **no** está en este spec

- El módulo `audit` en sí (SPEC 03): aquí solo se deja el punto de invocación.
- Catálogos y tickets (SPEC 04 y 05).
- Recuperación de contraseña por correo (descartada).
- Registro público (descartado, P6).
