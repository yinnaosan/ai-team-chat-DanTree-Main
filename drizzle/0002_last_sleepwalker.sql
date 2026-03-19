CREATE TABLE `rpa_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`chatgptConversationName` varchar(256) DEFAULT '投资',
	`manusSystemPrompt` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rpa_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `rpa_configs_userId_unique` UNIQUE(`userId`)
);
