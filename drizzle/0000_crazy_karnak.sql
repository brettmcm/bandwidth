CREATE TABLE `blackouts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text DEFAULT 'asana' NOT NULL,
	`official_title` text NOT NULL,
	`display_title` text NOT NULL,
	`title_overridden` integer DEFAULT false NOT NULL,
	`official_due_on` text,
	`landing_start` text,
	`landing_end` text,
	`landing_overridden` integer DEFAULT false NOT NULL,
	`confidence` text DEFAULT 'tentative' NOT NULL,
	`prep_days` integer DEFAULT 3 NOT NULL,
	`primary_area` text DEFAULT 'Needs tagging' NOT NULL,
	`supporting_areas` text DEFAULT '[]' NOT NULL,
	`request_type` text,
	`requester` text,
	`priority` text,
	`size_band` text,
	`summary` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`asana_url` text,
	`slack_url` text,
	`obsidian_url` text,
	`source_payload` text DEFAULT '{}' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`last_synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
