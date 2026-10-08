-- AlterTable
ALTER TABLE `FaseItem` ADD COLUMN `puntos` INTEGER NULL;

-- AlterTable
ALTER TABLE `Grade` ADD COLUMN `faseItemId` VARCHAR(191) NULL,
    MODIFY `category` ENUM('TAREA', 'ACTIVIDAD', 'PRIMER_PARCIAL', 'SEGUNDO_PARCIAL', 'EXAMEN_FINAL', 'RECUPERACION') NOT NULL;

-- CreateIndex
CREATE INDEX `Grade_faseItemId_idx` ON `Grade`(`faseItemId`);

-- AddForeignKey
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_faseItemId_fkey` FOREIGN KEY (`faseItemId`) REFERENCES `FaseItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

