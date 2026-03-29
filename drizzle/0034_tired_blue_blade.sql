ALTER TABLE `decision_log` ADD `competence_fit` varchar(20);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `competence_confidence` decimal(6,4);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_understanding_score` decimal(6,4);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_moat_strength` varchar(20);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_model_quality` varchar(20);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `management_proxy_score` decimal(6,4);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `capital_allocation_quality` varchar(20);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_eligibility_status` varchar(30);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_priority_multiplier` decimal(6,4);--> statement-breakpoint
ALTER TABLE `decision_log` ADD `business_flags_json` json;