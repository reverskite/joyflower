import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const inquiries = sqliteTable('inquiries', {
  receiptId: text('receipt_id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull(),
  fingerprint: text('fingerprint').notNull(),
  service: text('service', { enum: ['christmas', 'planterior', 'landscape'] }).notNull(),
  region: text('region').notNull(),
  requestsJson: text('requests_json').notNull(),
  budget: text('budget').notNull(),
  referenceSlug: text('reference_slug'),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull(),
  consent: integer('consent', { mode: 'boolean' }).notNull(),
  consentVersion: text('consent_version').notNull(),
  consentNoticeJson: text('consent_notice_json').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status', { enum: ['new', 'reviewing', 'completed'] }).notNull().default('new'),
  statusUpdatedAt: integer('status_updated_at'),
  statusVersion: integer('status_version').notNull().default(0),
}, table => [
  uniqueIndex('inquiries_idempotency').on(table.idempotencyKey),
  index('inquiries_fingerprint_time').on(table.fingerprint, table.createdAt),
  index('inquiries_status_time').on(table.status, table.createdAt),
  check('inquiries_service_check', sql`${table.service} IN ('christmas', 'planterior', 'landscape')`),
  check('inquiries_status_check', sql`${table.status} IN ('new', 'reviewing', 'completed')`),
  check('inquiries_consent_check', sql`${table.consent} = 1`),
]);

// HMAC bucket identifiers only; raw IP addresses are never persisted.
export const inquiryRateLimits = sqliteTable('inquiry_rate_limits', {
  bucketKey: text('bucket_key').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('inquiry_rate_expiry').on(table.expiresAt)]);

export const inquiryStatusHistory = sqliteTable('inquiry_status_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  receiptId: text('receipt_id').notNull().references(() => inquiries.receiptId, { onDelete: 'cascade' }),
  previousStatus: text('previous_status').notNull(),
  nextStatus: text('next_status').notNull(),
  changedAt: integer('changed_at').notNull(),
  actor: text('actor').notNull(),
}, table => [index('inquiry_history_receipt').on(table.receiptId, table.id)]);

// The companion SQL migration also installs the atomic INSERT outbox trigger.
export const inquiryNotifications = sqliteTable('inquiry_notifications', {
  receiptId: text('receipt_id').notNull().references(() => inquiries.receiptId, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['EMAIL', 'KAKAO_ALIMTALK', 'SMS'] }).notNull().default('EMAIL'),
  status: text('status', { enum: ['pending', 'processing', 'mock_sent', 'sent', 'accepted', 'delivered', 'failed', 'unknown'] }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  nextAttemptAt: integer('next_attempt_at').notNull(),
  leaseToken: text('lease_token'),
  leaseUntil: integer('lease_until'),
  completedAt: integer('completed_at'),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
}, table => [
  primaryKey({ columns: [table.receiptId, table.channel] }),
  index('inquiry_notification_due').on(table.status, table.nextAttemptAt),
  check('inquiry_notification_channel_check', sql`${table.channel} IN ('EMAIL','KAKAO_ALIMTALK','SMS')`),
  check('inquiry_notification_status_check', sql`${table.status} IN ('pending','processing','mock_sent','sent','accepted','delivered','failed','unknown')`),
  check('inquiry_notification_attempts_check', sql`${table.attempts} >= 0`),
  check('inquiry_notification_error_check', sql`${table.lastError} IS NULL OR ${table.lastError} IN ('sender_failed','attempts_exhausted','outcome_unknown','template_error','auth_error','recipient_error','configuration_changed','provider_rejected')`),
]);

// Explicit outbox routing: EMAIL=1/KAKAO=0/SMS=0 by default. Does not enable transport.
export const inquiryNotificationChannels = sqliteTable('inquiry_notification_channels', {
  channel: text('channel', { enum: ['EMAIL', 'KAKAO_ALIMTALK', 'SMS'] }).primaryKey(),
  enabled: integer('enabled').notNull().default(0),
}, table => [
  check('notification_routing_channel_check', sql`${table.channel} IN ('EMAIL','KAKAO_ALIMTALK','SMS')`),
  check('notification_routing_enabled_check', sql`${table.enabled} IN (0,1)`),
]);
