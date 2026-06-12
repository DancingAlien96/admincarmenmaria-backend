-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `sede` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Student` ADD COLUMN `sede` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Student_sede_idx` ON `Student`(`sede`);

