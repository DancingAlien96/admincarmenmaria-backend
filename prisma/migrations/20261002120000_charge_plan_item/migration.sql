-- Vincula cada cuota (Charge) con el item del plan general del que salió,
-- para poder propagar cambios de precio a cuotas ya asignadas.
ALTER TABLE `Charge` ADD COLUMN `planItemId` VARCHAR(191) NULL;

CREATE INDEX `Charge_planItemId_idx` ON `Charge`(`planItemId`);

ALTER TABLE `Charge` ADD CONSTRAINT `Charge_planItemId_fkey` FOREIGN KEY (`planItemId`) REFERENCES `CuotaPlanItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Relleno: las cuotas ya generadas desde el plan se enlazan por concepto
-- (el plan general tiene conceptos únicos: Admisión, Cuota 1..12, Trámite).
UPDATE `Charge` c
JOIN `CuotaPlanItem` p ON p.`concept` = c.`concept`
SET c.`planItemId` = p.`id`
WHERE c.`planItemId` IS NULL;
