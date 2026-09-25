# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repositorio

El esqueleto del monorepo existe (SPEC 01, `specs/01-esqueleto-monorepo.md`). Solo hay un procedimiento de ejemplo, `health.check`, que recorre contracts → api → db → web. **Todavía no hay autenticación ni modelos Prisma** (schema vacío, sin migraciones): eso es SPEC 02. Antes de asumir que algo existe (un script, una carpeta, una dependencia), verificalo con `ls`/`find`.

Paquetes existentes: `apps/api` (`@syc/api`), `apps/web` (`@syc/web`), `packages/contracts` (`@syc/contracts`), `packages/db` (`@syc/db`), `packages/config` (`@syc/config`). `packages/ui` no existe todavía (se crea con la segunda app).

## Documentación

No se carga sola: abrila cuando la tarea lo requiera.

- `docs/prd.md`: producto (qué es el sistema, permisos, modelo del ticket, etapas). Fuente de verdad del producto.
- `docs/architecture.md`: stack, por qué cada elección, estructura y cómo crecen los campos. Fuente de verdad de la tecnología. Consultala antes de decidir algo distinto.
- `specs/`: un SPEC por etapa, escrito antes de implementar.
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

pnpm --filter @syc/db generate            # prisma generate (turbo ya lo corre antes de typecheck/test/build)
pnpm --filter @syc/api test               # tests de un solo paquete
pnpm --filter @syc/web dev                # web fuera de Docker (necesita VITE_API_URL)
pnpm --filter @syc/api dev                # api fuera de Docker (necesita DATABASE_URL, WEB_ORIGIN, NODE_ENV; ver .env.example)
```

El `.env` es opcional con Docker (todas las variables tienen default en `docker-compose.yml`); `.env.example` lista las variables. El CI está en `.github/workflows/ci.yml` y filtra con `turbo --filter="...[origin/<base>]"`.

## Particularidades que no son obvias

- **`turbo.json`**: `typecheck`, `test` y `build` dependen de `^typecheck`; sin eso Turbo da cache hit al cambiar un contrato y no detecta el error en los consumidores.
- **pnpm 11 bloquea scripts de build** por defecto: `allowBuilds` en `pnpm-workspace.yaml` autoriza solo `prisma` y `@prisma/engines`. pnpm también agrega entradas a `minimumReleaseAgeExclude` por su cuenta; es esperable.
- **Versiones exactas** (sin `^`) en todos los `package.json`.
- El `biome.json` de la raíz solo extiende `packages/config/biome.json` (Biome exige una config en la raíz).
- Los paquetes del workspace exportan su fuente `.ts`, sin build propio (detalle del bundle en `apps/api/CLAUDE.md`).

## Arquitectura

Monolito modular en un monorepo: una sola API y un solo frontend, organizados por módulos de negocio independientes. Agregar una funcionalidad nueva es crear un módulo nuevo, no tocar los existentes. Tres reglas:

1. **Contratos compartidos con tipado end-to-end** (Zod en `packages/contracts`): cambiar un campo marca en el compilador todo lo que hay que actualizar.
2. **Evolución del esquema por migraciones** (Prisma), no por un motor de entidades genérico. Un campo nuevo es migración + contrato.
3. **Campos personalizados como mecanismo aparte** (JSONB + tabla de definiciones), solo si un administrador debe crear campos sin deploy. Nunca modelo EAV.

Ya descartado, no reabrir sin motivo nuevo: Drizzle, Directus/BaaS, Next.js, microservicios, colas, CQRS/event sourcing, MongoDB, EAV, motor de entidades dinámico. El porqué está en `docs/architecture.md`.
