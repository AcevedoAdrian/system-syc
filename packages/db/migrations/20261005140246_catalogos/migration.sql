-- CreateTable
CREATE TABLE "area" (
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

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edificio" (
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

    CONSTRAINT "edificio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_ticket" (
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

    CONSTRAINT "tipo_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prioridad" (
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

    CONSTRAINT "prioridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modulo" (
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

    CONSTRAINT "modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
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
    "contacto" TEXT,
    "telefono" TEXT,
    "correo" TEXT,
    "sitioWeb" TEXT,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estado_ticket" (
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
    "clave" TEXT,

    CONSTRAINT "estado_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "estado_ticket_clave_key" ON "estado_ticket"("clave");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edificio" ADD CONSTRAINT "edificio_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edificio" ADD CONSTRAINT "edificio_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipo_ticket" ADD CONSTRAINT "tipo_ticket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipo_ticket" ADD CONSTRAINT "tipo_ticket_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prioridad" ADD CONSTRAINT "prioridad_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prioridad" ADD CONSTRAINT "prioridad_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo" ADD CONSTRAINT "modulo_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modulo" ADD CONSTRAINT "modulo_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_ticket" ADD CONSTRAINT "estado_ticket_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estado_ticket" ADD CONSTRAINT "estado_ticket_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índices únicos parciales (SPEC 04, Q14): el nombre normalizado es único dentro de cada catálogo
-- solo entre los ítems no eliminados, así que un ítem eliminado libera el nombre. Prisma no expresa
-- un índice único con WHERE en `@@unique` (sin preview), por eso viven acá y no en schema.prisma.
-- Si un `migrate dev` futuro propone un DROP INDEX sobre estos, se quita de esa migración.
CREATE UNIQUE INDEX "area_nombreNormalizado_key" ON "area" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "edificio_nombreNormalizado_key" ON "edificio" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "tipo_ticket_nombreNormalizado_key" ON "tipo_ticket" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "prioridad_nombreNormalizado_key" ON "prioridad" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "modulo_nombreNormalizado_key" ON "modulo" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "proveedor_nombreNormalizado_key" ON "proveedor" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "estado_ticket_nombreNormalizado_key" ON "estado_ticket" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
