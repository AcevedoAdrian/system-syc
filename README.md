# system-syc

Sistema de gestión interna y seguimiento de tickets, construido como monolito modular en un monorepo (backend + frontend + base de datos) y ejecutado con Docker.

## Documentación

- [`docs/prd.md`](./docs/prd.md): qué es el sistema, usuarios y permisos, modelo del ticket y etapas de desarrollo.
- [`docs/architecture.md`](./docs/architecture.md): stack, por qué cada elección, estructura de `apps/api` y `apps/web`, y cómo crecen los campos y las tablas.
- [`docs/despliegue.md`](./docs/despliegue.md): cómo poner el sistema en el servidor (primer deploy, deploy regular, vuelta atrás) y operar los backups.
- [`docs/checklist-permisos.md`](./docs/checklist-permisos.md): la matriz de permisos para recorrer a mano contra el servidor, con el registro de corridas.
- [`specs/`](./specs/): un SPEC por etapa de desarrollo.

## Tecnología utilizada

| Capa | Elección |
|---|---|
| Gestor de paquetes | `pnpm` workspaces |
| Orquestador de monorepo | Turborepo |
| Lenguaje | TypeScript en modo `strict`, Node LTS (22/24) |
| Backend | NestJS |
| Contratos de API | oRPC + Zod (paquete `packages/contracts`) |
| Base de datos | PostgreSQL |
| ORM | Prisma (versión mayor fijada explícitamente, no `latest`) |
| Autenticación y departamentos | Better Auth (plugins `organization` y `admin`) |
| Frontend | Vite + React (SPA) |
| Routing / estado de servidor / tablas | TanStack Router + TanStack Query + TanStack Table |
| Formularios | react-hook-form + los mismos esquemas Zod de `contracts` |
| UI | Tailwind CSS + shadcn/ui |
| Calidad | Biome (lint + formato) |
| Tests | Vitest (Playwright pendiente) |
| Infraestructura | Docker Compose (postgres + api + web); en producción, Nginx como única entrada y un contenedor de backup |
| CI | GitHub Actions, ejecutando solo lo afectado con `turbo --filter` |

## Estructura del monorepo

```text
apps/
  api/                    # NestJS
  web/                    # Vite + React + TanStack
packages/
  contracts/              # oRPC + Zod: fuente de verdad de la API
  db/                     # schema.prisma, migraciones, cliente generado
  config/                 # tsconfig base, biome.json
  ui/                     # componentes compartidos (cuando haya más de una app)
bruno/                    # colección Bruno: peticiones HTTP de la API
docs/                     # PRD, arquitectura, despliegue y checklist de permisos
specs/                    # un SPEC por etapa
docker/                   # Dockerfile.dev y el contenedor de backup (docker/backup/)
docker-compose.yml        # desarrollo
docker-compose.prod.yml   # producción (servidor on-premise)
```

## Cómo levantarlo

Requisitos: Node 22, pnpm 11 y Docker.

```bash
pnpm install
docker compose up         # web :5173, api :3000, postgres :5432
```

El `.env` es opcional con Docker; `.env.example` lista las variables.

Para el servidor, usá `docker-compose.prod.yml` y seguí [`docs/despliegue.md`](./docs/despliegue.md); las variables salen de `.env.production.example`.

## Base de datos de desarrollo

### Primera vez

La base arranca vacía: ni las migraciones ni el seed corren solos.

1. Creá el `.env` en la raíz a partir de `.env.example` y descomentá y completá `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` y `SEED_ADMIN_NAME`.
2. Levantá el stack con `docker compose up` y dejalo corriendo. Los pasos siguientes van en otra terminal, parado en la raíz del repo.
3. Aplicá las migraciones:
   ```bash
   docker compose exec api pnpm --filter @syc/db exec prisma migrate deploy
   ```
   Tiene que terminar con `All migrations have been successfully applied`.
4. Cargá el seed:
   ```bash
   docker compose exec api pnpm --filter @syc/api seed
   ```
   Crea el admin raíz, los 4 departamentos, los 7 estados y las 4 prioridades. Es idempotente.
5. Entrá a http://localhost:5173 con el usuario y la contraseña del paso 1.

### Volver a la base vacía (para probar de nuevo)

Borra **todos los datos de desarrollo**: tickets, comentarios, usuarios, catálogos y auditoría.

1. Con el stack levantado (`docker compose up`), abrí otra terminal en la raíz del repo.
2. Borrá y recreá la base con todas las migraciones aplicadas:
   ```bash
   docker compose exec api pnpm --filter @syc/db exec prisma migrate reset --force
   ```
   `--force` saltea la confirmación. Tiene que terminar con `All migrations have been successfully applied`.
3. Cargá el seed de nuevo (el reset no lo corre solo):
   ```bash
   docker compose exec api pnpm --filter @syc/api seed
   ```
4. En el navegador, recargá la página: la sesión anterior ya no existe. Entrá con el admin del seed.
5. Comprobá que quedó vacía: `/tickets` sin tickets, `/admin/departamentos` con los 4 departamentos y `/admin/catalogos` con los 7 estados y las 4 prioridades.

**Si el paso 2 falla** (la base quedó rota o el contenedor no arranca), reemplazá los pasos 1 y 2 por:

1. `docker compose down`
2. `docker volume rm system-syc_postgres_data`
3. `docker compose up`
4. Seguí con los pasos 3 a 5 de "Primera vez".

Avisos:

- **No uses `docker compose down -v`**: borra también los volúmenes de `node_modules` y el store de pnpm, y el siguiente `up` reinstala todo.
- Esto es solo para desarrollo. La base de producción se maneja con [`docs/despliegue.md`](./docs/despliegue.md) (backup y `restore.sh`).
- `pnpm verify` no necesita esto: usa su propia base temporal y no toca la de desarrollo.

## Peticiones a la API

Las peticiones HTTP están en [`bruno/`](./bruno/). En Bruno: Open Collection sobre la carpeta `bruno/`, activá el entorno `local` (URL en `environments/local.bru`) y cargá el valor secreto `adminPassword`, la contraseña del admin del seed. Incluye `health`, `auth` (login, sesión, cambio de contraseña, logout), `users`, `organizations`, `catalogs` y `tickets`. Corré `auth.signIn` primero.
