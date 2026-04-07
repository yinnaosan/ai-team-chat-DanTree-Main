CREATE TABLE `access_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key_hash` varchar(128) NOT NULL,
	`label` varchar(128),
	`bound_email` varchar(320),
	`bound_user_id` int,
	`expires_at` timestamp NOT NULL,
	`revoked` boolean NOT NULL DEFAULT false,
	`activated_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `access_keys_key_hash_unique` UNIQUE(`key_hash`)
);
