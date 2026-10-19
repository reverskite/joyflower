CREATE TABLE `inquiry_notification_channels` (
	`channel` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "notification_routing_channel_check" CHECK("inquiry_notification_channels"."channel" IN ('EMAIL','KAKAO_ALIMTALK')),
	CONSTRAINT "notification_routing_enabled_check" CHECK("inquiry_notification_channels"."enabled" IN (0,1))
);
--> statement-breakpoint
-- D1 data-preserving rebuild. Keep foreign keys enabled; only the child table changes.
DROP TRIGGER `inquiry_notification_created`;
--> statement-breakpoint
CREATE TABLE `__new_inquiry_notifications` (
	`receipt_id` text NOT NULL,
	`channel` text DEFAULT 'EMAIL' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`completed_at` integer,
	`last_error` text,
	`provider_message_id` text,
	PRIMARY KEY(`receipt_id`, `channel`),
	FOREIGN KEY (`receipt_id`) REFERENCES `inquiries`(`receipt_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inquiry_notification_channel_check" CHECK("__new_inquiry_notifications"."channel" IN ('EMAIL','KAKAO_ALIMTALK')),
	CONSTRAINT "inquiry_notification_status_check" CHECK("__new_inquiry_notifications"."status" IN ('pending','processing','mock_sent','sent','accepted','delivered','failed','unknown')),
	CONSTRAINT "inquiry_notification_attempts_check" CHECK("__new_inquiry_notifications"."attempts" >= 0),
	CONSTRAINT "inquiry_notification_error_check" CHECK("__new_inquiry_notifications"."last_error" IS NULL OR "__new_inquiry_notifications"."last_error" IN ('sender_failed','attempts_exhausted','outcome_unknown','template_error','auth_error','recipient_error','configuration_changed','provider_rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_inquiry_notifications`("receipt_id", "channel", "status", "attempts", "created_at", "next_attempt_at", "lease_token", "lease_until", "completed_at", "last_error") SELECT "receipt_id", 'EMAIL', "status", "attempts", "created_at", "next_attempt_at", "lease_token", "lease_until", "completed_at", "last_error" FROM `inquiry_notifications`;--> statement-breakpoint
DROP TABLE `inquiry_notifications`;--> statement-breakpoint
ALTER TABLE `__new_inquiry_notifications` RENAME TO `inquiry_notifications`;--> statement-breakpoint
CREATE INDEX `inquiry_notification_due` ON `inquiry_notifications` (`status`,`next_attempt_at`);
--> statement-breakpoint
INSERT INTO `inquiry_notification_channels` (`channel`,`enabled`) VALUES ('EMAIL',1),('KAKAO_ALIMTALK',0);
--> statement-breakpoint
-- One job per selected channel for future receipts only. No Kakao backfill.
CREATE TRIGGER `inquiry_notification_created` AFTER INSERT ON `inquiries`
BEGIN
  INSERT INTO `inquiry_notifications` (`receipt_id`,`channel`,`created_at`,`next_attempt_at`)
  SELECT NEW.receipt_id, channel, NEW.created_at, NEW.created_at
  FROM `inquiry_notification_channels` WHERE enabled=1;
END;
