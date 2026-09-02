CREATE TABLE `experiment_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`phase` text NOT NULL,
	`measured_at` text NOT NULL,
	`value` real NOT NULL,
	`source` text NOT NULL,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`experiment_id`) REFERENCES `suggestion_experiments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `experiment_readings_org_experiment_idx` ON `experiment_readings` (`organization_id`,`experiment_id`,`measured_at`);--> statement-breakpoint
CREATE TABLE `suggestion_experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`suggestion_id` text NOT NULL,
	`responsible_name` text NOT NULL,
	`metric_name` text NOT NULL,
	`metric_unit` text NOT NULL,
	`desired_direction` text NOT NULL,
	`baseline_value` real NOT NULL,
	`target_value` real NOT NULL,
	`guardrail_metric` text,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text NOT NULL,
	`result_value` real,
	`result_notes` text,
	`decision_reason` text,
	`monitoring_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`suggestion_id`) REFERENCES `suggestions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suggestion_experiments_suggestion_uq` ON `suggestion_experiments` (`suggestion_id`);--> statement-breakpoint
CREATE INDEX `suggestion_experiments_org_status_idx` ON `suggestion_experiments` (`organization_id`,`status`);--> statement-breakpoint
ALTER TABLE `suggestions` ADD `decision_reason` text;