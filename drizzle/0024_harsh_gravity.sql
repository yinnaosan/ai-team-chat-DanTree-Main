CREATE TABLE `analysis_memory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ticker` varchar(20) NOT NULL,
	`taskType` varchar(40) NOT NULL DEFAULT '',
	`verdict` varchar(20) NOT NULL DEFAULT '',
	`confidenceLevel` varchar(20) NOT NULL DEFAULT '',
	`evidenceScore` decimal(5,3) NOT NULL DEFAULT '0',
	`bullCaseSummary` text NOT NULL DEFAULT (''),
	`bearCaseSummary` text NOT NULL DEFAULT (''),
	`keyUncertainty` text NOT NULL DEFAULT (''),
	`openHypotheses` text NOT NULL DEFAULT (''),
	`outputMode` varchar(20) NOT NULL DEFAULT '',
	`loopRan` int NOT NULL DEFAULT 0,
	`taskId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysis_memory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loop_telemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`primaryTicker` varchar(20) NOT NULL DEFAULT '',
	`triggerType` varchar(60) NOT NULL,
	`triggerReason` text NOT NULL,
	`evidenceScoreAtTrigger` decimal(5,3) NOT NULL DEFAULT '0',
	`confidenceAtTrigger` varchar(20) NOT NULL DEFAULT '',
	`hypothesisCandidateCount` int NOT NULL DEFAULT 0,
	`selectedHypothesisId` varchar(20) NOT NULL DEFAULT '',
	`selectedFocusArea` varchar(60) NOT NULL DEFAULT '',
	`secondPassSuccess` int NOT NULL DEFAULT 0,
	`evidenceDelta` decimal(5,3) NOT NULL DEFAULT '0',
	`verdictChanged` int NOT NULL DEFAULT 0,
	`outputMode` varchar(20) NOT NULL DEFAULT '',
	`loopDurationMs` int NOT NULL DEFAULT 0,
	`llmCallsUsed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loop_telemetry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `source_reliability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sourceId` varchar(40) NOT NULL,
	`ticker` varchar(20) NOT NULL DEFAULT '',
	`taskType` varchar(40) NOT NULL DEFAULT '',
	`dataPresent` int NOT NULL DEFAULT 0,
	`dataUsed` int NOT NULL DEFAULT 0,
	`fieldsCovered` int NOT NULL DEFAULT 0,
	`evidenceContribution` decimal(5,3) NOT NULL DEFAULT '0',
	`latencyMs` int NOT NULL DEFAULT 0,
	`errorOccurred` int NOT NULL DEFAULT 0,
	`taskId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `source_reliability_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `rpa_configs` ADD `chartColorScheme` varchar(8);