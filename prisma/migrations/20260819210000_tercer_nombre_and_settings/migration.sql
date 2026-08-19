-- AlterTable: tercer nombre opcional del estudiante
ALTER TABLE `Student`
    ADD COLUMN `tercerNombre` VARCHAR(191) NULL;

-- CreateTable: ajustes globales (clave/valor)
CREATE TABLE `AppSetting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
