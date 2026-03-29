CREATE TABLE `decision_outcome` (
	`id` int AUTO_INCREMENT NOT NULL,
	`decision_id` int NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`decision_timestamp` bigint NOT NULL,
	`initial_price` decimal(12,4) NOT NULL,
	`evaluation_price` decimal(12,4),
	`evaluation_timestamp` bigint,
	`horizon` varchar(5) NOT NULL,
	`return_pct` decimal(10,6),
	`is_positive` boolean,
	`evaluated` boolean NOT NULL DEFAULT false,
	`created_at` bigint NOT NULL,
	CONSTRAINT `decision_outcome_id` PRIMARY KEY(`id`)
);
