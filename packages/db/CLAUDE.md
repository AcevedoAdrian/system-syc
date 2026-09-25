# packages/db (Prisma)

## Particularidades

- **Prisma 7.10** (no `latest`, que hoy es un RC de la 8): requiere `prisma.config.ts`, el generator `prisma-client` y el adapter `pg`.
- El cliente generado (`src/generated/prisma`) está en `.gitignore`. Se regenera con `pnpm --filter @syc/db generate`; turbo ya lo corre antes de typecheck, test y build.
- El paquete exporta su fuente `.ts`, sin build propio.

## Migraciones

- Un campo o modelo nuevo se agrega en `schema.prisma` y se aplica con `prisma migrate dev`. Después se agrega el campo al esquema Zod de `packages/contracts`; el compilador marca lo que queda desactualizado en `apps/api` y `apps/web`.
- Las relaciones importantes entre entidades son **relaciones reales de Postgres** vía migración, nunca IDs dentro de JSONB.
