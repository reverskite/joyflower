import type { KakaoAlimtalkConfig, KakaoAlimtalkMessage, KakaoAlimtalkSender, PermanentFailure } from './kakao-alimtalk';
import { createMockTransport, type MockLedger, type MockScenario } from './notification-mock-transport';

export function createKakaoAlimtalkMockSender(scenario: MockScenario = 'normal', ledger: MockLedger = new Map(),
  permanentReason: PermanentFailure = 'template_error'): KakaoAlimtalkSender {
  return createMockTransport<KakaoAlimtalkMessage, KakaoAlimtalkConfig>(
    config => [config.provider, config.senderProfileId, config.recipientPhone], scenario, ledger, permanentReason);
}
export const kakaoAlimtalkMockSender = createKakaoAlimtalkMockSender();
