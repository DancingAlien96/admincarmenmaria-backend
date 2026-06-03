-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `chargeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Charge` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `feeTypeId` VARCHAR(191) NULL,
    `concept` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('PENDIENTE', 'PAGADO', 'ANULADO') NOT NULL DEFAULT 'PENDIENTE',
    `createdById` VARCHAR(191) NULL,
    `annulledAt` DATETIME(3) NULL,
    `annulledById` VARCHAR(191) NULL,
    `annulReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Charge_studentId_idx`(`studentId`),
    INDEX `Charge_status_idx`(`status`),
    INDEX `Charge_dueDate_idx`(`dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Payment_chargeId_idx` ON `Payment`(`chargeId`);

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_chargeId_fkey` FOREIGN KEY (`chargeId`) REFERENCES `Charge`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Charge` ADD CONSTRAINT `Charge_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Charge` ADD CONSTRAINT `Charge_feeTypeId_fkey` FOREIGN KEY (`feeTypeId`) REFERENCES `FeeType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Charge` ADD CONSTRAINT `Charge_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Charge` ADD CONSTRAINT `Charge_annulledById_fkey` FOREIGN KEY (`annulledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
