-- AlterTable
ALTER TABLE `BotConfig` ADD COLUMN `dailyLimit` INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN `portalEnabled` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `AsistenteMensaje` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(10) NOT NULL,
    `content` TEXT NOT NULL,
    `oculto` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AsistenteMensaje_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AsistenteMensaje` ADD CONSTRAINT `AsistenteMensaje_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

