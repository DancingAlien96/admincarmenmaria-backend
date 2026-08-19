-- CreateTable
CREATE TABLE `CuotaPlanItem` (
    `id` VARCHAR(191) NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `monthOffset` INTEGER NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CuotaPlanItem_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed: plan de cuotas general del prototipo (editable por el admin)
INSERT INTO `CuotaPlanItem` (`id`, `concept`, `amount`, `monthOffset`, `order`, `active`, `updatedAt`) VALUES
    ('cuota_admision', 'Admisión',           400.00, 0,  1,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_01',       'Cuota 1',             850.00, 1,  2,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_02',       'Cuota 2',             850.00, 2,  3,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_03',       'Cuota 3',             850.00, 3,  4,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_04',       'Cuota 4',             850.00, 4,  5,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_05',       'Cuota 5',             850.00, 5,  6,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_06',       'Cuota 6',             850.00, 6,  7,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_07',       'Cuota 7',             850.00, 7,  8,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_08',       'Cuota 8',             850.00, 8,  9,  true, CURRENT_TIMESTAMP(3)),
    ('cuota_09',       'Cuota 9',             850.00, 9,  10, true, CURRENT_TIMESTAMP(3)),
    ('cuota_10',       'Cuota 10',            850.00, 10, 11, true, CURRENT_TIMESTAMP(3)),
    ('cuota_11',       'Cuota 11',            850.00, 11, 12, true, CURRENT_TIMESTAMP(3)),
    ('cuota_12',       'Cuota 12',            850.00, 12, 13, true, CURRENT_TIMESTAMP(3)),
    ('cuota_tramite',  'Trámite de título',   300.00, 13, 14, true, CURRENT_TIMESTAMP(3));
