CREATE TABLE `cycle_engine_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cache_key` varchar(64) NOT NULL DEFAULT 'global',
	`stage` varchar(32) NOT NULL,
	`stage_label` varchar(32) NOT NULL,
	`market_style` varchar(16) NOT NULL,
	`market_style_label` varchar(64) NOT NULL,
	`sector_rotation` json NOT NULL,
	`why_surface` text NOT NULL,
	`why_trend` text NOT NULL,
	`why_hidden` text NOT NULL,
	`risk_warnings` json NOT NULL,
	`confidence` int NOT NULL DEFAULT 0,
	`data_snapshot` json NOT NULL,
	`generated_at` bigint NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `cycle_engine_cache_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `decision_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`ticker` varchar(32) NOT NULL,
	`action` varchar(16) NOT NULL,
	`state` varchar(64),
	`timing_signal` text,
	`why_surface` text,
	`why_trend` text,
	`why_hidden` text,
	`cycle` varchar(64),
	`source` varchar(32) NOT NULL DEFAULT 'manual',
	`created_at` bigint NOT NULL,
	CONSTRAINT `decision_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memory_records` (
	`id` varchar(36) NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`memory_type` enum('action_record','thesis_snapshot','risk_flag','catalyst_note') NOT NULL,
	`action` varchar(20),
	`verdict` text,
	`confidence` varchar(20),
	`evidence_score` decimal(5,4),
	`source_query` text,
	`tags` json,
	`thesis_core` text,
	`risk_structure` json,
	`counterarguments` json,
	`failure_modes` json,
	`reasoning_pattern` varchar(60),
	`scenario_type` varchar(60),
	`outcome_label` enum('success','failure','invalidated'),
	`affects_step0` boolean NOT NULL DEFAULT false,
	`affects_controller` boolean NOT NULL DEFAULT false,
	`affects_routing` boolean NOT NULL DEFAULT false,
	`created_at` bigint NOT NULL,
	`expires_at` bigint,
	`is_active` boolean NOT NULL DEFAULT true,
	`embedding_ready` boolean NOT NULL DEFAULT false,
	CONSTRAINT `memory_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `radar_candidates` ADD `status` varchar(16) DEFAULT 'SELECT' NOT NULL;