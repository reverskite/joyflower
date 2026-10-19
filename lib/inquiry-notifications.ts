/// <reference types="vite/client" />
import { kakaoAlimtalkConfig, kakaoAlimtalkMessage, type KakaoAlimtalkSender } from './kakao-alimtalk';
import { smsConfig, smsMessage, type SmsSender } from './sms';
import type { NotificationSendResult } from './notification-send-result';

export type NotificationMessage = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

// A future provider adapter MUST honor idempotencyKey across retries and return
// only after acceptance. Never log provider responses or customer/request data.
export interface MockNotificationSender {
  readonly kind: 'mock';
  send(message: NotificationMessage): Promise<void>;
}

const MAX_ATTEMPTS = 5;
const LEASE_MS = 60_000;
type Job = { receipt_id: string; channel: 'EMAIL' | 'KAKAO_ALIMTALK' | 'SMS'; created_at: number; attempts: number };

export function notificationConfig(env: Cloudflare.Env, hostname: string) {
  // Hard production gate, independent of environment flags or caller credentials.
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
      env.INQUIRY_NOTIFICATION_MODE !== 'mock') return null;
  const to = env.INQUIRY_NOTIFICATION_TO?.trim() || '';
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(to) || to.length > 254) return null;
  try {
    const origin = new URL(env.INQUIRY_NOTIFICATION_ADMIN_ORIGIN || '');
    // Use configured origins only; never trust the submission Host header for email links.
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash ||
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) return null;
    return { to, origin: origin.origin };
  } catch { return null; }
}

export function notificationMessage(job: Job, config: { to: string; origin: string }): NotificationMessage {
  const when = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(job.created_at));
  return {
    to: config.to,
    subject: '[조이플라워] 새로운 견적 문의가 접수되었습니다.',
    text: `접수번호: ${job.receipt_id}\n접수 일시: ${when} (한국 시간)\n관리자 화면: ${config.origin}/admin/inquiries/${encodeURIComponent(job.receipt_id)}\n`,
    idempotencyKey: 'inquiry-notification/' + job.receipt_id,
  };
}

export function notificationMockChannels(env: Cloudflare.Env, hostname: string) {
  return [notificationConfig(env, hostname) ? 'EMAIL' : '', kakaoAlimtalkConfig(env, hostname) ? 'KAKAO_ALIMTALK' : '',
    smsConfig(env, hostname) ? 'SMS' : ''].filter(Boolean);
}

