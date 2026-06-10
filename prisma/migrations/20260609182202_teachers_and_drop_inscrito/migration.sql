-- AlterTable
ALTER TABLE `Student` MODIFY `status` ENUM('ACTIVO', 'EGRESADO', 'BAJA') NOT NULL DEFAULT 'ACTIVO';

-- AlterTable
ALTER TABLE `StudentStatusHistory` MODIFY `fromStatus` ENUM('ACTIVO', 'EGRESADO', 'BAJA') NULL,
    MODIFY `toStatus` ENUM('ACTIVO', 'EGRESADO', 'BAJA') NOT NULL;

-- CreateTable
CREATE TABLE `Teacher` (
    `id` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `dpi` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `collegiate` VARCHAR(191) NULL,
    `specialty` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Teacher_dpi_key`(`dpi`),
    INDEX `Teacher_fullName_idx`(`fullName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherRoleAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `teacherId` VARCHAR(191) NOT NULL,
    `role` ENUM('PRACTICA_HOSPITALARIA', 'PRACTICA_COMUNITARIA', 'TEORIA') NOT NULL,

    INDEX `TeacherRoleAssignment_teacherId_idx`(`teacherId`),
    UNIQUE INDEX `TeacherRoleAssignment_teacherId_role_key`(`teacherId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TeacherDocument` (
    `id` VARCHAR(191) NOT NULL,
    `teacherId` VARCHAR(191) NOT NULL,
    `type` ENUM('CV', 'DPI', 'TITULO', 'COLEGIADO', 'OTRO') NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` TEXT NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TeacherDocument_teacherId_idx`(`teacherId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TeacherRoleAssignment` ADD CONSTRAINT `TeacherRoleAssignment_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TeacherDocument` ADD CONSTRAINT `TeacherDocument_teacherId_fkey` FOREIGN KEY (`teacherId`) REFERENCES `Teacher`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

