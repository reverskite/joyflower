CREATE TABLE `inquiry_notifications` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`completed_at` integer,
	`last_error` text,
	FOREIGN KEY (`receipt_id`) REFERENCES `inquiries`(`receipt_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inquiry_notification_status_check" CHECK("inquiry_notifications"."status" IN ('pending','processing','mock_sent','sent','failed')),
	CONSTRAINT "inquiry_notification_attempts_check" CHECK("inquiry_notifications"."attempts" >= 0),
	CONSTRAINT "inquiry_notification_error_check" CHECK("inquiry_notifications"."last_error" IS NULL OR "inquiry_notifications"."last_error" IN ('sender_failed','attempts_exhausted'))
);
--> statement-breakpoint
CREATE INDEX `inquiry_notification_due` ON `inquiry_notifications` (`status`,`next_attempt_at`);
--> statement-breakpoint
-- This trigger is intentionally hand-maintained (Drizzle snapshots omit triggers).
-- Runs inside the inquiry INSERT transaction; no existing inquiries are backfilled.
CREATE TRIGGER `inquiry_notification_created` AFTER INSERT ON `inquiries`
BEGIN
  INSERT INTO `inquiry_notifications` (`receipt_id`,`created_at`,`next_attempt_at`)
  VALUES (NEW.receipt_id, NEW.created_at, NEW.created_at);
END;
