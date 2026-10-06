-- Escrito a mano (Prisma no lo expresa): la bandeja busca sin mayúsculas ni acentos con
-- `lower(unaccent(texto))` (SPEC 06, D3). `unaccent` es una extensión trusted: no exige superusuario.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateTable
CREATE TABLE "ticket_comentario" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ticket_comentario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_comentario_ticketId_createdAt_idx" ON "ticket_comentario"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "ticket_comentario" ADD CONSTRAINT "ticket_comentario_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comentario" ADD CONSTRAINT "ticket_comentario_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comentario" ADD CONSTRAINT "ticket_comentario_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
