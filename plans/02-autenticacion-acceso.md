# Plan: implementar SPEC 02 — Autenticación y acceso

## Contexto

`specs/02-autenticacion-acceso.md` está en estado **Approved**. Corresponde a la etapa 1 del PRD: Better Auth (plugins `username`, `organization`, `admin`) cableado en API y web, seed del admin raíz y de los 4 departamentos, ABM de departamentos y usuarios por oRPC, y un portero central de permisos. Hoy el repo es solo el esqueleto de SPEC 01: un procedimiento `health.check`, el schema Prisma vacío y sin auth.

El usuario eligió **seguir con los cambios sin commitear**: el spec modificado (`M specs/02-autenticacion-acceso.md`) pasa a la rama nueva tal como está.

## Fase 3 — Rama

1. `git checkout -b spec-02-autenticacion-acceso`. La rama no existe todavía y `AutoCreateBranch` es `true`.
2. Confirmar que la rama quedó activa y mostrar el bloque "✅ Ready to implement" con el estado `Approved`.
3. Mostrar el resumen del spec: objetivo, alcance, plan de 13 pasos y criterios de aceptación.

## Fase 4 — Implementación paso a paso

**Reglas de trabajo:**
- Hago un paso por vez, muestro qué archivos cambié y espero confirmación antes del siguiente.
- No hago ningún commit.
- Si aparece una ambigüedad, me detengo y propongo opciones.
- Las versiones van exactas, sin `^`.

| Paso | Archivos principales | Verificación |
|---|---|---|
| 1. Deps + env | `apps/api/package.json` (`better-auth`, `@better-auth/cli`, con la versión exacta vigente consultada con `pnpm view`), `apps/api/src/config/env.schema.ts`, `.env.example`, `docker-compose.yml` | La API arranca; sin `BETTER_AUTH_SECRET` aborta y la nombra |
| 2. Config Better Auth + migración | `apps/api/src/modules/auth/auth.config.ts` (adapter Prisma con `getPrismaClient` de `packages/db/src/index.ts`, plugins, `rateLimit` en base, sesión 12h/1h, `cookieCache` off, `useSecureCookies: false`, contraseña 8–128), `packages/db/schema.prisma` generado con el CLI, `packages/db/migrations/*` | `prisma migrate dev` aplica sobre una base vacía; `pnpm --filter @syc/db generate` pasa |
| 3. Montar en Nest | `apps/api/src/main.ts` (`bodyParser: false`, handler `toNodeHandler` en `/api/auth/*` con allowlist `sign-in/username`, `sign-out`, `get-session`, `change-password` y 404 para el resto; luego `express.json()`; CORS con `credentials` + `trustedOrigins`), `modules/auth/auth.module.ts` | curl: `get-session` devuelve null; `admin/create-user` y `sign-up/email` devuelven 404; `/health` responde ok |
| 4. Seed | `apps/api/src/seed.ts` (schema Zod propio, `auth.$context` para el hash, idempotente), script `seed` | Corrido 2 veces no duplica; sin variables aborta y las nombra; login por curl devuelve cookie |
| 5. AuthGuard + `@Public()` + `@CurrentUser()` | `apps/api/src/common/guards/auth.guard.ts`, `common/decorators/*`, `health` marcado público, `users.me` mínimo | `users.me` sin cookie da 401 y con cookie devuelve el admin |
| 6. Contratos | `packages/contracts/src/{auth,users,organizations}.ts` + `index.ts` | `pnpm --filter @syc/contracts typecheck` pasa; la API marca lo que falta implementar |
| 7. organizations | `apps/api/src/modules/organizations/*` (controller, service, repository, module). Antes verifico cómo maneja la versión fijada el `Member` del creador (Riesgos) | Casos del spec: "Soporte" ok, "tecnico" da 409, borrar con agentes da 409, borrar vacío funciona |
| 8. users: alta/edición | `apps/api/src/modules/users/*`. Antes verifico la normalización del plugin `username` y si se puede editar (Riesgos) | Agente sin dpto o con dpto inactivo da 400; un cambio de dpto deja 1 `Member` |
| 9. users: estado/contraseñas | `setActive` (ban/unban + revocar sesiones), `resetPassword`, protecciones del último admin y de uno mismo | Ban cierra la sesión y bloquea el login; último admin da 409; el reset no pide la contraseña anterior |
| 10. PermissionsGuard | `common/guards/permissions.guard.ts`, `common/decorators/require-permission.decorator.ts`, `common/permissions.ts` (matriz), endpoint de prueba temporal | Agente contra otro dpto da 403; contra el propio, 200; el admin accede a ambos |
| 11. Web: infraestructura auth | deps (react-hook-form, `@hookform/resolvers`, `@tanstack/react-table`, shadcn), `apps/web/src/lib/auth-client.ts`, `credentials: "include"` en `lib/orpc-client.ts`, `features/auth/*`, `routes/login.tsx`, `routes/_authenticated.tsx` + `_authenticated/index.tsx`, `components/layout/*`, 401 que redirige a `/login` | Sin sesión redirige a `/login`; se puede entrar y salir con el usuario del seed |
| 12. Web: admin y perfil | `features/organizations/*`, `features/users/*`, `routes/_authenticated/admin/{departamentos,usuarios}.tsx`, "Cambiar mi contraseña" | Ciclo completo en la UI como admin; el agente no ve "Administración" y por URL lo redirige |
| 13. Tests + docs | `users.service.spec.ts`, `organizations.service.spec.ts`, `permissions.guard.spec.ts`; `apps/api/CLAUDE.md`, `CLAUDE.md`, `specs/01-*.md`, `docs/prd.md` | `pnpm --filter @syc/api test` y `pnpm turbo lint typecheck test build` terminan con código 0 |

**Lo que se reutiliza:**
- `getPrismaClient` (`packages/db/src/index.ts`).
- `loadEnv`/`ENV` (`apps/api/src/config`).
- El patrón controller `@Implement` + service + repository de `apps/api/src/modules/health/`.
- El patrón de hooks de `apps/web/src/features/health/hooks/useHealth.ts`.
- El patrón de tests con repository mockeado de `health.service.spec.ts`.

## Verificación final

1. Recorrer los criterios de aceptación del spec uno por uno, con curl/Bruno contra `docker compose up` y con la UI en `:5173`.
2. Correr `pnpm turbo lint typecheck test build`.
3. Si todo pasa, decirle al usuario que actualice el estado a "Implemented" y haga el commit final. Yo no commiteo.
