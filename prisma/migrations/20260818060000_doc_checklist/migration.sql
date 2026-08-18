-- CreateTable
CREATE TABLE `DocRequirement` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DocRequirement_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StudentDocStatus` (
    `id` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NOT NULL,
    `requirementId` VARCHAR(191) NOT NULL,
    `delivered` BOOLEAN NOT NULL DEFAULT false,
    `receivedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StudentDocStatus_studentId_idx`(`studentId`),
    INDEX `StudentDocStatus_requirementId_idx`(`requirementId`),
    UNIQUE INDEX `StudentDocStatus_studentId_requirementId_key`(`studentId`, `requirementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StudentDocStatus` ADD CONSTRAINT `StudentDocStatus_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentDocStatus` ADD CONSTRAINT `StudentDocStatus_requirementId_fkey` FOREIGN KEY (`requirementId`) REFERENCES `DocRequirement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StudentDocStatus` ADD CONSTRAINT `StudentDocStatus_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: documentos requeridos del prototipo (editables por el admin)
INSERT INTO `DocRequirement` (`id`, `name`, `order`, `active`, `updatedAt`) VALUES
    ('docreq_partida',        'Partida de nacimiento',            1,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_dpi',            'DPI',                              2,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_antecedentes',   'Antecedentes penales',            3,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_codigo_basico',  'Código Personal de Básico',       4,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_cert_1basico',   'Certificado Primero Básico',      5,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_cert_2basico',   'Certificado Segundo Básico',      6,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_cert_3basico',   'Certificado Tercero Básico',      7,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_diploma_basico', 'Diploma de Tercero Básico',       8,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_carta_recom',    'Carta de recomendación',          9,  true, CURRENT_TIMESTAMP(3)),
    ('docreq_examen_conoc',   'Examen de conocimientos generales', 10, true, CURRENT_TIMESTAMP(3)),
    ('docreq_examen_medico',  'Examen médico',                   11, true, CURRENT_TIMESTAMP(3)),
    ('docreq_examen_psico',   'Examen psicológico',              12, true, CURRENT_TIMESTAMP(3)),
    ('docreq_entrevista',     'Entrevista',                      13, true, CURRENT_TIMESTAMP(3));
