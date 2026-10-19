/// <reference types="vite/client" />
import type { NotificationSendResult } from './notification-send-result';
export type { PermanentFailure } from './notification-send-result';

// Internal domain contract, NOT a proposed provider HTTP API or approved template.
export type KakaoAlimtalkConfig = {
  provider: string;
  senderProfileId: string;
  templateCode: string;
  recipientPhone: string;
  apiAuth?: string;
  adminUrl: string;
};
export type KakaoAlimtalkMessage = {
  channel: 'KAKAO_ALIMTALK';
  messageId: string;
  templateCode: string;
  variables: { receiptNumber: string; receivedAt: string };
  previewText: string;
  button: { label: string; url: string };
};
export type KakaoSendResult = NotificationSendResult;
export interface KakaoAlimtalkSender {
  readonly kind: 'mock' | 'provider';
  readonly provider: string;
  send(message: KakaoAlimtalkMessage, config: KakaoAlimtalkConfig): Promise<KakaoSendResult>;
  // Optional future reconciliation. Never invoked automatically in this release.
  lookup?(messageId: string, config: KakaoAlimtalkConfig): Promise<KakaoSendResult>;
}

export function kakaoAlimtalkConfig(env: Cloudflare.Env, hostname: string): KakaoAlimtalkConfig | null {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      env.INQUIRY_NOTIFICATION_MODE !== 'mock' || env.KAKAO_ALIMTALK_PROVIDER !== 'mock') return null;
  const senderProfileId = env.KAKAO_ALIMTALK_SENDER_PROFILE_ID || '';
  const templateCode = env.KAKAO_ALIMTALK_TEMPLATE_CODE || '';
  // No real number is necessary or accepted by the current mock configuration.
  if (env.KAKAO_ALIMTALK_RECIPIENT_PHONE !== 'TEST_ONLY' ||
      !/^mock-[A-Za-z0-9_-]{1,80}$/.test(senderProfileId) || !/^mock-[A-Za-z0-9_-]{1,80}$/.test(templateCode)) return null;
  try {
    const url = new URL(env.KAKAO_ALIMTALK_ADMIN_URL || '');
    // Exact configured button URL; no token, query, fragment or host-derived URL.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/admin') return null;
    return { provider: 'mock', senderProfileId, templateCode, recipientPhone: 'TEST_ONLY',
      apiAuth: env.KAKAO_ALIMTALK_API_AUTH, adminUrl: url.href };
  } catch { return null; }
}

export function kakaoAlimtalkMessage(job: { receipt_id: string; created_at: number }, config: KakaoAlimtalkConfig): KakaoAlimtalkMessage {
  const receivedAt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(job.created_at)) + ' (한국 시간)';
  return {
    channel: 'KAKAO_ALIMTALK', messageId: 'inquiry-notification/kakao-alimtalk/' + job.receipt_id,
    templateCode: config.templateCode, variables: { receiptNumber: job.receipt_id, receivedAt },
    previewText: `[조이플라워]\n새로운 견적 문의가 접수되었습니다.\n\n접수번호: ${job.receipt_id}\n접수일시: ${receivedAt}\n\n자세한 내용은 관리자 페이지에서 확인해 주세요.`,
    button: { label: '관리자 페이지 확인', url: config.adminUrl },
  };
}
