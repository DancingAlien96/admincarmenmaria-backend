-- CreateTable
CREATE TABLE `Acta` (
    `id` VARCHAR(191) NOT NULL,
    `actaNumber` VARCHAR(191) NOT NULL,
    `folios` VARCHAR(191) NULL,
    `phase` VARCHAR(191) NOT NULL,
    `actaDate` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Acta_actaDate_idx`(`actaDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActaEntry` (
    `id` VARCHAR(191) NOT NULL,
    `actaId` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `studentName` VARCHAR(191) NOT NULL,
    `score` DECIMAL(5, 2) NOT NULL,

    INDEX `ActaEntry_actaId_idx`(`actaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Acta` ADD CONSTRAINT `Acta_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActaEntry` ADD CONSTRAINT `ActaEntry_actaId_fkey` FOREIGN KEY (`actaId`) REFERENCES `Acta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActaEntry` ADD CONSTRAINT `ActaEntry_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
