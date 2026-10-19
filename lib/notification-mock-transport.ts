import type { NotificationSendResult, PermanentFailure } from './notification-send-result';

export type MockScenario = 'normal' | 'temporary_failure' | 'permanent_failure' | 'unknown' | 'accepted' | 'throw';
export type MockLedger = Map<string, { fingerprint: string; result: NotificationSendResult }>;

// Process-local simulation only, never a production exactly-once guarantee.
// Scenarios are module/test seams, never selected by public requests or env flags.
export function createMockTransport<M extends { messageId: string }, C>(
  fingerprintConfig: (config: C) => unknown, scenario: MockScenario = 'normal',
  ledger: MockLedger = new Map(), permanentReason: PermanentFailure = 'provider_rejected',
) {
  return {
    kind: 'mock' as const, provider: 'mock',
    async send(message: M, config: C): Promise<NotificationSendResult> {
      const bytes = new TextEncoder().encode(JSON.stringify([message, fingerprintConfig(config)]));
      const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(x => x.toString(16).padStart(2, '0')).join('');
      const known = ledger.get(message.messageId);
      if (known) {
        if (known.fingerprint !== fingerprint) return { kind: 'permanent_failure', reason: 'configuration_changed' };
        const previous = known.result;
        if (previous.kind === 'mock_sent' || previous.kind === 'accepted' || previous.kind === 'delivered' || previous.kind === 'unknown')
          return { kind: 'duplicate', previous: previous.kind, providerMessageId: previous.providerMessageId };
        return previous;
      }
      if (scenario === 'throw') throw new Error('Mock transport interrupted');
      if (scenario === 'temporary_failure') return { kind: 'temporary_failure' };
      const result: NotificationSendResult = scenario === 'permanent_failure' ? { kind: 'permanent_failure', reason: permanentReason }
        : scenario === 'unknown' ? { kind: 'unknown' } : scenario === 'accepted' ? { kind: 'accepted', providerMessageId: 'mock-' + message.messageId }
          : { kind: 'mock_sent' };
      if (ledger.size >= 1000) ledger.delete(ledger.keys().next().value!);
      ledger.set(message.messageId, { fingerprint, result });
      return result;
    },
    async lookup(messageId: string): Promise<NotificationSendResult> { return ledger.get(messageId)?.result || { kind: 'unknown' }; },
  };
}
