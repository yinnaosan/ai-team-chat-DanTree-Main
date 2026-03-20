ALTER TABLE `tasks` MODIFY COLUMN `status` enum('pending','gpt_planning','manus_working','manus_analyzing','gpt_reviewing','streaming','completed','failed') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `conversations` ADD `lastMessageAt` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `userCoreRules` text;