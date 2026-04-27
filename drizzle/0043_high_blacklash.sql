ALTER TABLE `analysis_memory` MODIFY COLUMN `verdict` varchar(500) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `confidenceLevel` varchar(40) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `outputMode` varchar(40) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `expiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `watch_items` MODIFY COLUMN `current_action_bias` varchar(30) NOT NULL DEFAULT 'NONE';--> statement-breakpoint
ALTER TABLE `watch_items` ADD `last_risk_score` decimal(5,4);