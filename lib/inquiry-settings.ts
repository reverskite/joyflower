import { turnstileConfigured } from './inquiry-turnstile.ts';

export const consentPurpose = '견적 산정, 요청 내용 확인 및 상담 연락';
export const consentItems = '이름 또는 담당자명, 전화번호, 서비스 유형, 현장 지역, 요청사항, 예산·희망 일정, 선택한 참고 사례, 동의 이력';

export type InquirySettings = {
  enabled: boolean;
  localTest: boolean;
  version: string;
  retention: string;
  contact: string;
  purpose: string;
  items: string;
  turnstileSiteKey: string;
};

export function inquirySettings(env: Cloudflare.Env, hostname: string): InquirySettings {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const localTest = loopback && env.INQUIRY_LOCAL_TEST_MODE === 'true';
  const version = localTest ? 'local-test-v1' : (env.INQUIRY_PRIVACY_VERSION || '').trim();
  const retention = localTest
    ? '로컬 개발 검증용 테스트 데이터이며 검증 후 개발자가 삭제합니다. 실제 고객 정보는 입력하지 마세요.'
    : (env.INQUIRY_RETENTION_NOTICE || '').trim();
  const contact = localTest
    ? '로컬 개발 테스트 담당자 (운영 문의처 아님)'
    : (env.INQUIRY_PRIVACY_CONTACT || '').trim();
  return {
    enabled: env.INQUIRY_INTAKE_ENABLED === 'true' && !!env.DB &&
      /^[a-zA-Z0-9._-]{1,80}$/.test(version) && retention.length > 0 && retention.length <= 1000 &&
      contact.length > 0 && contact.length <= 500 && (env.INQUIRY_RATE_LIMIT_SECRET?.length || 0) >= 32 &&
      (localTest || turnstileConfigured(env, hostname)),
    localTest, version, retention, contact, purpose: consentPurpose, items: consentItems,
    // A configured public dummy sitekey can exercise the widget on loopback fixtures.
    // Local-test server bypass is separate from the offline production Siteverify tests.
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  };
}
