CREATE TABLE `decision_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolio_id` int NOT NULL,
	`snapshot_id` int,
	`ticker` varchar(20) NOT NULL,
	`fusion_score` decimal(8,6) NOT NULL,
	`decision_bias` varchar(30) NOT NULL,
	`action_label` varchar(30) NOT NULL,
	`sizing_bucket` varchar(20),
	`allocation_pct` decimal(8,4),
	`advisory_text` text,
	`advisory_only` boolean NOT NULL DEFAULT true,
	`created_at` bigint NOT NULL,
	CONSTRAINT `decision_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guard_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolio_id` int NOT NULL,
	`snapshot_id` int,
	`ticker` varchar(20) NOT NULL,
	`dominant_guard` varchar(40) NOT NULL DEFAULT 'NONE',
	`suppressed` boolean NOT NULL DEFAULT false,
	`decay_multiplier` decimal(6,4) NOT NULL DEFAULT '1.0000',
	`decay_trace` json,
	`safety_report` json,
	`created_at` bigint NOT NULL,
	CONSTRAINT `guard_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`name` varchar(128) NOT NULL DEFAULT 'Default Portfolio',
	`description` text,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `portfolio_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_position` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolio_id` int NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`allocation_pct` decimal(8,4) NOT NULL DEFAULT '0',
	`action_label` varchar(30) NOT NULL DEFAULT 'HOLD',
	`decision_bias` varchar(30),
	`fusion_score` decimal(8,6),
	`sizing_bucket` varchar(20),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `portfolio_position_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_snapshot` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolio_id` int NOT NULL,
	`snapshot_data` json NOT NULL,
	`guard_status` varchar(30) NOT NULL DEFAULT 'healthy',
	`total_tickers` int NOT NULL DEFAULT 0,
	`created_at` bigint NOT NULL,
	CONSTRAINT `portfolio_snapshot_id` PRIMARY KEY(`id`)
);
