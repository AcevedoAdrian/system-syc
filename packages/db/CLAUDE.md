# packages/db (Prisma)

## Particularidades

- **Prisma 7.10** (no `latest`, que hoy es un RC de la 8): requiere `prisma.config.ts`, el generator `prisma-client` y el adapter `pg`.
- El cliente generado (`src/generated/prisma`) está en `.gitignore`. Se regenera con `pnpm --filter @syc/db generate`; turbo ya lo corre antes de typecheck, test y build.
- El paquete exporta su fuente `.ts`, sin build propio.

## Migraciones

- Un campo o modelo nuevo se agrega en `schema.prisma` y se aplica con `prisma migrate dev`. Después se agrega el campo al esquema Zod de `packages/contracts`; el compilador marca lo que queda desactualizado en `apps/api` y `apps/web`.
- **Nombres en la base**: todo modelo propio lleva `@@map("snake_case")` (p. ej. `AuditLog` → `audit_log`), para no tener que citar el nombre con comillas en SQL a mano. Las columnas quedan en camelCase (el default de Prisma), igual que en las tablas de Better Auth, que conservan los nombres que esa librería espera (`user`, `rateLimit`…).
- Las relaciones importantes entre entidades son **relaciones reales de Postgres** vía migración, nunca IDs dentro de JSONB.
