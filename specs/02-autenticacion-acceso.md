# SPEC 02 — Autenticación y acceso

> **Status:** Approved
> **Depends on:** SPEC 01 (esqueleto)
> **Date:** 2026-10-01
> **Objective:** Better Auth (plugins `username`, `organization` y `admin`) cableado de punta a punta en la API y la web: login por usuario, sesión, seed del admin raíz y los 4 departamentos, ABM de departamentos y de usuarios por oRPC, y un portero central de permisos que hace cumplir la matriz del PRD §4.2.

## Por qué existe este spec

`docs/architecture.md` deja auth para después del esqueleto. Este spec cubre la etapa 1 del PRD §10: sin login no hay nada que proteger, y sin departamentos no hay `Ticket.departamento` que asignar en SPEC 05. Las respuestas del catálogo (`specs/00-catalogo-specs.md`, Q2 a Q9, D2 y D4) fijan el modelo; esta versión del spec (2026-10-01) además cierra cómo se integra Better Auth con Nest y oRPC, que antes quedaba implícito.

Toca varias áreas (auth, seed, guards, dos ABM y pantallas). Se mantiene como un solo spec porque es una única etapa del PRD y los SPEC 03 a 07 lo citan como "SPEC 02"; el plan va de backend a pantallas y cada paso deja el sistema funcionando.

## Alcance

**Dentro:**

- Better Auth con adapter Prisma y plugins `username`, `organization` (departamentos) y `admin` (rol global), configurado en `apps/api/src/modules/auth/auth.config.ts`.
- Migración inicial de Prisma con las tablas de Better Auth y el campo propio `Organization.activo`.
- Better Auth montado en la API con una **allowlist** de endpoints: solo login por usuario, logout, sesión actual y cambio de contraseña propio. El resto de sus endpoints (`admin/*`, `organization/*`, registro) responde 404.
- Módulos `auth`, `organizations` y `users` en `apps/api/src/modules`. El ABM es oRPC propio que llama a `auth.api.*` en el servidor.
- `AuthGuard` global (denegar por defecto, con `@Public()`), `PermissionsGuard`, `@RequirePermission()` y `@CurrentUser()` en `apps/api/src/common`.
- Seed manual e idempotente (`apps/api/src/seed.ts`): admin raíz + 4 departamentos (Administrativo, Técnico, Redes, Desarrollo).
- Rate limit del login con el `rateLimit` integrado de Better Auth.
- `apps/web`: `/login`, layout mínimo autenticado (topbar con usuario y logout, sidebar con "Administración" solo para el admin), pantallas de Departamentos y Usuarios, y "Cambiar mi contraseña" para cualquier usuario.
- Instalar en `apps/web` lo que SPEC 01 difirió hasta el primer formulario y la primera tabla: react-hook-form y TanStack Table.
- Actualizar `apps/api/CLAUDE.md`, `CLAUDE.md`, `docs/prd.md` y SPEC 01 donde este spec cambia una regla (ver paso 13).

**Fuera de alcance (para specs futuros):**

- El módulo `audit` en sí: aquí se deja el punto de invocación; hasta SPEC 03 estas mutaciones no dejan registro (ver Riesgos).
- Cualquier módulo de negocio (catálogos, tickets): SPEC 04 y 05. El chequeo de tickets al eliminar un departamento lo suma SPEC 05.
- Recuperación de contraseña por correo (PRD §5.2) y registro público (P6).
- Login social, 2FA, bloqueo de cuenta por intentos fallidos.
- Dashboard o bandeja: la home autenticada queda como placeholder hasta SPEC 05.
- Paginación y búsqueda en el listado de usuarios (el equipo es chico).

## Modelo de datos

Better Auth gestiona sus tablas vía su adapter Prisma; el esquema lo genera su CLI (`@better-auth/cli generate`) y no se escribe a mano. La migración incluye `User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, y también `Invitation` y `RateLimit`, que los plugins `organization` y `rateLimit` generan aunque este spec no los use directamente (`Invitation`) o solo los use Better Auth (`RateLimit`).

`Organization` recibe un campo propio, declarado como `additionalFields` del plugin `organization`. No es una columna de auditoría, así que no contradice P4.

```prisma
// packages/db/schema.prisma (fragmento ilustrativo; el generador produce el resto)
model Organization {
  // ...columnas de Better Auth (id, name, slug, createdAt, ...)...
  activo Boolean @default(true)
}
```

Roles:

- Rol global (plugin `admin`, columna `User.role`): `admin` o `agente`. `agente` es el rol por defecto.
- `Member.role` (plugin `organization`): siempre `agente`. Un admin **no tiene** `Member`.

Contratos nuevos en `packages/contracts/src` (fragmentos):

```ts
// auth.ts
export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

