CREATE TABLE `assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`category` enum('stocks','crypto','cash','real_estate','bonds','other') NOT NULL DEFAULT 'other',
	`ticker` varchar(20),
	`quantity` decimal(18,8),
	`costBasis` decimal(18,2),
	`currentValue` decimal(18,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `liabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`category` enum('mortgage','car_loan','credit_card','student_loan','personal_loan','other') NOT NULL DEFAULT 'other',
	`outstandingBalance` decimal(18,2) NOT NULL,
	`interestRate` decimal(6,4),
	`monthlyPayment` decimal(18,2),
	`currency` varchar(10) NOT NULL DEFAULT 'USD',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `liabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `net_worth_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`totalAssets` decimal(18,2) NOT NULL,
	`totalLiabilities` decimal(18,2) NOT NULL,
	`netWorth` decimal(18,2) NOT NULL,
	`snapshotAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `net_worth_snapshots_id` PRIMARY KEY(`id`)
);
