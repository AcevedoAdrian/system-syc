# system-syc

Monolito modular en un monorepo (backend + frontend + base de datos), corriendo con Docker. La documentación completa de la decisión y el razonamiento detrás del stack vive en [`STACK.md`](./STACK.md).

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
| Autenticación y usuarios/grupos | Better Auth (plugin `organization`) |
| Frontend | Vite + React (SPA) |
| Routing / estado de servidor / tablas | TanStack Router + TanStack Query + TanStack Table |
| Formularios | react-hook-form + los mismos esquemas Zod de `contracts` |
| UI | Tailwind CSS + shadcn/ui |
| Calidad | Biome (lint + formato) |
| Tests | Vitest + Playwright |
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
docker-compose.yml
```

### `apps/api` (NestJS)

Un módulo por dominio de negocio, autocontenido (entidades, permisos y casos de uso propios). Los únicos módulos garantizados desde el inicio son `auth`, `organizations`, `users` y `groups`.

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
      custom-fields/             # solo si hace falta (ver "Cómo crecen los campos" en STACK.md)
  test/                          # e2e (Playwright/Supertest)
```

### `apps/web` (Vite + React + TanStack)

Organización por *feature*, no por tipo de archivo. `auth` es la única feature garantizada desde el inicio.

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

## Más información

Para el detalle de las decisiones de arquitectura (por qué este stack y no otras variantes), cómo crecen los campos y las tablas, e infraestructura/despliegue, ver [`STACK.md`](./STACK.md).
