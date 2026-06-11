-- CreateTable
CREATE TABLE `InauguracionActa` (
    `id` VARCHAR(191) NOT NULL,
    `actaNumber` VARCHAR(191) NOT NULL,
    `folios` VARCHAR(191) NULL,
    `promocion` VARCHAR(191) NOT NULL,
    `cohorte` INTEGER NOT NULL,
    `actoDate` DATETIME(3) NOT NULL,
    `closeDate` DATETIME(3) NOT NULL,
    `city` VARCHAR(191) NOT NULL DEFAULT 'Chiquimula',
    `department` VARCHAR(191) NOT NULL DEFAULT 'Chiquimula',
    `directora` VARCHAR(191) NOT NULL,
    `docente` VARCHAR(191) NOT NULL,
    `secretario` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `students` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `InauguracionActa_cohorte_idx`(`cohorte`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

