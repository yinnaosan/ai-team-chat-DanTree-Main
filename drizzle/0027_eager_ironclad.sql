ALTER TABLE `memory_records` ADD `failure_intensity_score` decimal(5,4);--> statement-breakpoint
ALTER TABLE `memory_records` ADD `success_strength_score` decimal(5,4);--> statement-breakpoint
ALTER TABLE `memory_records` ADD `freshness_score` decimal(5,4) DEFAULT '1.0000' NOT NULL;--> statement-breakpoint
ALTER TABLE `memory_records` ADD `change_log` json;