-- CreateTable: libro de calificaciones por fase
CREATE TABLE `Grade` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `fase` INTEGER NOT NULL,
    `category` ENUM('TAREA', 'PRIMER_PARCIAL', 'SEGUNDO_PARCIAL', 'EXAMEN_FINAL', 'RECUPERACION') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `score` DECIMAL(6, 2) NOT NULL,
    `maxScore` DECIMAL(6, 2) NOT NULL DEFAULT 100,
    `date` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Grade_studentId_idx`(`studentId`),
    INDEX `Grade_studentId_fase_idx`(`studentId`, `fase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
