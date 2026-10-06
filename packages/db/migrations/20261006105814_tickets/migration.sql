-- CreateTable
CREATE TABLE "ticket" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "departamentoId" TEXT NOT NULL,
    "areaId" TEXT,
    "edificioId" TEXT,
    "tipoId" TEXT,
    "prioridadId" TEXT NOT NULL,
    "moduloId" TEXT,
    "estadoId" TEXT NOT NULL,
    "proveedorId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "actuacionSimple" TEXT,
    "referenciaExterna" TEXT,
    "solucionDescripcion" TEXT,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "fechaRecepcion" DATE NOT NULL,
    "fechaCierre" DATE,
    "fechaReabierto" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_numero_key" ON "ticket"("numero");

-- CreateIndex
CREATE INDEX "ticket_departamentoId_idx" ON "ticket"("departamentoId");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_edificioId_fkey" FOREIGN KEY ("edificioId") REFERENCES "edificio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "tipo_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_prioridadId_fkey" FOREIGN KEY ("prioridadId") REFERENCES "prioridad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "estado_ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único parcial (SPEC 05, Feature 5.5, P11): la referencia externa es única por proveedor solo
-- entre los tickets no eliminados y con referencia, así que eliminar un ticket libera la referencia.
-- Prisma no expresa un índice único con WHERE en `@@unique` (sin preview), por eso vive acá y no en
-- schema.prisma. Si un `migrate dev` futuro propone un DROP INDEX sobre este, se quita de esa migración.
CREATE UNIQUE INDEX "ticket_proveedorId_referenciaExterna_key" ON "ticket" ("proveedorId", "referenciaExterna") WHERE "deletedAt" IS NULL AND "referenciaExterna" IS NOT NULL;
