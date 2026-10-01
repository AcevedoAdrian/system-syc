# SPEC 01 — Esqueleto del monorepo

> **Status:** Approved 
> **Depends on:** ninguna
> **Date:** 2026-09-23
> **Objective:** Armar un monorepo pnpm + Turborepo ejecutable con `docker compose up`, donde la web muestra el resultado de un procedimiento oRPC `health.check` implementado en NestJS que consulta Postgres vía Prisma.

## Por qué existe este spec

`docs/architecture.md` define el stack pero el repositorio no tiene código. Su "Próximo paso" mezcla el esqueleto con autenticación, usuarios/grupos y migración inicial. Este spec cubre **solo el esqueleto**: prueba que todas las piezas del stack están cableadas de punta a punta antes de agregar dominio. Autenticación queda para SPEC 02.

## Alcance

**Dentro:**

- Raíz del monorepo: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`, `.nvmrc`.
- `packages/config`: `tsconfig.base.json` (strict) y `biome.json` compartidos.
- `packages/contracts`: esquemas Zod y contrato oRPC con un único procedimiento `health.check`.
- `packages/db`: `schema.prisma` sin modelos (solo `datasource` y `generator`) y cliente Prisma generado, exportado como singleton.
- `apps/api`: NestJS con validación de env por Zod, `AuthGuard` **no** incluido, un módulo `health` con controller oRPC (`@orpc/nest`), service y repository.
- `apps/web`: Vite + React + TanStack Router (file-based) + TanStack Query + Tailwind + shadcn/ui inicializado; una ruta `/` que muestra el estado devuelto por `health.check`.
- `docker-compose.yml` para desarrollo con hot reload: `postgres`, `api`, `web`.
- Biome (lint + formato) y scripts `turbo` de `lint`, `typecheck`, `test`, `build`.
- Vitest con un test trivial por cada app (`api` y `web`).
- `.github/workflows/ci.yml` con `turbo --filter` sobre lo afectado.
- Actualizar la sección "Estado del repositorio" de `CLAUDE.md` con los comandos reales.

**Fuera de alcance (para specs futuros):**

- Autenticación, Better Auth, módulos `auth`, `users`, `organizations`, `groups` (SPEC 02).
- Cualquier modelo Prisma y migración (el schema queda vacío).
- `packages/ui` (se crea cuando haya una segunda app).
- Playwright y tests e2e.
- Dockerfiles de producción / despliegue.
- `git init`, remoto y primer push (los hace el usuario).
- Módulos `audit` y `custom-fields`.
- TanStack Table y react-hook-form (se instalan cuando exista el primer formulario o tabla).

## Modelo de datos

Este spec no introduce entidades de base de datos: `schema.prisma` no tiene modelos. Las únicas estructuras son el contrato de `health` y el esquema de entorno.

```ts
// packages/contracts/src/health.ts
export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  timestamp: z.string().datetime(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;

// contrato oRPC: health.check (sin input) -> healthStatusSchema
```

```ts
// apps/api/src/config/env.schema.ts
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  API_PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
});
```

Convenciones:

- `health.check` responde `status: "ok"` si `SELECT 1` funciona; si falla responde `status: "degraded"` y `database: "down"` (no lanza error).
- `apps/web` lee la URL de la API de `VITE_API_URL`, validada con Zod al arrancar.
- Los paquetes internos se llaman `@syc/config`, `@syc/contracts`, `@syc/db`, `@syc/api`, `@syc/web`.
- Puertos por defecto: web `5173`, api `3000`, postgres `5432`.

## Plan de implementación

1. Crear la raíz: `package.json` (con `packageManager` de pnpm y `engines.node` 22 o superior), `pnpm-workspace.yaml`, `turbo.json` con tareas vacías, `.gitignore`, `.nvmrc`. Verificar: `pnpm install` corre sin errores.
2. Crear `packages/config` con `tsconfig.base.json` (strict) y `biome.json`; agregar `biome` a la raíz con scripts `lint` y `format`. Verificar: `pnpm lint` pasa sobre el repo.
3. Crear `packages/db` con `schema.prisma` vacío, Prisma con versión mayor fijada, script `generate` y export del cliente. Verificar: `pnpm --filter @syc/db generate` termina bien.
4. Crear `packages/contracts` con `healthStatusSchema` y el contrato `health.check`. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
5. Crear `apps/api` mínima: `main.ts`, `app.module.ts`, `config/env.schema.ts` que falla al arrancar con env inválida. Verificar: `pnpm --filter @syc/api dev` arranca con `.env` válido y aborta con mensaje claro sin `DATABASE_URL`.
6. Agregar el módulo `health` en `apps/api` (module, router oRPC, service, repository con `SELECT 1`) y CORS con `WEB_ORIGIN`. Verificar: `curl` al endpoint de `health.check` devuelve `status: "ok"` con Postgres levantado.
7. Crear `apps/web` mínima: Vite + React + TanStack Router file-based con `routes/__root.tsx` e `index.tsx`, Tailwind y shadcn/ui inicializado. Verificar: `pnpm --filter @syc/web dev` muestra la página vacía.
8. Cablear el cliente: `lib/orpc-client.ts` + TanStack Query, `features/health/hooks/useHealth.ts` y la ruta `/` que lo consume mediante el hook. Verificar: la página muestra `ok` / `up` con la API y Postgres corriendo.
9. Agregar `docker-compose.yml` (postgres con healthcheck, api y web con volúmenes y watch) y `.env.example`. Verificar: `docker compose up` desde cero deja la web mostrando `ok`.
10. Agregar Vitest con un test trivial en `apps/api` (el service de `health` con el repository mockeado) y otro en `apps/web` (render de la página con el hook mockeado). Verificar: `pnpm test` pasa.
11. Completar las tareas `lint`, `typecheck`, `test` y `build` en `turbo.json` y agregar `.github/workflows/ci.yml` con `turbo --filter=...[origin/main]`. Verificar: los cuatro comandos corren en local con `pnpm turbo <tarea>`.
12. Actualizar `CLAUDE.md` (sección "Estado del repositorio") con los comandos reales y los paquetes existentes.

## Criterios de aceptación

- [X] `pnpm install` en un checkout limpio termina sin errores ni advertencias de peer dependencies.
- [X] `pnpm turbo lint typecheck test build` termina con código 0.
- [X] `docker compose up` desde cero levanta `postgres`, `api` y `web` sin intervención manual.
- [X] `http://localhost:5173/` muestra el estado `ok` y la base `up`.
- [X] Con `docker compose stop postgres`, recargar la web muestra `degraded` y la base `down`, sin error de red.
- [ ] Arrancar la API sin `DATABASE_URL` aborta el proceso con un mensaje que nombra la variable faltante.
- [ ] Cambiar el campo `status` en `healthStatusSchema` produce un error de `typecheck` en `apps/api` y en `apps/web`.
- [ ] Editar un archivo de `apps/api/src` o `apps/web/src` con el compose corriendo recarga el servicio sin reiniciar el contenedor.
- [ ] `apps/api` no importa `@prisma/client` ni `@syc/db` fuera de `*.repository.ts`. Excepción acotada (SPEC 02): `modules/auth/auth.config.ts`, la raíz de composición de Better Auth, que arma su adapter Prisma.
- [ ] Las rutas y componentes de `apps/web` no importan el cliente oRPC; solo lo hacen los hooks de `features/`.
- [ ] `tsconfig.base.json` tiene `"strict": true` y todos los paquetes lo extienden.
- [ ] La versión mayor de Prisma está fijada en `package.json` sin `latest` ni `^` sobre otra mayor.
- [ ] `.github/workflows/ci.yml` existe y su sintaxis es YAML válido.
- [ ] `CLAUDE.md` lista los comandos reales y ninguno de ellos falla al ejecutarse.

