# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repositorio

El esqueleto del monorepo (SPEC 01), la autenticación y acceso (SPEC 02, `specs/02-autenticacion-acceso.md`), la auditoría con eliminación lógica (SPEC 03, `specs/03-auditoria-soft-delete.md`), los catálogos (SPEC 04, `specs/04-catalogos.md`), los tickets núcleo (SPEC 05, `specs/05-tickets-nucleo.md`) y los comentarios con la bandeja (SPEC 06, `specs/06-comentarios-bandeja.md`) existen: Better Auth con login por usuario, seed del admin raíz y los 4 departamentos, ABM de departamentos y usuarios, portero central de permisos, el ABM de los 7 catálogos (Área, Edificio, TipoTicket, Prioridad, Modulo, Proveedor y EstadoTicket), el ciclo completo de un ticket (alta con número `TE-000013`, edición con bloqueo optimista, cambio de estado, cambio de departamento, eliminación lógica e historial), los comentarios inmutables de un ticket (alta y eliminación solo del admin, auditadas sin el texto) y la bandeja con búsqueda sin mayúsculas ni acentos, filtros y 20 tickets por página. En la web: login, layout autenticado, las pantallas de administración (`/admin/departamentos`, `/admin/usuarios` y `/admin/catalogos`) y las de tickets (`/tickets` es la bandeja, con la búsqueda, los filtros y la página en la URL; `/tickets/nuevo` y `/tickets/$ticketId`, con sus comentarios; `/` redirige a `/tickets`). Procedimientos: `health.check`, `users.*`, `organizations.*`, `catalogs.<catálogo>.*` (con `history`, solo admin y sin UI; `catalogs.<catálogo>.list` lo lee cualquier usuario con sesión), `tickets.*` (`list` —la bandeja paginada con filtros—, `get`, `create`, `update`, `changeStatus`, `changeDepartment`, `remove` e `history`) y `comments.*` (`list`, `create` y `remove`). Los modelos Prisma son los de Better Auth (migración `auth_inicial`), `AuditLog` (migración `auditoria`), los 7 catálogos (migración `catalogos`), `Ticket` (migración `tickets`) y `TicketComentario` (migración `comentarios`, que además activa la extensión `unaccent` de Postgres): `modules/audit` registra las mutaciones de usuarios, departamentos, catálogos, tickets y sus comentarios. El endurecimiento y despliegue (SPEC 07, `specs/07-endurecimiento-despliegue.md`) también existe: `docker-compose.prod.yml` (postgres, migrate, api, web con Nginx y backup), los Dockerfiles de producción de la API (`apps/api/Dockerfile`, targets `migrate` y `api`) y de la web (`apps/web/Dockerfile`, con `apps/web/nginx.conf`), `docker/backup/` (backup diario con rotación de 30 y `restore.sh`), el rate limit del login por IP real, `docs/despliegue.md` y `docs/checklist-permisos.md`. Antes de asumir que algo existe (un script, una carpeta, una dependencia), verificalo con `ls`/`find`.

Paquetes existentes: `apps/api` (`@syc/api`), `apps/web` (`@syc/web`), `packages/contracts` (`@syc/contracts`), `packages/db` (`@syc/db`), `packages/config` (`@syc/config`). `packages/ui` no existe todavía (se crea con la segunda app).

## Documentación

No se carga sola: abrila cuando la tarea lo requiera.

- `docs/prd.md`: producto (qué es el sistema, permisos, modelo del ticket, etapas). Fuente de verdad del producto.
- `docs/architecture.md`: stack, por qué cada elección, estructura y cómo crecen los campos. Fuente de verdad de la tecnología. Consultala antes de decidir algo distinto.
- `docs/despliegue.md`: procedimiento en el servidor (primer deploy, deploy regular, vuelta atrás, backups y restauración).
- `docs/checklist-permisos.md`: la matriz de permisos del PRD §4.2 para recorrer a mano contra el servidor, con el registro de corridas.
- `specs/`: un SPEC por etapa, escrito antes de implementar.
- `plans/`: el plan de implementación que se siguió para cada SPEC (referencia; el SPEC manda).
- Reglas por capa: `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md` y `packages/db/CLAUDE.md` (cargan al trabajar en esa carpeta).

## Comandos

Requisitos: Node 22 (`.nvmrc`), pnpm 11 (`packageManager`), Docker.

