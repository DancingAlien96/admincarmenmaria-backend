-- Limpia actas antiguas no migrables (la inauguracion real se recrea aparte)
DELETE FROM `Acta`;

-- DropForeignKey
ALTER TABLE `ActaEntry` DROP FOREIGN KEY `ActaEntry_actaId_fkey`;

-- DropForeignKey
ALTER TABLE `ActaEntry` DROP FOREIGN KEY `ActaEntry_studentId_fkey`;

-- AlterTable
ALTER TABLE `Acta` DROP COLUMN `directora`,
    DROP COLUMN `phase`,
    DROP COLUMN `secretario`,
    ADD COLUMN `body` TEXT NOT NULL,
    ADD COLUMN `city` VARCHAR(191) NOT NULL DEFAULT 'Chiquimula',
    ADD COLUMN `columns` JSON NULL,
    ADD COLUMN `department` VARCHAR(191) NOT NULL DEFAULT 'Chiquimula',
    ADD COLUMN `rows` JSON NULL,
    ADD COLUMN `signers` JSON NULL,
    ADD COLUMN `templateId` VARCHAR(191) NULL,
    ADD COLUMN `title` VARCHAR(191) NULL,
    ADD COLUMN `vars` JSON NULL;

-- DropTable
DROP TABLE `ActaEntry`;

-- DropTable
DROP TABLE `InauguracionActa`;

-- CreateTable
CREATE TABLE `ActaTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `columns` JSON NULL,
    `signers` JSON NULL,
    `vars` JSON NULL,
    `block` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActaTemplate_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

