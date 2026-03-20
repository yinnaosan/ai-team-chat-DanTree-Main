ALTER TABLE `tasks` MODIFY COLUMN `status` enum('pending','gpt_planning','manus_working','gpt_reviewing','completed','failed') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `openaiModel` varchar(128) DEFAULT 'gpt-4o-mini';--> statement-breakpoint
ALTER TABLE `rpa_configs` DROP COLUMN `chatgptConversationName`;--> statement-breakpoint
ALTER TABLE `rpa_configs` DROP COLUMN `localProxyUrl`;