/// <reference types="vite/client" />
import type { NotificationSendResult } from './notification-send-result';

// Domain contract only. No SOLAPI request, SDK or authentication header is built.
export type SmsConfig = {
  provider: 'mock' | 'solapi'; recipientPhone: string; senderPhone: string;
  apiKey?: string; apiSecret?: string; sendEnabled: boolean;
};
export type SmsMessage = { channel: 'SMS'; type: 'SMS'; messageId: string; text: string };
export interface SmsSender {
  readonly kind: 'mock' | 'provider';
  readonly provider: string;
  send(message: SmsMessage, config: SmsConfig): Promise<NotificationSendResult>;
  // Reserved for authenticated reconciliation, not called automatically today.
  lookup?(messageId: string, config: SmsConfig): Promise<NotificationSendResult>;
}

export const SMS_TEXT = '[조이플라워]\n새 견적이 접수되었습니다.\n관리자 페이지에서 확인하세요.';
// Deliberately narrow, pre-reviewed EUC-KR subset: printable ASCII, LF/CR and
// these template syllables only. Do not guess the bytes of arbitrary Unicode.
const reviewedHangul = new Set('조이플라워새견적접수되었습니다관리자페이지에서확인하세요가');
export function validateSmsText(text: string): { valid: boolean; bytes: number | null } {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || char === '\n' || char === '\r') bytes++;
    else if (reviewedHangul.has(char)) bytes += 2;
    else return { valid: false, bytes: null };
  }
  return { valid: text.trim().length > 0 && bytes <= 90, bytes };
}

export function smsConfig(env: Cloudflare.Env, hostname: string): SmsConfig | null {
  // Explicit false is mandatory. Neither production builds nor real numbers nor
  // selecting solapi can enter this mock-only release, even with valid credentials.
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      env.INQUIRY_NOTIFICATION_MODE !== 'mock' || env.SMS_PROVIDER !== 'mock' ||
      env.SMS_SEND_ENABLED !== 'false' || env.SMS_RECIPIENT_PHONE !== 'TEST_ONLY' ||
      env.SMS_SENDER_PHONE !== 'TEST_ONLY') return null;
  return { provider: 'mock', recipientPhone: 'TEST_ONLY', senderPhone: 'TEST_ONLY', sendEnabled: false };
}

export function smsMessage(job: { receipt_id: string }): SmsMessage {
  if (!validateSmsText(SMS_TEXT).valid) throw new Error('Invalid SMS template');
  // Receipt stays in the stable internal ID, not the short body. No URL or token.
  return { channel: 'SMS', type: 'SMS', messageId: 'inquiry-notification/sms/' + job.receipt_id, text: SMS_TEXT };
}
