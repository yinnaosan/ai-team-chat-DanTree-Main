CREATE TABLE `scheduler_runs` (
	`run_id` varchar(64) NOT NULL,
	`started_at` bigint NOT NULL,
	`finished_at` bigint,
	`run_status` varchar(20) NOT NULL DEFAULT 'running',
	`watches_scanned` int NOT NULL DEFAULT 0,
	`triggers_fired` int NOT NULL DEFAULT 0,
	`actions_created` int NOT NULL DEFAULT 0,
	`alerts_created` int NOT NULL DEFAULT 0,
	`errors_count` int NOT NULL DEFAULT 0,
	`aborted_early` boolean NOT NULL DEFAULT false,
	`dry_run` boolean NOT NULL DEFAULT false,
	`summary_json` json,
	CONSTRAINT `scheduler_runs_run_id` PRIMARY KEY(`run_id`)
);
--> statement-breakpoint
CREATE TABLE `watch_alerts` (
	`alert_id` varchar(64) NOT NULL,
	`watch_id` varchar(64) NOT NULL,
	`trigger_id` varchar(64),
	`action_id` varchar(64),
	`severity` varchar(20) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`workflow_status` varchar(30) NOT NULL DEFAULT 'new',
	`cooldown_key` varchar(128) NOT NULL,
	`scheduler_run_id` varchar(64),
	`created_at` bigint NOT NULL,
	CONSTRAINT `watch_alerts_alert_id` PRIMARY KEY(`alert_id`)
);
--> statement-breakpoint
CREATE TABLE `watch_audit_log` (
	`audit_id` varchar(64) NOT NULL,
	`watch_id` varchar(64) NOT NULL,
	`event_type` varchar(40) NOT NULL,
	`from_status` varchar(40),
	`to_status` varchar(40),
	`trigger_id` varchar(64),
	`action_id` varchar(64),
	`payload_json` json,
	`created_at` bigint NOT NULL,
	CONSTRAINT `watch_audit_log_audit_id` PRIMARY KEY(`audit_id`)
);
--> statement-breakpoint
CREATE TABLE `watch_items` (
	`watch_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`primary_ticker` varchar(20) NOT NULL,
	`watch_type` varchar(40) NOT NULL,
	`watch_status` varchar(20) NOT NULL DEFAULT 'active',
	`current_action_bias` varchar(10) NOT NULL DEFAULT 'NONE',
	`thesis_summary` text NOT NULL,
	`risk_conditions` json DEFAULT ('[]'),
	`trigger_conditions` json DEFAULT ('[]'),
	`priority` varchar(20) NOT NULL DEFAULT 'medium',
	`linked_memory_ids` json DEFAULT ('[]'),
	`linked_loop_ids` json DEFAULT ('[]'),
	`notes` text,
	`last_evaluated_at` bigint,
	`last_triggered_at` bigint,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `watch_items_watch_id` PRIMARY KEY(`watch_id`)
);
--> statement-breakpoint
CREATE TABLE `watch_workflows` (
	`workflow_id` varchar(64) NOT NULL,
	`watch_id` varchar(64) NOT NULL,
	`trigger_id` varchar(64),
	`action_id` varchar(64),
	`workflow_step` varchar(40) NOT NULL DEFAULT 'triggered',
	`status` varchar(20) NOT NULL DEFAULT 'open',
	`summary` text,
	`scheduler_run_id` varchar(64),
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `watch_workflows_workflow_id` PRIMARY KEY(`workflow_id`)
);
