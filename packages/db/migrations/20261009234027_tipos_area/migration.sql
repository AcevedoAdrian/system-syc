-- SPEC 08: tipos de área. Orden de los pasos (el de Prisma se reordenó a mano para poder migrar datos):
-- 1) crea tipo_area y su índice único parcial; 2) si hay áreas, crea el tipo «Otro»;
-- 3) agrega area.tipoId nullable, lo completa con «Otro» y lo pasa a NOT NULL con su FK;
-- 4) reemplaza el índice único de area por uno compuesto (tipoId, nombreNormalizado).

-- CreateTable
CREATE TABLE "tipo_area" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tipo_area_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tipo_area" ADD CONSTRAINT "tipo_area_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipo_area" ADD CONSTRAINT "tipo_area_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único parcial (como los de SPEC 04): el nombre normalizado es único solo entre los tipos no
-- eliminados. Prisma no lo expresa en `@@unique`; si un `migrate dev` futuro propone un DROP INDEX
-- sobre este, se quita de esa migración.
CREATE UNIQUE INDEX "tipo_area_nombreNormalizado_key" ON "tipo_area" ("nombreNormalizado") WHERE "deletedAt" IS NULL;

-- Datos: si hay áreas (eliminadas incluidas), crea el tipo «Otro» y se lo asigna a todas. Sobre una
-- base sin áreas no crea nada: los tipos los carga el seed. `createdBy`/`updatedBy` salen del área de
-- menor `orden`, porque la FK a user es obligatoria y en SQL no hay otra forma fiable de elegir un
-- usuario existente. El AuditLog va con actorId null (sistema), como el seed. No se audita cada área
-- reclasificada: el historial de cada área muestra el tipo desde su primer cambio.
INSERT INTO "tipo_area" ("id", "nombre", "nombreNormalizado", "orden", "activo", "updatedAt", "createdBy", "updatedBy")
SELECT gen_random_uuid()::text, 'Otro', 'otro', 1, true, CURRENT_TIMESTAMP, a."createdBy", a."createdBy"
FROM "area" a
ORDER BY a."orden" ASC, a."id" ASC
LIMIT 1;

INSERT INTO "audit_log" ("id", "entityType", "entityId", "actorId", "action", "payload")
SELECT gen_random_uuid()::text, 'TipoArea', t."id", NULL, 'create',
       jsonb_build_object('after', jsonb_build_object('nombre', t."nombre", 'orden', t."orden", 'activo', t."activo"))
FROM "tipo_area" t
WHERE t."nombreNormalizado" = 'otro';

-- AlterTable: tipoId nullable → se completa → NOT NULL
ALTER TABLE "area" ADD COLUMN "tipoId" TEXT;

UPDATE "area" SET "tipoId" = (SELECT t."id" FROM "tipo_area" t WHERE t."nombreNormalizado" = 'otro');

ALTER TABLE "area" ALTER COLUMN "tipoId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "area_tipoId_idx" ON "area"("tipoId");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipo_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unicidad por tipo: el índice de SPEC 04 (todo el catálogo) se reemplaza por uno compuesto, también
-- parcial (WHERE "deletedAt" IS NULL) y también ausente de schema.prisma.
DROP INDEX "area_nombreNormalizado_key";
CREATE UNIQUE INDEX "area_tipoId_nombreNormalizado_key" ON "area" ("tipoId", "nombreNormalizado") WHERE "deletedAt" IS NULL;
