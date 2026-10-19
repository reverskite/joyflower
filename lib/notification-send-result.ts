// Internal transport outcomes; provider acceptance is not final delivery.
export type PermanentFailure = 'template_error' | 'auth_error' | 'recipient_error' | 'configuration_changed' | 'provider_rejected';
type Acceptance = 'mock_sent' | 'accepted' | 'delivered' | 'unknown';
export type NotificationSendResult =
  | { kind: Acceptance; providerMessageId?: string }
  | { kind: 'duplicate'; previous: Acceptance; providerMessageId?: string }
  // Retry only a confirmed non-acceptance. Timeouts must return unknown.
  | { kind: 'temporary_failure' }
  | { kind: 'permanent_failure'; reason: PermanentFailure };
