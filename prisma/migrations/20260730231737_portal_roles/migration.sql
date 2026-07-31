-- AlterTable
ALTER TABLE `Student` ADD COLUMN `expedienteNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `studentId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('ADMIN', 'STAFF', 'DOCENTE', 'ESTUDIANTE') NOT NULL DEFAULT 'STAFF';

-- CreateIndex
CREATE UNIQUE INDEX `Student_expedienteNumber_key` ON `Student`(`expedienteNumber`);

-- CreateIndex
CREATE UNIQUE INDEX `User_studentId_key` ON `User`(`studentId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

