CREATE TABLE `radar_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`candidateId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` varchar(40) NOT NULL,
	`opportunityState` varchar(20) NOT NULL DEFAULT 'SELECT',
	`cycle` varchar(20) NOT NULL DEFAULT 'Mid',
	`confidence` int NOT NULL DEFAULT 50,
	`whySurface` text NOT NULL DEFAULT (''),
	`whyTrend` text NOT NULL DEFAULT (''),
	`whyHidden` text NOT NULL DEFAULT (''),
	`riskSummary` text NOT NULL DEFAULT (''),
	`relatedTickers` varchar(255) NOT NULL DEFAULT '',
	`watchlistReady` int NOT NULL DEFAULT 1,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `radar_candidates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `bullCaseSummary` text;--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `bearCaseSummary` text;--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `keyUncertainty` text;--> statement-breakpoint
ALTER TABLE `analysis_memory` MODIFY COLUMN `openHypotheses` text;