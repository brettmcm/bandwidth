ALTER TABLE `work_items` ADD `scheduling_state` text DEFAULT 'not_reviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `scheduling_summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `scheduling_options` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_items` ADD `scheduling_owner` text;--> statement-breakpoint
ALTER TABLE `work_items` ADD `scheduling_source_url` text;