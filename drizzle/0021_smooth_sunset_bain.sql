CREATE TABLE `sentiment_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(10) NOT NULL,
	`score` int NOT NULL,
	`label` varchar(20) NOT NULL,
	`articleCount` int NOT NULL DEFAULT 0,
	`positiveCount` int NOT NULL DEFAULT 0,
	`negativeCount` int NOT NULL DEFAULT 0,
	`neutralCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sentiment_history_id` PRIMARY KEY(`id`)
);
