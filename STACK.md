# Stack tecnológico — punto de entrada

Este documento es la **fuente única de verdad** sobre qué tecnología usar para construir la aplicación (backend + frontend + base de datos, todo en un monorepo, corriendo con Docker). Reemplaza a `claude.md`, `fable.md`, `gemini.md`, `gpt.md` y `grok.md`, que quedan como historial de las propuestas que se compararon para llegar a esta decisión.

Este documento describe la **arquitectura y el stack**, no el producto. Todavía no hay dominios de negocio definidos: lo único seguro por ahora es que habrá **registro y autenticación de usuarios** (módulo `users`/`auth`). El resto de los módulos (qué entidades, qué reglas de negocio) se van a agregar y definir sobre la marcha a medida que el desarrollo avance; cuando aparezcan, se documentan en otro lugar (o se amplía este archivo), pero no hace falta anticiparlos acá.

## Decisión de fondo

**Monolito modular en un monorepo.** Una sola API y un solo frontend, organizados internamente por módulos de negocio independientes. Agregar una funcionalidad nueva es crear un módulo nuevo, no tocar los existentes. Nada de microservicios: en esta etapa multiplican el costo de cada cambio en vez de reducirlo.

Tres reglas sostienen esa decisión:

1. **Contratos compartidos con tipado end-to-end** (esquemas Zod en un paquete común): cambiar un campo marca en el compilador todo lo que hay que actualizar, en backend y frontend.
2. **Evolución del esquema por migraciones**, no por un motor de entidades genérico. La mayoría de los campos nuevos los agrega el equipo de desarrollo: eso es una migración + un contrato actualizado.
3. **Campos personalizados como mecanismo aparte** (JSONB + tabla de definiciones), solo para cuando un administrador necesite crear campos sin pasar por un deploy.

## Stack elegido

| Capa | Elección |
|---|---|
| Gestor de paquetes | `pnpm` workspaces |
| Orquestador de monorepo | Turborepo |
| Lenguaje | TypeScript en modo `strict`, Node LTS (22/24) |
| Backend | NestJS |
| Contratos de API | oRPC + Zod (paquete `packages/contracts`) |
| Base de datos | PostgreSQL |
| ORM | Prisma (versión mayor fijada explícitamente, no `latest`) |
| Autenticación y usuarios/grupos | Better Auth (plugin `organization`) |
| Frontend | Vite + React (SPA) |
| Routing / estado de servidor / tablas | TanStack Router + TanStack Query + TanStack Table |
| Formularios | react-hook-form + los mismos esquemas Zod de `contracts` |
| UI | Tailwind CSS + shadcn/ui |
| Calidad | Biome (lint + formato) |
| Tests | Vitest + Playwright |
| Infraestructura | Docker Compose (postgres + api + web) |
| CI | GitHub Actions, ejecutando solo lo afectado con `turbo --filter` |

### Por qué este stack y no las variantes propuestas

- **NestJS vs. Hono/tRPC/Fastify puro:** las alternativas livianas obligan a inventar la propia estructura de módulos. Con requerimientos indefinidos, eso deriva en desorden. NestJS trae esa estructura de fábrica (módulos, DI, guards, interceptores).
- **Prisma vs. Drizzle:** Drizzle es una opción válida, pero al momento de decidir estaba a mitad de una transición de versión mayor (API relacional reescrita). No es el momento de apostar un proyecto nuevo a esa transición.
- **oRPC vs. REST clásico + Orval:** oRPC evita el paso de generación de código y da OpenAPI gratis. Si se prefiere máxima estabilidad sobre la pieza más joven del stack, la alternativa de repuesto es REST + `@nestjs/swagger` + cliente generado con `orval` — mismo resultado, un paso extra.
- **Directus (BaaS) — descartado como núcleo:** resolvería la flexibilidad de campos con una UI visual sin deploys, pero cede el control del modelo de datos y de la lógica de negocio a la herramienta. Para un dominio con reglas propias (permisos por grupo, auditoría, relaciones entre entidades) conviene mantener el modelo y las migraciones bajo control directo del equipo. Se descarta como pieza central; no impide evaluarlo puntualmente para paneles internos si en el futuro hiciera falta.
- **Next.js — descartado:** es una app interna detrás de login, sin necesidad de SEO. El SSR solo agrega complejidad. Si algún día hace falta, TanStack Start es el paso natural sobre el mismo router.
- **Microservicios, colas, CQRS/event sourcing, MongoDB, modelo EAV, motor de entidades dinámico genérico — descartados** para esta etapa: todos pagan un costo de complejidad que no se necesita todavía y que se puede introducir más adelante si el volumen o el equipo lo piden.

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
docker-compose.yml
```

### `apps/api` (NestJS)

Un módulo por dominio de negocio. Cada módulo es autocontenido: controla sus propias entidades, permisos y casos de uso, y no depende de los internos de otro módulo. Los únicos módulos garantizados desde el inicio son `auth`, `organizations`, `users` y `groups` (registro y autenticación); el resto (`<dominio>` en el árbol de abajo) es un placeholder de los módulos de negocio que se irán agregando.

```text
apps/api/
  src/
    main.ts                    # bootstrap, validación de env con Zod
    app.module.ts               # importa todos los módulos de dominio
    common/
      guards/                   # AuthGuard, PermissionsGuard (leen sesión de Better Auth)
      interceptors/             # logging, transformación de respuesta
      filters/                  # exception filters
      decorators/                # @CurrentUser(), @RequirePermission()
    config/
      env.schema.ts             # Zod: valida variables de entorno al arrancar
    modules/
      auth/                      # integración Better Auth con Nest
      organizations/
      users/
      groups/
      <dominio>/                 # módulo de negocio (a definir en el desarrollo)
        <dominio>.module.ts
        <dominio>.controller.ts # o router oRPC vía @orpc/nest
        <dominio>.service.ts    # lógica de negocio
        <dominio>.repository.ts # acceso a datos vía Prisma (packages/db)
        <dominio>.service.spec.ts
      audit/                     # servicio inyectable: audit.log(entityType, entityId, action, payload)
      custom-fields/             # solo si hace falta (ver "Cómo crecen los campos")
  test/                          # e2e (Playwright/Supertest)
