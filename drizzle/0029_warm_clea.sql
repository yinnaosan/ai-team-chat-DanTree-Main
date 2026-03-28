CREATE TABLE `signal_journal` (
	`signal_id` varchar(64) NOT NULL,
	`watch_id` varchar(64) NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`trigger_type` varchar(40) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`snapshot_quality` varchar(20) NOT NULL DEFAULT 'unknown',
	`memory_influence` boolean NOT NULL DEFAULT false,
	`learning_influence` boolean NOT NULL DEFAULT false,
	`scheduler_run_id` varchar(64),
	`signal_score_json` json,
	`created_at` bigint NOT NULL,
	CONSTRAINT `signal_journal_signal_id` PRIMARY KEY(`signal_id`)
);
--> statement-breakpoint
CREATE TABLE `signal_outcome` (
	`outcome_id` varchar(64) NOT NULL,
	`signal_id` varchar(64) NOT NULL,
	`horizon` varchar(20) NOT NULL DEFAULT 'short',
	`price_change_pct` decimal(8,4),
	`price_direction` varchar(10),
	`outcome_score` decimal(5,4),
	`risk_adjusted_score` decimal(5,4),
	`thesis_status` varchar(30) NOT NULL DEFAULT 'inconclusive',
	`outcome_label` varchar(40) NOT NULL DEFAULT 'inconclusive',
	`resolved_at` bigint,
	`created_at` bigint NOT NULL,
	CONSTRAINT `signal_outcome_outcome_id` PRIMARY KEY(`outcome_id`)
);
