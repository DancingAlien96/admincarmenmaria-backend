-- CreateTable: contenido de clase por fase (tareas/actividades/exámenes/materiales)
CREATE TABLE `FaseItem` (
    `id` VARCHAR(191) NOT NULL,
    `fase` INTEGER NOT NULL,
    `kind` ENUM('TAREA', 'ACTIVIDAD', 'EXAMEN', 'MATERIAL') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `date` DATETIME(3) NULL,
    `meta` VARCHAR(191) NULL,
    `fileUrl` TEXT NULL,
    `fileKey` VARCHAR(191) NULL,
    `sizeLabel` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FaseItem_fase_kind_idx`(`fase`, `kind`),
    INDEX `FaseItem_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FaseItem` ADD CONSTRAINT `FaseItem_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
