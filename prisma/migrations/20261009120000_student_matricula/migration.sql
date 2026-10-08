-- CreateTable
CREATE TABLE `StudentMatricula` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `fileUrl` TEXT NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `status` ENUM('EN_REVISION', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'EN_REVISION',
    `note` TEXT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `reviewedById` VARCHAR(191) NULL,

    INDEX `StudentMatricula_status_idx`(`status`),
    UNIQUE INDEX `StudentMatricula_studentId_year_key`(`studentId`, `year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StudentMatricula` ADD CONSTRAINT `StudentMatricula_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

