CREATE TABLE `workspace_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`title` varchar(100) NOT NULL,
	`session_type` varchar(20) NOT NULL DEFAULT 'entity',
	`focus_key` varchar(100) NOT NULL,
	`focus_type` varchar(20) NOT NULL DEFAULT 'ticker',
	`pinned` boolean NOT NULL DEFAULT false,
	`favorite` boolean NOT NULL DEFAULT false,
	`created_at` bigint NOT NULL,
	`updated_at` bigint NOT NULL,
	`last_active_at` bigint NOT NULL,
	CONSTRAINT `workspace_sessions_id` PRIMARY KEY(`id`)
);
