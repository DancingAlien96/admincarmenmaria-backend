-- AlterTable: foto del estudiante (subida en la inscripción)
ALTER TABLE `Student`
    ADD COLUMN `photoUrl` TEXT NULL,
    ADD COLUMN `photoKey` VARCHAR(191) NULL;
