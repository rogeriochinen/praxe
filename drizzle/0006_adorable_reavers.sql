ALTER TABLE `ai_runs` ADD `suggestion_id` text REFERENCES suggestions(id);--> statement-breakpoint
ALTER TABLE `suggestions` ADD `analysis_status` text;--> statement-breakpoint
ALTER TABLE `suggestions` ADD `analysis_json` text;--> statement-breakpoint
ALTER TABLE `suggestions` ADD `ai_recommendation` text;--> statement-breakpoint
ALTER TABLE `suggestions` ADD `ai_confidence` integer;