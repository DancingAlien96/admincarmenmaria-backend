-- CreateTable
CREATE TABLE `WhatsappMessage` (
    `id` VARCHAR(191) NOT NULL,
    `direction` ENUM('INBOUND', 'OUTBOUND') NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL,
    `kind` VARCHAR(191) NULL,
    `studentId` VARCHAR(191) NULL,
    `wamid` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WhatsappMessage_phone_idx`(`phone`),
    INDEX `WhatsappMessage_direction_idx`(`direction`),
    INDEX `WhatsappMessage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotConfig` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `knowledgeBase` TEXT NOT NULL,
    `systemPrompt` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WhatsappMessage` ADD CONSTRAINT `WhatsappMessage_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