// users.ts
const usernameSchema = z.string().min(3).max(30).regex(/^[a-z0-9_.]+$/i);
export const createUserInputSchema = z
  .object({
    username: usernameSchema,
    name: z.string().trim().min(1).max(120),
    email: z.email().optional(),
    password: z.string().min(8).max(128),
    role: z.enum(["agente", "admin"]),
    organizationId: z.string().optional(),
  })
  .superRefine(/* agente exige organizationId; admin no lo lleva */);
export const updateUserInputSchema = z.object({
  userId: z.string(),
  username: usernameSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.email().nullable().optional(), // null = volver al email interno
  role: z.enum(["agente", "admin"]).optional(),
  organizationId: z.string().optional(), // obligatorio si el resultado es agente
});
export const setUserActiveInputSchema = z.object({ userId: z.string(), activo: z.boolean() });
export const resetPasswordInputSchema = z.object({
  userId: z.string(),
  password: z.string().min(8).max(128),
});
export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  email: z.string().nullable(), // null si es el email interno <username>@syc.local
  role: z.enum(["agente", "admin"]),
  activo: z.boolean(),
  department: z.object({ id: z.string(), nombre: z.string() }).nullable(),
});

// organizations.ts
export const organizationInputSchema = z.object({ nombre: z.string().trim().min(1).max(120) });
export const organizationSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  agentes: z.number().int(), // agentes asignados, activos o desactivados
});
```

Procedimientos oRPC (todos exigen sesión; los de gestión exigen rol `admin`):

- `users.me`, `users.list`, `users.create`, `users.update`, `users.setActive`, `users.resetPassword`.
- `organizations.list`, `organizations.create`, `organizations.rename`, `organizations.setActive`, `organizations.remove`.

Variables de entorno nuevas (`apps/api/src/config/env.schema.ts`):

```ts
BETTER_AUTH_SECRET: z.string().min(32),
BETTER_AUTH_URL: z.url(), // URL pública de la API; baseURL de Better Auth
```

El seed valida sus propias variables con un schema Zod aparte, **no** obligatorias para arrancar la API: `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`.

Convenciones:

- Sesión: `expiresIn` 12 horas, `updateAge` 1 hora. Mientras haya actividad se extiende; con 12 horas sin requests vence. Sin "recordarme" (Q3). `cookieCache` desactivado, para que los cambios de rol, departamento y ban se vean en la siguiente request.
- Contraseña: 8 a 128 caracteres, configurado en Better Auth (`minPasswordLength`, `maxPasswordLength`) y en los esquemas Zod. Sin otras reglas de complejidad.
- `username`: 3 a 30 caracteres, letras, números, `_` y `.`; único sin distinguir mayúsculas (el plugin normaliza a minúsculas).
- El email es opcional en el alta (D4). Si no se carga, se guarda `<username>@syc.local`; no se muestra, no sirve para login ni para nada más. Si cambia el `username` y el email sigue siendo el interno, se regenera con el nuevo `username`.
- `Organization.slug`: se genera del nombre al crear (minúsculas, sin acentos, kebab-case; sufijo `-2`, `-3` si colisiona) y **no cambia al renombrar**. No se muestra.
- Nombre de departamento: único comparando sin mayúsculas, sin acentos y sin espacios sobrantes ("Técnico" = "tecnico"), igual criterio que los catálogos (Q14).
- Rate limit del login: 5 intentos por minuto por IP en el endpoint de login, con almacenamiento en base (`RateLimit`) para que sobreviva a reinicios.
- Cookies sin el flag `Secure` (`advanced.useSecureCookies: false`), porque el despliegue es HTTP por IP sin HTTPS (SPEC 07, Q37).

## Contrato

**Feature 2.1: Login, logout y sesión**

- **MUST:**
  - Login con `username` + contraseña. Registro público deshabilitado; solo entran usuarios creados por el admin (P6, Q2).
  - Sesión de 12 horas que se renueva con actividad (`updateAge` 1 hora); sin "recordarme" (Q3).
  - Better Auth se expone en `/api/auth/*` solo para: login por usuario, logout, sesión actual y cambio de contraseña propio. Cualquier otro endpoint de Better Auth responde 404.
  - `AuthGuard` global con denegar por defecto: todo procedimiento exige sesión salvo los marcados con `@Public()`. Públicos: `health.check` y los endpoints de Better Auth de la allowlist.
  - Las rutas `_authenticated/*` de la web redirigen a `/login` sin sesión (ARCH).
  - Un usuario desactivado (ban, ver Feature 2.4) no puede iniciar sesión.
  - La API acepta cookies cross-origin desde `WEB_ORIGIN` (CORS con `credentials`) y la web envía las cookies (`credentials: "include"`) tanto en el cliente oRPC como en el cliente de Better Auth.
  - `users.me` devuelve usuario, rol y departamento de la sesión; la web lo usa para decidir qué mostrar.
- **EDGE CASES:**
  - Credenciales inválidas: mensaje genérico que no revela si el `username` existe.
  - Más de 5 intentos de login por minuto desde una IP: 429 y mensaje en `/login`.
  - Sesión expirada o revocada en medio del uso: 401 y redirección a `/login`.
  - Un usuario baneado con una sesión que sobrevivió por algún motivo: el `AuthGuard` la rechaza con 401 (defensa adicional al cierre de sesiones del ban).
- **MUST NOT:** registro público, login social, recuperación de contraseña por correo (PRD §5.2), exponer `admin/*` u `organization/*` de Better Auth.

**Feature 2.2: Admin raíz y departamentos por seed**

- **MUST:**
  - Comando manual `pnpm --filter @syc/api seed` (script `apps/api/src/seed.ts`): crea el admin raíz (rol global `admin`, sin departamento) y los 4 departamentos activos: Administrativo, Técnico, Redes, Desarrollo (PRD §10, etapa 1).
  - Las credenciales del admin raíz vienen de `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` y `SEED_ADMIN_NAME`, validadas con un schema Zod propio del seed. La API no las exige para arrancar.
  - Idempotente: busca por `username` y por nombre normalizado de departamento antes de crear.
  - Documentar en `CLAUDE.md` y `.env.example` cómo correrlo con Docker (`docker compose exec api pnpm --filter @syc/api seed`).
- **EDGE CASES:**
  - Correr el seed dos veces no duplica nada ni cambia la contraseña de un admin raíz que ya existe.
  - Si faltan las variables del admin raíz, el seed aborta con un mensaje que las nombra.
  - Como el seed no tiene sesión, crea el usuario por el contexto interno de Better Auth (`auth.$context`), usando su mismo hash de contraseña.
- **MUST NOT:** credenciales hardcodeadas ni commiteadas; que el seed corra solo al arrancar la API.

**Feature 2.3: Departamentos (ABM)**

- **MUST:**
  - Departamento = `Organization` de Better Auth. No existe una tabla `Departamento` aparte (PRD §4.1).
  - El admin crea, renombra, desactiva, reactiva y elimina departamentos desde la UI (Q5). Solo el admin llama a `organizations.*`.
  - El nombre es único según la convención de este spec; duplicado → 409.
  - Crear una organización no deja al admin que la creó como `Member`: el admin no tiene departamento.
  - Desactivar un departamento: sale de los selectores de alta de usuario y de ticket; no se le pueden asignar agentes nuevos ni crear tickets nuevos en él; no se puede mover un ticket existente hacia él. Los tickets que ya lo tienen lo siguen mostrando y no se mueven solos. Los agentes que ya pertenecen a él siguen entrando y ven, editan y comentan esos tickets; no pueden crear tickets mientras esté desactivado. Se puede reactivar. (En este spec se implementa lo que existe hoy: selectores y asignación de agentes; SPEC 05 hace cumplir lo referido a tickets.)
  - Eliminar un departamento solo se permite si **hoy** no tiene agentes asignados (activos o desactivados) ni tickets, ni siquiera eliminados lógicamente (D2, ajustado el 2026-10-01: "nunca tuvo" pasa a "hoy no tiene", porque un agente movido no deja rastro y los tickets son lo que dejaría referencias rotas). En SPEC 02 el chequeo cubre solo agentes; SPEC 05 suma el chequeo de tickets en el mismo método. Es un `DELETE` real porque `Organization` no lleva `deletedAt`.
  - No se puede desactivar ni eliminar el último departamento activo.
- **EDGE CASES:**
  - Eliminar un departamento con agentes (o, desde SPEC 05, con tickets): 409 y mensaje que sugiere desactivar.
  - Desactivar o eliminar el último departamento activo: 409.
  - Renombrar a un nombre que ya usa otro departamento: 409. Renombrar a su propio nombre con otra capitalización es válido.
  - `organizations.list` devuelve también los desactivados, con su `activo` y la cantidad de agentes; los selectores filtran por `activo` en la UI.
- **MUST NOT:** tabla propia de departamentos; borrado físico de un departamento con agentes o tickets; derivar tickets entre departamentos (P7).

**Feature 2.4: Gestión de usuarios (admin)**

- **MUST:**
  - Solo el admin da de alta, edita, desactiva/reactiva y resetea contraseñas (PRD §5.1). Solo él llama a `users.list`, `create`, `update`, `setActive` y `resetPassword`.
  - Alta: `username`, nombre, contraseña (la escribe el admin), rol (`agente` | `admin`), email opcional (D4). Si `role = agente`, `organizationId` es obligatorio y debe ser un departamento activo; si `role = admin`, no lleva departamento (Q6, Q7, Q9).
  - Edición: el admin puede cambiar `username`, nombre, email, rol y departamento. Un agente tiene exactamente un departamento; el resultado de cualquier edición no puede dejarlo sin ninguno ni con dos (Q6, Q7).
  - Promover un agente a admin le quita su membresía. Degradar un admin a agente exige un departamento activo en la misma request (Q9).
  - Cambiar el departamento de un agente deja siempre exactamente un `Member`: primero se agrega el nuevo y después se quita el anterior.
  - Desactivar = `ban` del plugin `admin`, sin fecha de vencimiento. Cierra las sesiones activas de inmediato y bloquea el login. Reactivar = `unban` (Q4).
  - El usuario desactivado sigue visible para el admin en el listado y como autor en historiales y comentarios pasados; no se borra (Q4, P4: sin `deletedAt` en tablas de Better Auth).
  - Resetear contraseña: el admin escribe la nueva (8 a 128 caracteres) sin conocer la anterior. No hay contraseña temporal ni obligación de cambiarla en el próximo login (Q8). Al resetear se cierran las sesiones activas de ese usuario *(propuesta técnica)*.
  - El propio usuario cambia su contraseña si conoce la actual (Q8), desde "Cambiar mi contraseña". Al cambiarla se cierran sus otras sesiones *(propuesta técnica)*.
  - No se puede desactivar ni degradar al último admin activo, ni desactivarse o degradarse a sí mismo (PRD §4.1, P15).
- **EDGE CASES:**
  - `username` duplicado (sin distinguir mayúsculas), en el alta o al editarlo: 409.
  - Alta de `agente` sin `organizationId`, o con uno inactivo o inexistente: 400.
  - Degradar a un admin sin indicar departamento en la misma request: 400.
  - Intentar desactivar o degradar al último admin activo, o a uno mismo: 409.
  - Editar el `username` de un usuario cuyo email es el interno: el email interno se regenera.
  - Borrar el email de un usuario (`email: null`) lo devuelve al interno `<username>@syc.local`.
- **MUST NOT:** que un agente gestione usuarios; borrado físico de usuarios (PRD §5.1); email obligatorio para el login; mostrar el email interno en pantalla.

**Feature 2.5: Autorización (portero central y matriz PRD §4.2)**

- **MUST:**
  - `AuthGuard`, `PermissionsGuard`, `@RequirePermission()`, `@CurrentUser()` y `@Public()` en `apps/api/src/common` (ARCH).
  - Los permisos se declaran en el decorador de cada endpoint. `@RequirePermission(permiso, { departmentFrom })`: el guard evalúa el permiso contra el rol del usuario y, cuando el recurso pertenece a un departamento, contra el departamento del recurso que resuelve `departmentFrom`.
  - Después de autorizar, el guard deja en la request el scope del usuario (`{ departmentId }` para un agente, sin filtro para un admin) y `@CurrentUser()` lo expone. Los services lo usan como **filtro obligatorio** en listados; no deciden permisos.
  - Matriz (PRD §4.2): un agente ve, crea, edita, cambia estado y comenta **solo** tickets de su propio departamento y no puede abrir ni listar los de otro. El admin: todo, en todos los departamentos, más usuarios, departamentos y catálogos. Eliminar ticket, eliminar comentario y cambiar el departamento de un ticket son solo del admin.
  - El permiso se evalúa siempre contra `ticket.departamento`, nunca contra `createdBy` (PRD §4.1).
  - El departamento del usuario se lee de `Member` en cada request, no de la sesión.
  - La barrera real está en el backend; la UI solo oculta lo que el usuario no podría ejecutar.
  - SPEC 02 implementa y prueba la mecánica con un endpoint de prueba temporal con recurso ficticio; SPEC 05 la reutiliza con tickets reales.
- **EDGE CASES:**
  - Un agente intenta crear, ver, editar o comentar en otro departamento (URL directa o payload manipulado): 403.
  - Un agente cuyo `Member` no existe (estado inconsistente): 403 en todo lo que exija departamento.
  - Cambiar el rol o el departamento de un usuario con sesión abierta: los permisos cambian en la siguiente request, sin invalidar la sesión.
- **MUST NOT:** permisos resueltos dentro de un service; roles adicionales a `agente` y `admin` en el MVP.
- **Verificable:** un agente entra y solo opera en su departamento; no encuentra tickets de otro ni por URL directa; el admin ve y opera en todos.

**Feature 2.6: Web: login, layout y pantallas de administración**

- **MUST:**
  - `/login` con usuario y contraseña (react-hook-form + `loginInputSchema`), con mensaje de error genérico y mensaje específico para 429.
  - Layout `_authenticated`: topbar con nombre del usuario, acceso a "Cambiar mi contraseña" y logout; sidebar con la entrada "Administración" visible solo para el rol `admin`. La home (`/`) autenticada es un placeholder.
  - Rutas `/admin/departamentos` y `/admin/usuarios` accesibles solo al admin; un agente que entra por URL es redirigido a `/`.
  - Departamentos: tabla con nombre, estado y cantidad de agentes; acciones crear, renombrar, desactivar/reactivar y eliminar. Muestra el mensaje del 409 cuando corresponde.
  - Usuarios: tabla con usuario, nombre, rol, departamento y estado (los desactivados se ven, marcados); acciones alta, edición, desactivar/reactivar y resetear contraseña. El selector de departamento ofrece solo los activos.
  - Todo acceso al servidor pasa por hooks de `features/auth`, `features/users` y `features/organizations`; las rutas y componentes de layout no llaman a los clientes directamente (apps/web/CLAUDE.md). La guarda de sesión de `_authenticated` usa una función exportada por `features/auth`.
- **EDGE CASES:**
  - Un 401 en cualquier llamada limpia la sesión en memoria y redirige a `/login`.
  - Un usuario sin sesión que entra a una ruta protegida vuelve a esa ruta después de loguearse *(propuesta técnica)*.
- **MUST NOT:** mostrar el email interno; lógica de permisos en componentes más allá de ocultar lo no permitido.

## Plan de implementación

1. **Dependencias y variables de entorno.** Agregar `better-auth` y `@better-auth/cli` (versión exacta) a `apps/api`. Sumar `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` a `env.schema.ts`, `.env.example` y `docker-compose.yml` (con un valor de desarrollo en el compose). Verificar: la API arranca con `docker compose up` y aborta con un mensaje que nombra `BETTER_AUTH_SECRET` si se lo quita.
2. **Configuración de Better Auth y migración.** Crear `modules/auth/auth.config.ts` con adapter Prisma, plugins `username`, `organization` (con `additionalFields.activo` y `allowUserToCreateOrganization: false`) y `admin` (rol por defecto `agente`), `rateLimit`, sesión y cookies según el Modelo de datos. Es el único archivo fuera de un `*.repository.ts` autorizado a importar `@syc/db`. Generar el schema con el CLI, correr `prisma migrate dev`. Verificar: la migración aplica limpia sobre una base vacía y `pnpm --filter @syc/db generate` pasa.
3. **Montar Better Auth en Nest.** Handler en `/api/auth/*` con la allowlist, orden correcto de body parsers, CORS con `credentials` y `trustedOrigins`. Verificar: `GET /api/auth/get-session` sin cookie devuelve sesión nula; `POST /api/auth/admin/create-user` y `POST /api/auth/sign-up/email` devuelven 404; `GET /health` sigue respondiendo `ok`.
4. **Seed.** `apps/api/src/seed.ts` con su schema Zod y el script `seed` en `apps/api/package.json`. Verificar: corrido dos veces deja un admin raíz y 4 departamentos; sin variables aborta nombrándolas; un `curl` a `/api/auth/sign-in/username` con las credenciales del seed devuelve cookie de sesión.
5. **`AuthGuard` global y `@CurrentUser()`.** Registrar el guard como global, crear `@Public()` y marcar `health` como público; exponer `users.me` (contrato mínimo). Verificar: `users.me` sin cookie devuelve 401, con la cookie del paso 4 devuelve el admin raíz y `GET /health` sigue público.
6. **Contratos.** `packages/contracts/src/auth.ts`, `users.ts` y `organizations.ts` con los esquemas y procedimientos del Modelo de datos. Verificar: `pnpm --filter @syc/contracts typecheck` pasa y `apps/api` marca los procedimientos aún sin implementar.
7. **Módulo `organizations`.** Router oRPC + service + repository con las reglas de la Feature 2.3 (unicidad, slug, último activo, eliminar sin agentes, quitar al admin creador del `Member`). Verificar: crear "Soporte" funciona; crear "tecnico" devuelve 409; eliminar un departamento con agentes devuelve 409; eliminar uno vacío funciona.
8. **Módulo `users`, altas y edición.** `create`, `list`, `update` con las reglas de la Feature 2.4 (departamento obligatorio, username editable, email interno, promover/degradar, cambio de departamento). Verificar: alta de agente sin departamento devuelve 400; alta con departamento inactivo devuelve 400; cambiar de departamento deja un solo `Member`.
9. **Módulo `users`, estado y contraseñas.** `setActive` (ban/unban), `resetPassword`, cambio de contraseña propio por la allowlist, y las protecciones del último admin y de uno mismo. Verificar: desactivar a un agente cierra su sesión y bloquea su login; desactivar al último admin devuelve 409; el reset no pide la contraseña anterior.
10. **`PermissionsGuard` y `@RequirePermission()`.** Matriz de permisos como constantes en `apps/api/src/common`, scope en la request y endpoint de prueba temporal con recurso ficticio asignado a un departamento. Verificar: un agente contra el recurso de otro departamento recibe 403; contra el de su departamento recibe 200; el admin accede a ambos.
11. **Web: infraestructura de auth.** Instalar react-hook-form, `@hookform/resolvers`, TanStack Table y los componentes shadcn necesarios; crear `lib/auth-client.ts`, `features/auth` (hooks de login, logout y sesión), `/login`, layout `_authenticated`, home placeholder y logout. Verificar: sin sesión, cualquier ruta protegida redirige a `/login`; con las credenciales del seed se entra y se sale.
12. **Web: pantallas de administración y perfil.** `features/organizations` y `features/users`, rutas `/admin/departamentos` y `/admin/usuarios`, y "Cambiar mi contraseña". Verificar: el admin completa el ciclo de un departamento y de un usuario desde la UI; un agente no ve "Administración" y es redirigido si entra por URL.
13. **Tests y documentación.** Tests Vitest: `users.service.spec.ts`, `organizations.service.spec.ts` y `permissions.guard.spec.ts`. Actualizar: `apps/api/CLAUDE.md` (excepción de `auth.config.ts`, `@Public()`, seed), `CLAUDE.md` (Estado del repositorio, comando de seed), criterio de SPEC 01 sobre imports de `@syc/db`, y `docs/prd.md` §4.1, §5.1 y P16 ("nunca tuvo" → "hoy no tiene agentes ni tickets"). Verificar: `pnpm --filter @syc/api test` pasa y `pnpm turbo lint typecheck test build` termina con código 0.

## Criterios de aceptación

- [ ] Un usuario creado por el admin inicia sesión con `username` + contraseña; uno no creado no puede.
- [ ] `POST /api/auth/admin/create-user`, `POST /api/auth/organization/create` y `POST /api/auth/sign-up/email` devuelven 404, también con sesión de admin.
- [ ] El seed corrido dos veces deja exactamente un admin raíz y 4 departamentos; sin `SEED_ADMIN_*` aborta nombrando las variables.
- [ ] La API arranca sin `SEED_ADMIN_*` definidas.
- [ ] Un procedimiento de dominio sin sesión devuelve 401; `health.check` responde sin sesión.
- [ ] Una sesión con más de 1 hora de antigüedad que hace una request recibe un `expiresAt` nuevo (verificado en la tabla `Session`).
- [ ] El sexto intento de login en un minuto desde la misma IP devuelve 429.
- [ ] Un agente sin departamento no se puede dar de alta (400); tampoco con un departamento inactivo.
- [ ] Cambiar el departamento de un agente deja exactamente un `Member`; promoverlo a admin lo deja sin ninguno.
- [ ] Desactivar al último admin activo, o a uno mismo, devuelve 409; degradarlos también.
- [ ] Degradar a un admin sin indicar departamento devuelve 400.
- [ ] Desactivar un usuario cierra sus sesiones activas de inmediato y su siguiente login falla.
- [ ] Editar el `username` de un usuario con email interno actualiza el email interno; el email interno no aparece en ninguna respuesta de `users.*` ni en la UI.
- [ ] El admin resetea la contraseña de un agente sin conocer la anterior; el agente cambia la propia solo si conoce la actual.
- [ ] Crear un departamento llamado "tecnico" cuando existe "Técnico" devuelve 409.
- [ ] Eliminar un departamento con al menos un agente (activo o desactivado) devuelve 409; desactivarlo funciona.
- [ ] Desactivar o eliminar el último departamento activo devuelve 409.
- [ ] Crear un departamento no deja al admin como `Member` de ese departamento.
- [ ] En el endpoint de prueba, un agente contra un recurso de otro departamento recibe 403; el admin accede a recursos de todos los departamentos.
- [ ] Un cambio de departamento de un agente se refleja en su siguiente request sin cerrar sesión.
- [ ] Sin sesión, cualquier ruta `_authenticated/*` redirige a `/login`; un agente que entra por URL a `/admin/*` vuelve a `/`.
- [ ] El login funciona por HTTP (sin `Secure` en la cookie) con `NODE_ENV=production`.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** un solo spec para toda la etapa 1. Es una etapa del PRD y SPEC 03 a 07 lo citan por número; se evita renumerar. El plan ordena el trabajo de backend a pantallas.
- **Sí:** ABM por oRPC propio que llama a `auth.api.*` en el servidor, con allowlist de endpoints de Better Auth. Las reglas (último admin, departamento obligatorio, 409) viven en el service y los contratos Zod; un agente no puede saltarse nada llamando a `admin/*` u `organization/*` directamente.
- **No:** que la web use `authClient.admin.*` y `authClient.organization.*`. Dejaría las reglas del spec en hooks de Better Auth y los endpoints abiertos a los agentes.
- **No:** escribir las tablas de Better Auth con Prisma a mano para el ABM. Habría que reimplementar hash de contraseñas, ban y revocación de sesiones.
- **Sí:** login por `username`, no por email (Q2). El email queda opcional y sin uso funcional (D4).
- **Sí:** sesión de 12 horas con renovación por actividad (`updateAge` 1 hora). Se descarta "12 horas fijas" porque obliga a reloguearse en plena jornada, y el tope absoluto con renovación porque exige lógica propia. El texto anterior ("renovada a diario") era inconsistente: con `updateAge` mayor que `expiresIn` la sesión nunca se renueva.
- **Sí:** `auth.config.ts` es excepción acotada a la regla "solo los `*.repository.ts` importan `@syc/db`", por ser la raíz de composición de Better Auth. Se documenta en `apps/api/CLAUDE.md` y en SPEC 01. Se descarta un `PrismaService` inyectado: obliga a construir Better Auth dentro de un provider asíncrono para evitar una sola excepción de lint.
- **Sí:** `Organization.activo` como campo propio, distinto de las columnas de auditoría de negocio; no contradice P4.
- **Sí:** nombre de departamento único sin mayúsculas ni acentos y `slug` fijo generado al crear. No sigue al renombrado porque es un identificador que Better Auth usa internamente.
- **Sí:** eliminar un departamento exige que **hoy** no tenga agentes ni tickets. Ajusta D2: "nunca tuvo" no se puede verificar porque un agente movido no deja rastro en `Member` y `Ticket` no existe hasta SPEC 05. Se descartan `tuvoAgentes` (otro campo propio) y consultar `AuditLog` (depende de SPEC 03). Lo que protege es la integridad referencial, y esa la dan los tickets.
- **Sí:** el admin puede editar `username`. Se acepta el costo: cambia el identificador de login. El historial referencia al usuario por `id`, no por `username`.
- **Sí:** seed manual en `apps/api`, no automático al arrancar. Necesita el hash de Better Auth, así que no puede vivir en `packages/db`. Sus variables no son obligatorias para la API, así que producción no queda atada a credenciales de seed.
- **Sí:** rate limit integrado de Better Auth en el login. Se descartan bloquear la cuenta (un tercero podría bloquear la de otro a propósito) y no proteger nada.
- **Sí:** portero central para permisos (`@RequirePermission` + scope en la request). Cumple "permisos nunca en el service" y evita chequeos olvidados. Se descarta decidir el departamento en cada service.
- **Sí:** layout mínimo con "Administración" solo para el admin y "Cambiar mi contraseña" para todos. No se diseña la navegación final: se adelantaría el diseño de SPEC 04 a 06.
- **Sí:** cookies sin `Secure` mientras el despliegue sea HTTP por IP (Q37). Si algún día hay HTTPS, se activa.
- **Sí:** el agente no ve tickets de otro departamento, ni en solo lectura (P17, PRD §4.2 v6).
- **Sí:** el ban y el reseteo de contraseña cierran las sesiones del usuario afectado.
- **No:** `@thallesp/nestjs-better-auth` ni otro adaptador de terceros. Montar el handler a mano son pocas líneas y evita una dependencia más en la pieza más sensible.
- **No:** email obligatorio. Rompería el alta por `username` sin aportar valor en el MVP.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El módulo `audit` (SPEC 03) todavía no existe: las mutaciones de este spec no quedan auditadas hasta que se implemente. | Deuda conocida; SPEC 03 retrofittea `users` y `organizations` (SPEC 03, paso 6). |
| `createOrganization` agrega al creador como `Member` (con rol propietario) y `removeMember` puede negarse a quitar al último propietario; el admin no debe tener `Member`. | Verificar el comportamiento exacto de la versión fijada en el paso 7. Si bloquea, usar el adapter interno (`auth.$context.adapter`) para crear la organización y los `Member` sin pasar por esas reglas. Documentar en una decisión nueva. |
| Cambiar el departamento de un agente son dos operaciones (agregar y quitar `Member`) fuera de una transacción propia. | Orden agregar-nuevo → quitar-anterior para no quedar nunca sin departamento; si falla el segundo paso, se deshace el primero. El peor caso es un agente con dos membresías, que el chequeo de "exactamente uno" detecta. |
| Chequeos de "último admin" y "último departamento activo" sin transacción: dos requests simultáneas podrían saltearlos. | Probabilidad despreciable con uno o dos admins; se acepta en el MVP. Si molesta, se envuelve en `$transaction` con bloqueo (revisar junto con SPEC 03, que ya introduce transacciones). |
| Better Auth en producción activa cookies `Secure` por defecto y el despliegue es HTTP: el login no funcionaría. | `advanced.useSecureCookies: false`, con un criterio de aceptación explícito. Revisar si se agrega HTTPS (Q37). |
| Detrás de Nginx (SPEC 07) todas las requests parecen venir de la misma IP y el rate limit del login bloquearía a todos. | SPEC 07 debe configurar el header de IP del proxy en Better Auth (`advanced.ipAddress`). Anotado aquí para que no se pierda. |
| El plugin `username` puede normalizar distinto de lo asumido (minúsculas, `displayUsername`) o no permitir cambiar el `username` por `admin.updateUser`. | Verificar con la versión exacta en el paso 8. Si difiere, documentar el cambio como decisión nueva. |
| Better Auth y el body parser de Nest chocan si se monta mal (cuerpo vacío en el login). | Montar el handler antes de los parsers y re-habilitar JSON para el resto; verificado por el paso 3. |
| El seed crea el usuario por `auth.$context` (API interna de Better Auth) y esa interfaz puede cambiar entre versiones. | Versión exacta fijada; el criterio de aceptación del seed (login con las credenciales del seed) detecta el quiebre. |
| El generador de Better Auth agrega `Invitation` y `RateLimit`, que el PRD §8.3 no lista. | Se documenta aquí. No se usan salvo `RateLimit` por Better Auth; el PRD se actualiza en el paso 13. |

## Qué **no** está en este spec

- El módulo `audit` en sí (SPEC 03): aquí solo se deja el punto de invocación.
- Catálogos y tickets (SPEC 04 y 05), incluido el chequeo de tickets al eliminar un departamento.
- Recuperación de contraseña por correo (descartada) y registro público (descartado, P6).
- Login social, 2FA, bloqueo de cuenta por intentos fallidos.
- Dashboard, bandeja y navegación definitiva de la web.
- HTTPS, configuración del proxy y despliegue (SPEC 07).

Cada uno de esos puntos, si se aborda, va en su propio spec.
