ALTER TABLE `rpa_configs` MODIFY COLUMN `openaiModel` varchar(128) DEFAULT 'gpt-5.4';--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `gptModel` varchar(128) DEFAULT 'gpt-5.4';--> statement-breakpoint
ALTER TABLE `workspace_sessions` ADD `conversation_id` int;