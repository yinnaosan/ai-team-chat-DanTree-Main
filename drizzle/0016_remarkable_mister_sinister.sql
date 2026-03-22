ALTER TABLE `access_codes` MODIFY COLUMN `maxUses` bigint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `access_codes` MODIFY COLUMN `usedCount` bigint NOT NULL;