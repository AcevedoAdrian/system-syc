-- CreateTable
CREATE TABLE "modulo_departamento" (
    "moduloId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "modulo_departamento_pkey" PRIMARY KEY ("moduloId","organizationId")
);

-- CreateIndex
CREATE INDEX "modulo_departamento_organizationId_idx" ON "modulo_departamento"("organizationId");

-- CreateIndex
CREATE INDEX "ticket_departamentoId_moduloId_idx" ON "ticket"("departamentoId", "moduloId");

-- AddForeignKey
ALTER TABLE "modulo_departamento" ADD CONSTRAINT "modulo_departamento_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo_departamento" ADD CONSTRAINT "modulo_departamento_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
