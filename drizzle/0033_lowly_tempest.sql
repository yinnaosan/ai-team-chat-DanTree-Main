CREATE TABLE `strategy_evolution_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` varchar(36) NOT NULL,
	`performance_summary` json,
	`key_changes` text,
	`evaluation_result` varchar(20),
	`overfit_flag` boolean NOT NULL DEFAULT false,
	`is_oos_validated` boolean NOT NULL DEFAULT false,
	`degradation_ratio` decimal(8,4),
	`created_at` bigint NOT NULL,
	CONSTRAINT `strategy_evolution_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategy_version` (
	`id` varchar(36) NOT NULL,
	`version_name` varchar(100) NOT NULL,
	`created_at` bigint NOT NULL,
	`description` text,
	`change_summary` text,
	`parent_version_id` varchar(36),
	`is_active` boolean NOT NULL DEFAULT true,
	`is_experimental` boolean NOT NULL DEFAULT false,
	`user_id` int NOT NULL DEFAULT 0,
	CONSTRAINT `strategy_version_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `decision_log` ADD `strategy_version_id` varchar(36);