```bash
pnpm install                              # instala todo el workspace
docker compose up                         # postgres + api + web con hot reload (web :5173, api :3000, postgres :5432)
docker compose down                       # detiene el stack (conserva volúmenes)

pnpm lint                                 # biome check sobre todo el repo
pnpm format                               # biome format --write
pnpm typecheck                            # turbo typecheck (tsc --noEmit en cada paquete)
pnpm test                                 # turbo test (Vitest)
pnpm build                                # turbo build
pnpm turbo lint typecheck test build      # las cuatro tareas, como en el CI
pnpm verify                               # verifica los criterios de aceptación de SPEC 01 a 07 (ver abajo)

pnpm --filter @syc/db generate            # prisma generate (turbo ya lo corre antes de typecheck/test/build)
pnpm --filter @syc/db exec prisma migrate deploy   # aplica las migraciones (necesita DATABASE_URL)
pnpm --filter @syc/api seed               # admin raíz, 4 departamentos, estados, prioridades, áreas, edificios y agentes; manual e idempotente (necesita SEED_ADMIN_*)
pnpm --filter @syc/api test               # tests de un solo paquete
pnpm --filter @syc/web dev                # web fuera de Docker (necesita VITE_API_URL)
pnpm --filter @syc/api dev                # api fuera de Docker (necesita DATABASE_URL, WEB_ORIGIN, NODE_ENV, BETTER_AUTH_SECRET, BETTER_AUTH_URL; ver .env.example)
```

**Primera vez con Docker** (la base arranca vacía, y ni las migraciones ni el seed corren solos):

```bash
docker compose up
docker compose exec api pnpm --filter @syc/db exec prisma migrate deploy
docker compose exec api pnpm --filter @syc/api seed
```

El seed lee `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` y `SEED_ADMIN_NAME` (y, opcional, `SEED_AGENTS_PASSWORD` para cargar los agentes de `seed-data/agentes.json`) del `.env` de la raíz (el repo está montado en el contenedor); también se pueden pasar con `docker compose exec -e VAR=valor api ...`. Sin ellas aborta nombrándolas. La API **no** las necesita para arrancar. Cambiar el esquema: ver `packages/db/CLAUDE.md`.

**Volver a la base vacía** (para probar de nuevo; borra todos los datos de desarrollo), con el stack levantado:

```bash
docker compose exec api pnpm --filter @syc/db exec prisma migrate reset --force
docker compose exec api pnpm --filter @syc/api seed   # el reset no corre el seed
```

Nunca `docker compose down -v` para esto: borra también los volúmenes de `node_modules` y el store de pnpm. El paso a paso completo, con la alternativa de borrar el volumen `system-syc_postgres_data`, está en el `README.md` (sección "Base de datos de desarrollo").

**`pnpm verify`** (`scripts/verify-acceptance.mjs`, solo el CLI; un archivo por SPEC en `scripts/verify/specs/` y piezas compartidas en `scripts/verify/lib/`): recorre los criterios de aceptación (`--spec 05`, `--only 02.7,02.19`, `--skip-turbo`, `--keep-db`). Los de SPEC 02, 03, 04, 05 y 06 corren contra una API real en `NODE_ENV=production` y una base temporal creada en el Postgres del compose (se borra al terminar; la de desarrollo no se toca). Necesita Docker. Los criterios de SPEC 01 que dependen del compose (levantar, hot reload, `degraded`) no están cubiertos. **Los de SPEC 07 no usan esa API ni esa base temporal**: levantan `docker-compose.prod.yml` entero con el proyecto `syc-verify-07`, un puerto alternativo (`VERIFY_HTTP_PORT`, 18087 por defecto), una carpeta de backups temporal y secretos de prueba, y lo bajan con `down -v` al terminar (`--spec 07` tarda varios minutos por el build de las imágenes; `--keep-db` conserva ese stack para mirarlo). **Para un SPEC nuevo**: crear `scripts/verify/specs/NN-nombre.mjs` con `defineSpec` (ver `lib/spec.mjs`; los fixtures de `lib/fixtures.mjs` se reutilizan) y agregarlo a `specs/index.mjs`.

**Producción** (servidor on-premise; el procedimiento completo, con primer deploy, deploy regular, vuelta atrás y backups, está en `docs/despliegue.md`). Se despliega un tag `vAAAA.MM.DD` sobre `main`, nunca una rama, y el `.env` sale de `.env.production.example`:

