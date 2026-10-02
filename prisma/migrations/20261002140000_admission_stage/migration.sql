-- Etapa de admisión: el aspirante paga el examen antes de ser alumno.
ALTER TABLE `Student` MODIFY `status` ENUM('ASPIRANTE', 'NO_ADMITIDO', 'ACTIVO', 'EGRESADO', 'BAJA') NOT NULL DEFAULT 'ACTIVO';
ALTER TABLE `StudentStatusHistory` MODIFY `fromStatus` ENUM('ASPIRANTE', 'NO_ADMITIDO', 'ACTIVO', 'EGRESADO', 'BAJA') NULL;
ALTER TABLE `StudentStatusHistory` MODIFY `toStatus` ENUM('ASPIRANTE', 'NO_ADMITIDO', 'ACTIVO', 'EGRESADO', 'BAJA') NOT NULL;

-- El cobro de admisión sale del plan de cuotas del alumno y pasa a la etapa
-- de aspirante.
ALTER TABLE `CuotaPlanItem` ADD COLUMN `admission` BOOLEAN NOT NULL DEFAULT false;
UPDATE `CuotaPlanItem` SET `admission` = true WHERE `id` = 'cuota_admision';

-- Sin la admisión, la primera cuota del plan del alumno pasa a ser el mes 0
-- (los meses quedan relativos a ella).
UPDATE `CuotaPlanItem` p
JOIN (
  SELECT * FROM (
    SELECT MIN(`monthOffset`) AS `base` FROM `CuotaPlanItem` WHERE `admission` = false
  ) AS t
) AS x
SET p.`monthOffset` = p.`monthOffset` - x.`base`
WHERE p.`admission` = false;
