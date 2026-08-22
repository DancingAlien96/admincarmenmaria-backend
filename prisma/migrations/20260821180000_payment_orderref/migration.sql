-- AlterTable: referencia de la pasarela (Tilopay) para casar el retorno
ALTER TABLE `Payment` ADD COLUMN `orderRef` VARCHAR(191) NULL;

CREATE INDEX `Payment_orderRef_idx` ON `Payment`(`orderRef`);
