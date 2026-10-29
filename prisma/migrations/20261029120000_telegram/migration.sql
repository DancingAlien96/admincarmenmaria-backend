-- AlterTable
ALTER TABLE `User` ADD COLUMN `telegramChatId` VARCHAR(32) NULL,
    ADD COLUMN `telegramLinkCode` VARCHAR(24) NULL,
    ADD COLUMN `telegramLinkExpires` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_telegramChatId_key` ON `User`(`telegramChatId`);

-- CreateIndex
CREATE UNIQUE INDEX `User_telegramLinkCode_key` ON `User`(`telegramLinkCode`);

