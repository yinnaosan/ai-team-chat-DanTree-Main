ALTER TABLE `tasks` ADD `isPinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `isFavorited` boolean DEFAULT false NOT NULL;