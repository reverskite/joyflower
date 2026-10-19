CREATE TABLE `inquiries` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`service` text NOT NULL,
	`region` text NOT NULL,
	`requests_json` text NOT NULL,
	`budget` text NOT NULL,
	`reference_slug` text,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`consent` integer NOT NULL,
	`consent_version` text NOT NULL,
	`consent_notice_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	CONSTRAINT "inquiries_service_check" CHECK("inquiries"."service" IN ('christmas', 'planterior', 'landscape')),
	CONSTRAINT "inquiries_status_check" CHECK("inquiries"."status" IN ('new', 'reviewing', 'completed')),
	CONSTRAINT "inquiries_consent_check" CHECK("inquiries"."consent" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_idempotency` ON `inquiries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `inquiries_fingerprint_time` ON `inquiries` (`fingerprint`,`created_at`);--> statement-breakpoint
CREATE INDEX `inquiries_status_time` ON `inquiries` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `inquiry_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inquiry_rate_expiry` ON `inquiry_rate_limits` (`expires_at`);