# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado del repositorio

Este repositorio todavía **no tiene código**: solo contiene `STACK.md` (fuente única de verdad sobre arquitectura y stack) y `README.md` (resumen derivado de `STACK.md`). El monorepo descrito abajo aún no está armado — es el plan a seguir cuando se empiece a construir. No inventes comandos de build/lint/test: no existen todavía porque no hay `package.json`, workspaces ni herramientas configuradas. Antes de asumir que algo existe (un script, una carpeta, una dependencia), verificalo con `ls`/`find`, no lo des por hecho a partir de este archivo.

Cuando se arme el esqueleto inicial, actualizá esta sección con los comandos reales (`pnpm install`, `turbo build`, `turbo test --filter=...`, etc.).

## Decisión de arquitectura

Monolito modular en un monorepo (backend + frontend + base de datos, todo con Docker). Una sola API y un solo frontend, organizados internamente por módulos de negocio independientes — nada de microservicios. Agregar una funcionalidad nueva es crear un módulo nuevo, no tocar los existentes.

Todavía no hay dominios de negocio definidos más allá de **registro y autenticación de usuarios** (`auth`/`users`/`organizations`/`groups`). El resto de los módulos se agregan sobre la marcha a medida que avanza el desarrollo.

Tres reglas sostienen la arquitectura:

1. **Contratos compartidos con tipado end-to-end** (esquemas Zod en `packages/contracts`): cambiar un campo marca en el compilador todo lo que hay que actualizar, en backend y frontend.
2. **Evolución del esquema por migraciones** (Prisma), no por un motor de entidades genérico.
3. **Campos personalizados como mecanismo aparte** (JSONB + tabla de definiciones), solo para cuando un administrador necesite crear campos sin pasar por un deploy — nunca modelo EAV.

## Stack elegido

| Capa | Elección |
|---|---|
| Gestor de paquetes | `pnpm` workspaces |
| Orquestador de monorepo | Turborepo |
| Lenguaje | TypeScript en modo `strict`, Node LTS (22/24) |
| Backend | NestJS |
| Contratos de API | oRPC + Zod (paquete `packages/contracts`) |
| Base de datos | PostgreSQL |
| ORM | Prisma (versión mayor fijada explícitamente, nunca `latest`) |
| Autenticación y usuarios/grupos | Better Auth (plugin `organization`) |
| Frontend | Vite + React (SPA) |
| Routing / estado de servidor / tablas | TanStack Router + TanStack Query + TanStack Table |
| Formularios | react-hook-form + los mismos esquemas Zod de `contracts` |
| UI | Tailwind CSS + shadcn/ui |
| Calidad | Biome (lint + formato) |
| Tests | Vitest + Playwright |
| Infraestructura | Docker Compose (postgres + api + web) |
| CI | GitHub Actions, ejecutando solo lo afectado con `turbo --filter` |

Decisiones descartadas explícitamente (no reabrir sin motivo nuevo): Drizzle (a mitad de transición mayor al decidir), Directus/BaaS como núcleo (cede control del modelo de datos), Next.js (app interna sin necesidad de SEO/SSR — si hiciera falta, el paso natural es TanStack Start), microservicios, colas, CQRS/event sourcing, MongoDB, modelo EAV, motor de entidades dinámico genérico.

## Estructura del monorepo (planeada)

```text
apps/
  api/                    # NestJS
  web/                    # Vite + React + TanStack
packages/
  contracts/              # oRPC + Zod: fuente de verdad de la API
  db/                     # schema.prisma, migraciones, cliente generado
  config/                 # tsconfig base, biome.json
  ui/                     # componentes compartidos (cuando haya más de una app)
docker-compose.yml
```

### `apps/api` (NestJS)

Un módulo por dominio de negocio, autocontenido: controla sus propias entidades, permisos y casos de uso, sin depender de los internos de otro módulo.

Reglas del módulo:
- El controller (o router oRPC) solo orquesta: valida con el esquema de `packages/contracts`, delega en el service.
- El service contiene la lógica de negocio y llama al repository; **nunca** importa Prisma directamente en el controller.
- El repository es la única capa que conoce Prisma; si cambia el ORM, el resto del módulo no se entera.
- Los permisos se resuelven con guards a nivel de módulo o de endpoint, **nunca** dentro del service.

### `apps/web` (Vite + React + TanStack)

Organización por *feature*, no por tipo de archivo: todo lo relacionado a un mismo dominio vive junto (`auth` es la única feature garantizada desde el inicio).

Reglas del feature:
- Cada carpeta de `features/<dominio>` expone hooks (`useTickets`, `useCreateTicket`) que envuelven el cliente oRPC + TanStack Query; las rutas y componentes de layout **nunca** llaman al cliente oRPC directamente.
- `routes/` solo compone: arma la página combinando hooks y componentes de `features/`; no contiene lógica de negocio ni fetching manual.
- `components/ui` no conoce el dominio (primitivos de shadcn); `features/*/components` sí.

## Cómo crecen los campos y las tablas

**Nivel 1 (uso habitual):** migración en `packages/db/schema.prisma` (`prisma migrate dev`) + campo agregado en el esquema Zod de `packages/contracts`. El compilador marca en `apps/api` y `apps/web` todo lo que quedó desactualizado.

**Nivel 2 (solo si un administrador debe crear campos sin deploy):** tabla `custom_field_definitions` + columna `customValues JSONB` en la entidad; el backend arma el Zod en runtime a partir de las definiciones y el frontend dibuja el formulario desde las mismas definiciones. Índices GIN para filtrar por esos valores.

Las relaciones importantes entre entidades **no van como IDs dentro de JSONB**: se modelan como relaciones reales de Postgres vía migración.

Auditoría: módulo `audit` polimórfico (`entityType`, `entityId`, `actorId`, `action`, `payload JSONB`, `createdAt`), reutilizable por cualquier módulo futuro.

## Referencia completa

`STACK.md` es la fuente única de verdad y contiene además el razonamiento detrás de cada elección del stack (por qué NestJS y no Hono/tRPC, por qué oRPC y no REST+Orval, etc.). Consultalo ante cualquier duda de arquitectura antes de decidir algo distinto a lo documentado acá.
