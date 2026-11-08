CREATE TABLE `google_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`refresh_token` text NOT NULL,
	`customer_id` text,
	`account_name` text,
	`currency` text,
	`time_zone` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
