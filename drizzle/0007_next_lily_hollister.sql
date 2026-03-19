CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`messageId` int,
	`filename` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`size` int NOT NULL,
	`s3Key` text NOT NULL,
	`s3Url` text NOT NULL,
	`extractedText` text,
	`fileCategory` enum('document','image','video','audio','other') NOT NULL DEFAULT 'other',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
