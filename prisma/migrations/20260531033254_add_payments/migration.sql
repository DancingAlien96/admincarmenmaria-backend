-- CreateTable
CREATE TABLE `FeeType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('INSCRIPCION', 'MENSUALIDAD', 'MATERIALES', 'REPOSICION_DIPLOMA', 'OTROS') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FeeType_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `feeTypeId` VARCHAR(191) NULL,
    `concept` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `method` ENUM('EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA') NOT NULL,
    `source` ENUM('MANUAL', 'WOOCOMMERCE') NOT NULL DEFAULT 'MANUAL',
    `status` ENUM('ACTIVO', 'ANULADO') NOT NULL DEFAULT 'ACTIVO',
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receiptUrl` TEXT NULL,
    `receiptKey` VARCHAR(191) NULL,
    `wooOrderId` INTEGER NULL,
    `payerName` VARCHAR(191) NULL,
    `payerEmail` VARCHAR(191) NULL,
    `registeredById` VARCHAR(191) NULL,
    `annulledAt` DATETIME(3) NULL,
    `annulledById` VARCHAR(191) NULL,
    `annulReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_wooOrderId_key`(`wooOrderId`),
    INDEX `Payment_studentId_idx`(`studentId`),
    INDEX `Payment_status_idx`(`status`),
    INDEX `Payment_source_idx`(`source`),
    INDEX `Payment_paidAt_idx`(`paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_feeTypeId_fkey` FOREIGN KEY (`feeTypeId`) REFERENCES `FeeType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_registeredById_fkey` FOREIGN KEY (`registeredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_annulledById_fkey` FOREIGN KEY (`annulledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
