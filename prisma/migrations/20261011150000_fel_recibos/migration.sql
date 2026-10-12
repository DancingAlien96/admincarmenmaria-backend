-- AlterTable
ALTER TABLE `Student` ADD COLUMN `taxId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `FelDocumento` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `internalUuid` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(191) NOT NULL DEFAULT 'RECI',
    `estado` ENUM('PENDIENTE', 'CERTIFICADO', 'ANULADO', 'ERROR') NOT NULL DEFAULT 'PENDIENTE',
    `emisorNit` VARCHAR(191) NOT NULL,
    `emisorNombre` VARCHAR(191) NOT NULL,
    `emisorNombreComercial` VARCHAR(191) NOT NULL,
    `emisorAfiliacion` VARCHAR(191) NOT NULL DEFAULT 'GEN',
    `emisorEstablecimiento` VARCHAR(191) NOT NULL,
    `emisorDireccion` VARCHAR(191) NOT NULL,
    `emisorCodigoPostal` VARCHAR(191) NOT NULL,
    `emisorMunicipio` VARCHAR(191) NOT NULL,
    `emisorDepartamento` VARCHAR(191) NOT NULL,
    `emisorCorreo` VARCHAR(191) NULL,
    `receptorId` VARCHAR(191) NOT NULL,
    `receptorTipo` VARCHAR(191) NOT NULL,
    `receptorNombre` VARCHAR(191) NOT NULL,
    `receptorCorreo` VARCHAR(191) NULL,
    `receptorDireccion` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `frases` JSON NOT NULL,
    `moneda` VARCHAR(191) NOT NULL DEFAULT 'GTQ',
    `granTotal` DECIMAL(10, 2) NOT NULL,
    `autorizacion` VARCHAR(191) NULL,
    `serie` VARCHAR(191) NULL,
    `numero` VARCHAR(191) NULL,
    `fechaEmision` DATETIME(3) NULL,
    `fechaCertificacion` DATETIME(3) NULL,
    `xmlKey` VARCHAR(191) NULL,
    `pdfKey` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `respuesta` JSON NULL,
    `error` TEXT NULL,
    `anuladoAt` DATETIME(3) NULL,
    `anuladoMotivo` TEXT NULL,
    `anuladoById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FelDocumento_internalUuid_key`(`internalUuid`),
    INDEX `FelDocumento_paymentId_idx`(`paymentId`),
    INDEX `FelDocumento_estado_idx`(`estado`),
    INDEX `FelDocumento_autorizacion_idx`(`autorizacion`),
    INDEX `FelDocumento_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FelToken` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `token` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FelDocumento` ADD CONSTRAINT `FelDocumento_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FelDocumento` ADD CONSTRAINT `FelDocumento_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FelDocumento` ADD CONSTRAINT `FelDocumento_anuladoById_fkey` FOREIGN KEY (`anuladoById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

