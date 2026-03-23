ALTER TABLE `rpa_configs` ADD `defaultCostMode` enum('A','B','C') DEFAULT 'B' NOT NULL;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `pinnedMetrics` json;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `userWatchlist` json;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `columnWidths` json;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `lastTicker` varchar(32);--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `researchStyle` json;--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `aiBehavior` json;