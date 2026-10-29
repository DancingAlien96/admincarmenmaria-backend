-- AlterTable
ALTER TABLE `Teacher` ADD COLUMN `address` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountHolder` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountNumber` VARCHAR(191) NULL,
    ADD COLUMN `bankAccountType` VARCHAR(191) NULL,
    ADD COLUMN `bankName` VARCHAR(191) NULL,
    ADD COLUMN `userId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Teacher_userId_key` ON `Teacher`(`userId`);

-- AddForeignKey
ALTER TABLE `Teacher` ADD CONSTRAINT `Teacher_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

