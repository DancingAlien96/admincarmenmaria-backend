-- CreateTable: biblioteca digital (E-Books)
CREATE TABLE `Ebook` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `author` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `fileUrl` TEXT NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `coverUrl` TEXT NULL,
    `coverKey` VARCHAR(191) NULL,
    `sizeLabel` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Ebook_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ebook` ADD CONSTRAINT `Ebook_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