```bash
docker compose -f docker-compose.prod.yml up -d --build                                # construye, migra solo y levanta todo
docker compose -f docker-compose.prod.yml run --rm api node dist/seed.mjs              # seed del primer deploy
docker compose -f docker-compose.prod.yml exec backup backup.sh                        # backup manual (siempre antes de un deploy)
docker compose -f docker-compose.prod.yml exec backup restore.sh --confirmar <copia>   # reemplaza la base; detener `api` antes
```

Solo `web` (Nginx) publica un puerto; entra todo por `PUBLIC_URL`. `docker-compose.prod.yml` es otro entorno que `docker-compose.yml` (desarrollo): proyecto propio (`syc-prod`), sin volúmenes compartidos.

El `.env` es opcional con Docker en desarrollo (las variables de la API y la web tienen default en `docker-compose.yml`; las del seed no); `.env.example` lista las variables. El CI está en `.github/workflows/ci.yml` y filtra con `turbo --filter="...[origin/<base>]"`.

## Particularidades que no son obvias

- **`turbo.json`**: `typecheck`, `test` y `build` dependen de `^typecheck`; sin eso Turbo da cache hit al cambiar un contrato y no detecta el error en los consumidores.
- **pnpm 11 bloquea scripts de build** por defecto: `allowBuilds` en `pnpm-workspace.yaml` autoriza solo `prisma` y `@prisma/engines`. pnpm también agrega entradas a `minimumReleaseAgeExclude` por su cuenta; es esperable.
- **Versiones exactas** (sin `^`) en todos los `package.json`.
- El `biome.json` de la raíz solo extiende `packages/config/biome.json` (Biome exige una config en la raíz).
- Los paquetes del workspace exportan su fuente `.ts`, sin build propio (detalle del bundle en `apps/api/CLAUDE.md`).
- **Auth**: Better Auth se expone en `/api/auth/*` solo para login por usuario, logout, sesión actual y cambio de contraseña propio; cualquier otro endpoint suyo (`admin/*`, `organization/*`, registro) responde 404. Todo el ABM va por oRPC (`users.*`, `organizations.*`). Detalle en `apps/api/CLAUDE.md`.
- **Tickets fuera del alcance dan 404, no 403**: un agente que pide un ticket de otro departamento recibe el mismo 404 que por un id inexistente (`@RequirePermission(..., { outOfScope: "not-found" })`), para no revelar qué números existen. La excepción es crear en otro departamento, que sigue siendo 403. El 404 lo responde el guard como excepción de Nest, no como `ORPCError`: la web lo detecta por status. Detalle en `apps/api/CLAUDE.md`.
- **Cookies sin `Secure`** (`advanced.useSecureCookies: false`): el despliegue es HTTP por IP. Si algún día hay HTTPS, se activa.
- **Rate limit del login** (5 por minuto por IP): en producción cuenta por la IP real del cliente, porque `auth.config.ts` lee `x-real-ip` (`advanced.ipAddress.ipAddressHeaders`) y Nginx lo manda pisando el que traiga el cliente. En desarrollo no hay proxy: Better Auth no ve la IP y usa un solo contador compartido por ruta.
- **Producción: una sola URL.** La API va por el mismo origen, bajo `/api` (Nginx reenvía `/api/auth/*` con la ruta intacta y el resto de `/api/*` sin el prefijo). `WEB_ORIGIN` y `BETTER_AUTH_URL` valen `PUBLIC_URL`: entrar por otra URL (otro host, otro puerto) hace fallar el login. Sin HTTPS ni dominio por decisión explícita (Q37).
- **Las migraciones y el seed no corren al arrancar la API.** En producción las aplica el servicio `migrate` antes de `api`; el seed es un comando manual del primer deploy (`docs/despliegue.md`).

## Arquitectura

Monolito modular en un monorepo: una sola API y un solo frontend, organizados por módulos de negocio independientes. Agregar una funcionalidad nueva es crear un módulo nuevo, no tocar los existentes. Tres reglas:

1. **Contratos compartidos con tipado end-to-end** (Zod en `packages/contracts`): cambiar un campo marca en el compilador todo lo que hay que actualizar.
2. **Evolución del esquema por migraciones** (Prisma), no por un motor de entidades genérico. Un campo nuevo es migración + contrato.
3. **Campos personalizados como mecanismo aparte** (JSONB + tabla de definiciones), solo si un administrador debe crear campos sin deploy. Nunca modelo EAV.

Ya descartado, no reabrir sin motivo nuevo: Drizzle, Directus/BaaS, Next.js, microservicios, colas, CQRS/event sourcing, MongoDB, EAV, motor de entidades dinámico. El porqué está en `docs/architecture.md`.
