-- Bandeja de tickets: filtra por departamento y ordena por fechaRecepcion DESC, numero DESC (findPage).
-- Este índice evita el ordenamiento. Prisma lo expresa, a diferencia de los parciales de las migraciones
-- anteriores, que siguen escritos a mano.
-- CreateIndex
CREATE INDEX "ticket_departamentoId_fechaRecepcion_numero_idx" ON "ticket"("departamentoId", "fechaRecepcion" DESC, "numero" DESC);
