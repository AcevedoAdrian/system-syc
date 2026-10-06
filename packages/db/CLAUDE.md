# packages/db (Prisma)

## Particularidades

- **Prisma 7.10** (no `latest`, que hoy es un RC de la 8): requiere `prisma.config.ts`, el generator `prisma-client` y el adapter `pg`.
- El cliente generado (`src/generated/prisma`) está en `.gitignore`. Se regenera con `pnpm --filter @syc/db generate`; turbo ya lo corre antes de typecheck, test y build.
- El paquete exporta su fuente `.ts`, sin build propio.

## Migraciones

- Un campo o modelo nuevo se agrega en `schema.prisma` y se aplica con `prisma migrate dev`. Después se agrega el campo al esquema Zod de `packages/contracts`; el compilador marca lo que queda desactualizado en `apps/api` y `apps/web`.
- **Nombres en la base**: todo modelo propio lleva `@@map("snake_case")` (p. ej. `AuditLog` → `audit_log`), para no tener que citar el nombre con comillas en SQL a mano. Las columnas quedan en camelCase (el default de Prisma), igual que en las tablas de Better Auth, que conservan los nombres que esa librería espera (`user`, `rateLimit`…).
- **Índices únicos parciales de los catálogos**: Prisma no los expresa en `@@unique` (sin preview), así que los 7 `CREATE UNIQUE INDEX ... WHERE "deletedAt" IS NULL` sobre `nombreNormalizado` viven escritos a mano en el SQL de la migración `catalogos` (con su comentario). Prisma no los conoce: si un `migrate dev` futuro propone un `DROP INDEX` sobre ellos, se quita de esa migración. Un catálogo nuevo suma el suyo del mismo modo.
- **`Ticket`** (migración `tickets`): `numero` es `Int @unique @default(autoincrement())`, que en Postgres es `SERIAL` y crea la secuencia `ticket_numero_seq` (una secuencia nativa, no una tabla con lock: atómica y con huecos tolerados). La referencia externa es única por proveedor solo entre los no eliminados: el índice `ticket_proveedorId_referenciaExterna_key` (`WHERE "deletedAt" IS NULL AND "referenciaExterna" IS NOT NULL`) también está escrito a mano en el SQL de la migración, con la misma salvedad. Las fechas (`fechaRecepcion`, `fechaCierre`, `fechaReabierto`) son `@db.Date`: un día sin hora. Todas las FK de `Ticket` son `Restrict`.
- **`TicketComentario`** (migración `comentarios`): tabla `ticket_comentario` con los campos base completos (`updatedAt` y `updatedBy` incluidos, aunque solo cambian al eliminarlo: no hay edición) y `deletedAt`. La FK al ticket es `Restrict`, como las demás. El índice `@@index([ticketId, createdAt])` sirve a la lectura en orden.
- **Extensión `unaccent`**: la migración `comentarios` empieza con `CREATE EXTENSION IF NOT EXISTS unaccent;`, escrito a mano (Prisma no lo expresa). Lo usa la búsqueda de texto de la bandeja (`lower(unaccent(texto))`). Es una extensión *trusted* desde Postgres 13 y viene en la imagen `postgres:17-alpine`: no exige superusuario, solo permiso `CREATE` en la base. No admite un índice funcional directo (no es `IMMUTABLE`); con el volumen esperado alcanza un recorrido secuencial.
- Las relaciones importantes entre entidades son **relaciones reales de Postgres** vía migración, nunca IDs dentro de JSONB.
