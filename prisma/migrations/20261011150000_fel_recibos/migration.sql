-- AlterTable
ALTER TABLE `Student` ADD COLUMN `taxId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Dte` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `establishmentId` VARCHAR(191) NULL,
    `internalUuid` VARCHAR(191) NOT NULL,
    `documentType` VARCHAR(191) NOT NULL DEFAULT 'RECI',
    `status` ENUM('PENDING', 'CERTIFIED', 'VOIDED', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `issuerNit` VARCHAR(191) NOT NULL,
    `issuerName` VARCHAR(191) NOT NULL,
    `issuerCommercialName` VARCHAR(191) NOT NULL,
    `issuerTaxAffiliation` VARCHAR(191) NOT NULL DEFAULT 'GEN',
    `issuerEstablishmentCode` VARCHAR(191) NOT NULL,
    `issuerAddress` VARCHAR(191) NOT NULL,
    `issuerPostalCode` VARCHAR(191) NOT NULL,
    `issuerMunicipality` VARCHAR(191) NOT NULL,
    `issuerDepartment` VARCHAR(191) NOT NULL,
    `issuerEmail` VARCHAR(191) NULL,
    `receiverTaxId` VARCHAR(191) NOT NULL,
    `receiverTaxIdType` VARCHAR(191) NOT NULL,
    `receiverName` VARCHAR(191) NOT NULL,
    `receiverEmail` VARCHAR(191) NULL,
    `receiverAddress` VARCHAR(191) NULL,
    `items` JSON NOT NULL,
    `phrases` JSON NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'GTQ',
    `grandTotal` DECIMAL(10, 2) NOT NULL,
    `authorizationNumber` VARCHAR(191) NULL,
    `series` VARCHAR(191) NULL,
    `number` VARCHAR(191) NULL,
    `emittedAt` DATETIME(3) NULL,
    `certifiedAt` DATETIME(3) NULL,
    `xmlKey` VARCHAR(191) NULL,
    `pdfKey` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `response` JSON NULL,
    `error` TEXT NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidReason` TEXT NULL,
    `voidedById` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Dte_internalUuid_key`(`internalUuid`),
    INDEX `Dte_paymentId_idx`(`paymentId`),
    INDEX `Dte_establishmentId_idx`(`establishmentId`),
    INDEX `Dte_status_idx`(`status`),
    INDEX `Dte_authorizationNumber_idx`(`authorizationNumber`),
    INDEX `Dte_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DteEstablishment` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `commercialName` VARCHAR(191) NOT NULL,
    `sede` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `postalCode` VARCHAR(191) NOT NULL,
    `municipality` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DteEstablishment_code_key`(`code`),
    INDEX `DteEstablishment_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DtePhrase` (
    `id` VARCHAR(191) NOT NULL,
    `phraseType` INTEGER NOT NULL,
    `scenarioCode` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DtePhrase_phraseType_scenarioCode_key`(`phraseType`, `scenarioCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DteIssuer` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `nit` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `commercialName` VARCHAR(191) NOT NULL,
    `taxAffiliation` VARCHAR(191) NOT NULL DEFAULT 'GEN',
    `email` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DteSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `autoIssue` BOOLEAN NOT NULL DEFAULT false,
    `sendEmail` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DigifactAuth` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `token` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Dte` ADD CONSTRAINT `Dte_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dte` ADD CONSTRAINT `Dte_establishmentId_fkey` FOREIGN KEY (`establishmentId`) REFERENCES `DteEstablishment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dte` ADD CONSTRAINT `Dte_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Dte` ADD CONSTRAINT `Dte_voidedById_fkey` FOREIGN KEY (`voidedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Datos iniciales: los del recibo que la escuela emite hoy desde el portal de SAT.
INSERT INTO `DteSettings` (`id`, `enabled`, `autoIssue`, `sendEmail`, `updatedAt`)
VALUES (1, false, false, true, CURRENT_TIMESTAMP(3));

INSERT INTO `DteIssuer` (`id`, `nit`, `name`, `commercialName`, `taxAffiliation`, `email`, `updatedAt`)
VALUES (1, '25531395', 'CARMEN ALCIRA , REYES CERÓN DE SARMIENTO', 'ESCUELA PRIVADA DE AUXILIARES DE ENFERMERÍA CARMEN MARÍA', 'GEN', NULL, CURRENT_TIMESTAMP(3));

INSERT INTO `DteEstablishment` (`id`, `code`, `commercialName`, `sede`, `address`, `postalCode`, `municipality`, `department`, `isDefault`, `isActive`, `updatedAt`)
VALUES ('dte_establishment_4', '4', 'ESCUELA PRIVADA DE AUXILIARES DE ENFERMERÍA CARMEN MARÍA', 'Chiquimula', '12 AVENIDA 2-61 zona 1, CHIQUIMULA, CHIQUIMULA', '20001', 'CHIQUIMULA', 'CHIQUIMULA', true, true, CURRENT_TIMESTAMP(3));

-- 8/2: exenta del ISR (centros educativos privados) · 4/8: exenta del IVA (cuotas de centros educativos)
INSERT INTO `DtePhrase` (`id`, `phraseType`, `scenarioCode`, `isActive`, `updatedAt`)
VALUES ('dte_phrase_8_2', 8, 2, true, CURRENT_TIMESTAMP(3)),
       ('dte_phrase_4_8', 4, 8, true, CURRENT_TIMESTAMP(3));