```

Reglas del módulo:
- El controller (o router oRPC) solo orquesta: valida con el esquema de `packages/contracts`, delega en el service.
- El service contiene la lógica de negocio y llama al repository; nunca importa Prisma directamente en el controller.
- El repository es la única capa que conoce Prisma; si el día de mañana cambia el ORM, el resto del módulo no se entera.
- Los permisos se resuelven con guards a nivel de módulo o de endpoint, nunca dentro del service.

### `apps/web` (Vite + React + TanStack)

Organización por *feature*, no por tipo de archivo: todo lo relacionado a un mismo dominio vive junto. `auth` es la única feature garantizada desde el inicio; `<dominio>` es un placeholder de las features de negocio que se irán agregando.

```text
apps/web/
  src/
    main.tsx
    routes/                     # TanStack Router, file-based
      __root.tsx
      _authenticated/
        <dominio>/
          index.tsx
          $id.tsx
        settings/
      login.tsx
    features/
      <dominio>/
        components/             # componentes propios del dominio
        hooks/                  # use<Dominio>(), useCreate<Dominio>() (TanStack Query + cliente oRPC)
        schemas.ts               # reexporta/extiende Zod de packages/contracts si hace falta algo solo de UI
      auth/
    components/
      ui/                       # shadcn/ui (botón, input, dialog...)
      layout/                   # AppShell, Sidebar, Topbar
    lib/
      orpc-client.ts             # cliente oRPC tipado + integración TanStack Query
      auth-client.ts             # cliente Better Auth
      utils.ts
    stores/                      # estado de UI puro, si hace falta (ej. sidebar colapsado)
  index.html
  vite.config.ts
```

Reglas del feature:
- Cada carpeta de `features/<dominio>` expone hooks (`useTickets`, `useCreateTicket`) que envuelven el cliente oRPC + TanStack Query; las rutas y componentes de layout nunca llaman al cliente oRPC directamente.
- `routes/` solo compone: arma la página combinando hooks y componentes de `features/`; no contiene lógica de negocio ni fetching manual.
- `components/ui` no conoce el dominio (son los primitivos de shadcn); `features/*/components` sí.

## Cómo crecen los campos y las tablas

**Nivel 1 (uso habitual): migración + contrato.**

1. En `packages/db/schema.prisma` se agrega el campo o modelo y se corre `prisma migrate dev`.
2. En `packages/contracts` se agrega el campo al esquema Zod correspondiente.
3. El compilador marca en `apps/api` y `apps/web` todo lo que quedó desactualizado.

**Nivel 2 (solo si un administrador debe crear campos sin deploy):** tabla `custom_field_definitions` (`entityType`, `key`, `label`, `dataType`, `required`, `options`, `sortOrder`) + columna `customValues JSONB` en la entidad. El backend arma el Zod en runtime a partir de las definiciones, el frontend dibuja el formulario desde las mismas definiciones, e índices GIN permiten filtrar por esos valores. Se evita el modelo EAV (una fila por valor) desde el día uno.

Las relaciones importantes entre entidades **no van como IDs dentro de JSONB**: se modelan como relaciones reales de Postgres vía migración.

**Seguimiento/auditoría:** un módulo `audit` polimórfico (`entityType`, `entityId`, `actorId`, `action`, `payload JSONB`, `createdAt`) que registra cambios de estado y ediciones, reutilizable por cualquier módulo futuro.

## Infraestructura y despliegue

- `docker-compose.yml` en la raíz levanta Postgres, la API y el frontend con un solo comando, tanto en desarrollo como en el servidor de destino.
- Variables de entorno validadas con Zod al arrancar cada servicio.
- Versiones mayores de dependencias en transición (Prisma, Drizzle si se reconsiderara, etc.) se fijan explícitamente en `package.json`, nunca en `latest`.

## Próximo paso

Armar el esqueleto del monorepo con estas piezas cableadas: autenticación con usuarios y grupos (lo único definido por ahora), migración inicial y `docker-compose.yml`. Los módulos de negocio concretos se agregan después, uno por uno, a medida que se definan.
