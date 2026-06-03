-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('SALARIOS', 'INSUMOS', 'SERVICIOS', 'MANTENIMIENTO', 'ADMINISTRATIVOS', 'IMPREVISTOS') NOT NULL,
    `concept` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `spentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `receiptUrl` TEXT NULL,
    `receiptKey` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `registeredById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Expense_category_idx`(`category`),
    INDEX `Expense_spentAt_idx`(`spentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_registeredById_fkey` FOREIGN KEY (`registeredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
