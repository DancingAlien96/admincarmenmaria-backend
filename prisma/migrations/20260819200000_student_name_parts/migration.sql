-- AlterTable: nombre desglosado del estudiante (tercer apellido opcional)
ALTER TABLE `Student`
    ADD COLUMN `primerNombre` VARCHAR(191) NULL,
    ADD COLUMN `segundoNombre` VARCHAR(191) NULL,
    ADD COLUMN `primerApellido` VARCHAR(191) NULL,
    ADD COLUMN `segundoApellido` VARCHAR(191) NULL,
    ADD COLUMN `tercerApellido` VARCHAR(191) NULL;
