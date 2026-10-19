CREATE TABLE `inquiry_status_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`changed_at` integer NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`receipt_id`) REFERENCES `inquiries`(`receipt_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `inquiry_history_receipt` ON `inquiry_status_history` (`receipt_id`,`id`);--> statement-breakpoint
ALTER TABLE `inquiries` ADD `status_updated_at` integer;--> statement-breakpoint
ALTER TABLE `inquiries` ADD `status_version` integer DEFAULT 0 NOT NULL;