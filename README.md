# system-syc

Sistema de gestión interna y seguimiento de tickets, construido como monolito modular en un monorepo (backend + frontend + base de datos) y ejecutado con Docker.

## Documentación

- [`docs/prd.md`](./docs/prd.md): qué es el sistema, usuarios y permisos, modelo del ticket y etapas de desarrollo.
- [`docs/architecture.md`](./docs/architecture.md): stack, por qué cada elección, estructura de `apps/api` y `apps/web`, y cómo crecen los campos y las tablas.
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
| Infraestructura | Docker Compose (postgres + api + web) |
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
docs/                     # PRD y arquitectura
specs/                    # un SPEC por etapa
docker-compose.yml
```

## Cómo levantarlo

Requisitos: Node 22, pnpm 11 y Docker.

```bash
pnpm install
docker compose up         # web :5173, api :3000, postgres :5432
```

El `.env` es opcional con Docker; `.env.example` lista las variables.

## Peticiones a la API

Las peticiones HTTP están en [`bruno/`](./bruno/). En Bruno: Open Collection sobre la carpeta `bruno/`, activá el entorno `local` (URL en `environments/local.bru`) y cargá el valor secreto `adminPassword`, la contraseña del admin del seed. Incluye `health`, `auth` (login, sesión, cambio de contraseña, logout), `users`, `organizations`, `catalogs` y `tickets`. Corré `auth.signIn` primero.