// Reusable dispatcher seam for future scheduled/queue consumers. Today only a
// development loopback request can reach a mock. No external transport exists.
export async function processNotificationBatch(env: Cloudflare.Env, hostname: string,
  options: { now?: number; sender?: MockNotificationSender; kakaoSender?: KakaoAlimtalkSender; smsSender?: SmsSender } = {}) {
  const config = notificationConfig(env, hostname);
  const kakaoConfig = kakaoAlimtalkConfig(env, hostname);
  const sms = smsConfig(env, hostname);
  if ((!config && !kakaoConfig && !sms) || !env.DB) return { enabled: false, processed: 0, mockSent: 0, failed: 0, accepted: 0, unknown: 0 };
  const sender = config ? options.sender || (await import('./notification-mock-sender')).mockNotificationSender : null;
  const kakaoSender = kakaoConfig ? options.kakaoSender || (await import('./kakao-alimtalk-mock-sender')).kakaoAlimtalkMockSender : null;
  const smsSender = sms ? options.smsSender || (await import('./sms-mock-sender')).smsMockSender : null;
  if ((sender && sender.kind !== 'mock') || (kakaoSender && (kakaoSender.kind !== 'mock' || kakaoSender.provider !== 'mock')) ||
      (smsSender && (smsSender.kind !== 'mock' || smsSender.provider !== 'mock')))
    throw new Error('Unsupported sender');
  const db = env.DB;
  const now = options.now ?? Date.now();
  const result = { enabled: true, processed: 0, mockSent: 0, failed: 0, accepted: 0, unknown: 0 };
  // A phone-channel worker may have reached the provider before dying. Never blindly resend.
  await db.prepare(`UPDATE inquiry_notifications SET status='unknown', last_error='outcome_unknown',
    lease_token=NULL, lease_until=NULL WHERE channel IN ('KAKAO_ALIMTALK','SMS') AND status='processing' AND lease_until <= ?`)
    .bind(now).run();
  // A worker killed during the final attempt must not leave an eternal lease.
  await db.prepare(`UPDATE inquiry_notifications SET status='failed', last_error='attempts_exhausted',
    lease_token=NULL, lease_until=NULL WHERE channel='EMAIL' AND status='processing' AND lease_until <= ? AND attempts >= ?`)
    .bind(now, MAX_ATTEMPTS).run();
  for (let i = 0; i < 10; i++) {
    const token = crypto.randomUUID();
    // One atomic claim. Two dispatchers cannot send a live lease concurrently.
    const job = await db.prepare(`UPDATE inquiry_notifications SET status='processing',
      attempts=attempts+1, lease_token=?1, lease_until=?2
      WHERE rowid=(SELECT n.rowid FROM inquiry_notifications n
        JOIN inquiry_notification_channels c ON c.channel=n.channel AND c.enabled=1
        WHERE n.channel IN (?5,?6,?7) AND attempts < ?3 AND ((status='pending' AND next_attempt_at <= ?4)
          OR (n.channel='EMAIL' AND status='processing' AND lease_until <= ?4))
        ORDER BY next_attempt_at, receipt_id, n.channel LIMIT 1)
      RETURNING receipt_id, channel, created_at, attempts`)
      .bind(token, now + LEASE_MS, MAX_ATTEMPTS, now, config ? 'EMAIL' : '', kakaoConfig ? 'KAKAO_ALIMTALK' : '', sms ? 'SMS' : '').first<Job>();
    if (!job) break;
    result.processed++;
    let outcome: NotificationSendResult;
    try {
      if (job.channel === 'KAKAO_ALIMTALK') outcome = await kakaoSender!.send(kakaoAlimtalkMessage(job, kakaoConfig!), kakaoConfig!);
      else if (job.channel === 'SMS') outcome = await smsSender!.send(smsMessage(job), sms!);
      else { await sender!.send(notificationMessage(job, config!)); outcome = { kind: 'mock_sent' }; }
    } catch {
      // Phone-channel exceptions/timeouts are ambiguous, not retryable failures.
      outcome = { kind: job.channel === 'EMAIL' ? 'temporary_failure' : 'unknown' };
    }
    const kind = outcome.kind === 'duplicate' ? outcome.previous : outcome.kind;
    let status: string = 'unknown'; let error: string | null = 'outcome_unknown';
    let nextAttempt = now; let completed: number | null = null;
    if (kind === 'mock_sent' || kind === 'accepted' || kind === 'delivered' || kind === 'unknown') {
      status = kind; error = kind === 'unknown' ? 'outcome_unknown' : null;
      if (kind === 'mock_sent' || kind === 'delivered') completed = now;
    } else if (outcome.kind === 'temporary_failure') {
      status = job.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'; error = 'sender_failed';
      nextAttempt = now + Math.min(60_000 * 2 ** (job.attempts - 1), 3_600_000);
    } else if (outcome.kind === 'permanent_failure') { status = 'failed'; error = outcome.reason; }
    // Completion errors leave the lease intact: a future phone-channel run quarantines it.
    // Never turn an acknowledgement-storage failure into a retryable send error.
    const updated = await db.prepare(`UPDATE inquiry_notifications SET status=?, next_attempt_at=?, completed_at=?,
      last_error=?, provider_message_id=?, lease_token=NULL, lease_until=NULL
      WHERE receipt_id=? AND channel=? AND lease_token=? AND status='processing'`)
      .bind(status, nextAttempt, completed, error,
        'providerMessageId' in outcome ? outcome.providerMessageId || null : null, job.receipt_id, job.channel, token).run();
    if (updated.meta.changes) {
      if (status === 'mock_sent') result.mockSent++;
      else if (status === 'accepted' || status === 'delivered') result.accepted++;
      else if (status === 'unknown') result.unknown++;
      else result.failed++;
    }
  }
  return result;
}
