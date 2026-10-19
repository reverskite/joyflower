import type { MockNotificationSender } from './inquiry-notifications';

// Intentionally no fetch, SDK, console output or persistent message/recipient storage.
// "mock_sent" means simulated acceptance, never actual delivery.
export const mockNotificationSender: MockNotificationSender = {
  kind: 'mock',
  async send() {},
};
