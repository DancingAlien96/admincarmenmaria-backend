-- CreateTable
CREATE TABLE `Graduate` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `dpi` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `mspasCode` VARCHAR(191) NULL,
    `diplomaNumber` VARCHAR(191) NOT NULL,
    `graduationDate` DATETIME(3) NOT NULL,
    `diplomaUrl` TEXT NULL,
    `diplomaKey` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Graduate_studentId_key`(`studentId`),
    UNIQUE INDEX `Graduate_dpi_key`(`dpi`),
    UNIQUE INDEX `Graduate_diplomaNumber_key`(`diplomaNumber`),
    INDEX `Graduate_fullName_idx`(`fullName`),
    INDEX `Graduate_dpi_idx`(`dpi`),
    INDEX `Graduate_diplomaNumber_idx`(`diplomaNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecommendationLetter` (
    `id` VARCHAR(191) NOT NULL,
    `graduateId` VARCHAR(191) NOT NULL,
    `issueDate` DATETIME(3) NOT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecommendationLetter_graduateId_idx`(`graduateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Graduate` ADD CONSTRAINT `Graduate_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Graduate` ADD CONSTRAINT `Graduate_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecommendationLetter` ADD CONSTRAINT `RecommendationLetter_graduateId_fkey` FOREIGN KEY (`graduateId`) REFERENCES `Graduate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
