ALTER TABLE `insights` ADD `decision_reason` text;--> statement-breakpoint
ALTER TABLE `insights` ADD `linked_suggestion_id` text;--> statement-breakpoint
ALTER TABLE `suggestions` ADD `source_insight_id` text REFERENCES insights(id);