## Decisiones

- **Sí:** dividir el "Próximo paso" de `docs/architecture.md` y dejar auth para SPEC 02. Un spec que toca esqueleto, auth y migraciones tiene demasiadas áreas para verificarse de una vez.
- **Sí:** `health.check` con oRPC y consulta a Postgres. Recorre contracts, api, db y web sin inventar dominio.
- **Sí:** `packages/contracts` y `packages/db` en este spec. Sin ellos el `health` end-to-end no existe; se descartó la opción "solo api, web y config" por esa contradicción.
- **No:** `packages/ui`. `docs/architecture.md` dice que se crea cuando haya más de una app; shadcn vive en `apps/web/src/components/ui`.
- **Sí:** schema Prisma vacío, sin migraciones. Evita un modelo dummy que haya que borrar; la primera migración real llega con Better Auth.
- **No:** Playwright. Se agrega cuando exista un flujo de usuario que valga la pena cubrir.
- **Sí:** GitHub Actions escrito pero sin `git init`. El CI no se puede verificar en local; se valida al empujar el repo.
- **Sí:** compose de desarrollo con hot reload. Los Dockerfiles de producción se difieren para no diseñar el despliegue sin una app real.
- **Sí:** `health` degradado devuelve 200 con `degraded`, no un error. Permite a la web mostrar el estado de la base sin tratarlo como falla de red.
- **Sí:** puertos por defecto 5173 / 3000 / 5432 y prefijo `@syc/` para los paquetes. Valores convencionales, cambiables sin impacto.
- **No:** reabrir las decisiones ya descartadas en `docs/architecture.md` (Drizzle, Next.js, Directus, microservicios, etc.).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `prisma generate` con schema sin modelos falla o avisa en la versión elegida | Verificar en el paso 3; si falla, dejar el `datasource`/`generator` y usar `$queryRaw` con el cliente generado, o documentar el motivo en una decisión nueva antes de seguir. |
| `@orpc/nest` es la pieza más joven del stack y puede tener fricción con Nest | El alcance es un solo procedimiento; si falla, la alternativa documentada en `docs/architecture.md` es REST + `@nestjs/swagger` + `orval`, y se reabre la decisión con justificación. |
| Hot reload dentro de Docker es lento o no detecta cambios en volúmenes | Usar `docker compose watch` o polling en Vite; verificado por el criterio de recarga. |
| El monorepo monta `node_modules` de pnpm en contenedores con symlinks rotos | Instalar dentro del contenedor y no montar `node_modules` del host. |
| El CI no se puede probar sin repo remoto | Las mismas tareas `pnpm turbo ...` corren en local; el workflow solo las invoca. |

## Qué **no** está en este spec

- Autenticación, usuarios, grupos y organizaciones (SPEC 02).
- Modelos y migraciones de Prisma.
- `packages/ui`.
- Playwright y tests e2e.
- Dockerfiles de producción y despliegue.
- `git init`, repo remoto y push.
- Módulos `audit` y `custom-fields`.

Cada uno de esos puntos, si se aborda, va en su propio spec.
