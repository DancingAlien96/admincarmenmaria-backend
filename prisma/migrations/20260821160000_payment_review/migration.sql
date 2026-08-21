-- AlterEnum: nuevos estados/orígenes de pago (boleta subida por el alumno)
ALTER TABLE `Payment`
    MODIFY `status` ENUM('ACTIVO', 'ANULADO', 'EN_REVISION', 'RECHAZADO') NOT NULL DEFAULT 'ACTIVO';

ALTER TABLE `Payment`
    MODIFY `source` ENUM('MANUAL', 'WOOCOMMERCE', 'PORTAL') NOT NULL DEFAULT 'MANUAL';
