ALTER TABLE `decision_log` ADD `asymmetry_score` decimal(6,4);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `asymmetry_label` varchar(20);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `position_target_pct` decimal(6,2);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `position_size_bucket` varchar(10);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `no_bet_restriction` varchar(10);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `concentration_risk` varchar(10);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `positioning_lens_json` json;