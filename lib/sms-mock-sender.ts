import { createMockTransport, type MockLedger, type MockScenario } from './notification-mock-transport';
import type { PermanentFailure } from './notification-send-result';
import { validateSmsText, type SmsConfig, type SmsMessage, type SmsSender } from './sms';

export function createSmsMockSender(scenario: MockScenario = 'normal', ledger: MockLedger = new Map(),
  permanentReason: PermanentFailure = 'provider_rejected'): SmsSender {
  const mock = createMockTransport<SmsMessage, SmsConfig>(
    config => [config.provider, config.senderPhone, config.recipientPhone], scenario, ledger, permanentReason);
  return { ...mock, async send(message, config) {
    // No truncation, LMS upgrade, subject or external transport.
    if (message.channel !== 'SMS' || message.type !== 'SMS' || !validateSmsText(message.text).valid)
      return { kind: 'permanent_failure', reason: 'provider_rejected' };
    return mock.send(message, config);
  } };
}
export const smsMockSender = createSmsMockSender();
