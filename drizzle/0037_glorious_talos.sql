CREATE TABLE `entity_snapshots` (
	`snapshot_id` varchar(36) NOT NULL,
	`entity_key` varchar(50) NOT NULL,
	`snapshot_time` bigint NOT NULL,
	`thesis_stance` varchar(30),
	`thesis_change_marker` varchar(50),
	`alert_severity` varchar(20),
	`timing_bias` varchar(20),
	`source_health` varchar(30),
	`change_marker` varchar(50) NOT NULL,
	`state_summary_text` text NOT NULL,
	`advisory_only` boolean NOT NULL DEFAULT true,
	`created_at` bigint NOT NULL,
	CONSTRAINT `entity_snapshots_snapshot_id` PRIMARY KEY(`snapshot_id`)
);
