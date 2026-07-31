-- CreateTable
CREATE TABLE `PortalInvite` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `studentId` VARCHAR(191) NULL,
    `prefillName` VARCHAR(191) NULL,
    `sede` VARCHAR(191) NULL,
    `cohorteYear` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `usedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PortalInvite_token_key`(`token`),
    INDEX `PortalInvite_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

