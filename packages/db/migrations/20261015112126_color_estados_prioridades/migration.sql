-- SPEC 10: color de estados y prioridades. Orden de los pasos:
-- 1) crea el enum "Tono" con los 8 tonos de la base visual (SPEC 09);
-- 2) agrega "color" NOT NULL DEFAULT 'gris' a estado_ticket y a prioridad;
-- 3) asigna la propuesta de color a lo que ya existe (los pasos 3 a 5 están escritos a mano);
-- 4) todo lo que no coincide queda en 'gris', el valor por defecto del paso 2.
--
-- La migración NO escribe AuditLog: asignar el valor inicial de un campo nuevo no es una acción de un
-- usuario (misma decisión que SPEC 08 con el tipo «Otro»). El historial de cada ítem muestra el color
-- desde su primer cambio.

-- CreateEnum
CREATE TYPE "Tono" AS ENUM ('gris', 'rojo', 'naranja', 'amarillo', 'verde', 'azul', 'violeta', 'rosa');

-- AlterTable
ALTER TABLE "estado_ticket" ADD COLUMN     "color" "Tono" NOT NULL DEFAULT 'gris';

-- AlterTable
ALTER TABLE "prioridad" ADD COLUMN     "color" "Tono" NOT NULL DEFAULT 'gris';

-- Estados de sistema: por `clave`, porque el nombre puede haber cambiado (D1 de SPEC 04).
-- Los UPDATE alcanzan también a las filas eliminadas lógicamente: evita un caso especial.
UPDATE "estado_ticket" SET "color" = 'verde'   WHERE "clave" = 'FINALIZADO';
UPDATE "estado_ticket" SET "color" = 'gris'    WHERE "clave" = 'CERRADO';
UPDATE "estado_ticket" SET "color" = 'rojo'    WHERE "clave" = 'CANCELADO';
UPDATE "estado_ticket" SET "color" = 'naranja' WHERE "clave" = 'REABIERTO';

-- Estados sin clave: por `nombreNormalizado`.
UPDATE "estado_ticket" SET "color" = 'azul'     WHERE "clave" IS NULL AND "nombreNormalizado" = 'pendiente';
UPDATE "estado_ticket" SET "color" = 'violeta'  WHERE "clave" IS NULL AND "nombreNormalizado" = 'en progreso';
UPDATE "estado_ticket" SET "color" = 'amarillo' WHERE "clave" IS NULL AND "nombreNormalizado" = 'en espera';

-- Prioridades: por `nombreNormalizado`.
UPDATE "prioridad" SET "color" = 'gris'    WHERE "nombreNormalizado" = 'baja';
UPDATE "prioridad" SET "color" = 'azul'    WHERE "nombreNormalizado" = 'media';
UPDATE "prioridad" SET "color" = 'naranja' WHERE "nombreNormalizado" = 'alta';
UPDATE "prioridad" SET "color" = 'rojo'    WHERE "nombreNormalizado" = 'urgente';
