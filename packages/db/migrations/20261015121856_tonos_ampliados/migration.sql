-- SPEC 10, ampliación de la paleta: 8 tonos nuevos al final del enum "Tono" (de 8 a 16).
-- Solo agrega valores: no toca ninguna fila ni escribe AuditLog, porque nadie usa un tono nuevo hasta
-- que el admin lo elige. Postgres no permite usar un valor en la misma transacción que lo agrega, y
-- esta migración no lo usa. Va aparte de `color_estados_prioridades`, que ya está aplicada en bases
-- de desarrollo (editarla rompería su checksum).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Tono" ADD VALUE 'celeste';
ALTER TYPE "Tono" ADD VALUE 'turquesa';
ALTER TYPE "Tono" ADD VALUE 'lima';
ALTER TYPE "Tono" ADD VALUE 'marron';
ALTER TYPE "Tono" ADD VALUE 'indigo';
ALTER TYPE "Tono" ADD VALUE 'magenta';
ALTER TYPE "Tono" ADD VALUE 'bordo';
ALTER TYPE "Tono" ADD VALUE 'pizarra';
