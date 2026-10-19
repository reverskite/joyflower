import { z } from 'zod';
import { portfolioItems } from '../app/portfolio-data';
import { serviceGuides } from '../app/inquiry/service-fields';
import { inquirySettings } from './inquiry-settings';
import { discardRequestBody } from './request-body';
import { verifyInquiryChallenge } from './inquiry-turnstile';

const MAX_BODY_BYTES = 16_384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const shortText = (max: number, min = 0) => z.string().trim().min(min).max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
const payloadSchema = z.object({
  service: z.enum(['christmas', 'planterior', 'landscape']),
  region: shortText(100, 1),
  budget: shortText(100),
  requests: z.record(z.string(), shortText(2000)),
  reference: shortText(100).optional(),
  customerName: shortText(60, 1),
  phone: z.string().max(30),
  consent: z.literal(true),
  consentVersion: shortText(80, 1),
  website: z.literal(''),
  turnstileToken: z.string().max(2048).optional(),
}).strict();

function reply(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers,
  } });
}

async function readLimitedJson(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

type ReceiptRow = { receipt_id: string; fingerprint: string };

export async function handleInquiry(request: Request, env: Cloudflare.Env): Promise<Response> {
  try { return await processInquiry(request, env); }
  finally { await discardRequestBody(request); }
}

async function processInquiry(request: Request, env: Cloudflare.Env): Promise<Response> {
  if (request.method !== 'POST') return reply(405, { error: '허용되지 않은 요청입니다.' }, { Allow: 'POST' });
  const url = new URL(request.url);
  // JSON-only, same-origin requests. No CORS or unauthenticated read endpoint.
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site')
    return reply(403, { error: '홈페이지 문의 화면에서 다시 제출해주세요.' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    return reply(415, { error: '지원하지 않는 요청 형식입니다.' });
  const idempotencyKey = request.headers.get('idempotency-key') || '';
  if (!UUID.test(idempotencyKey)) return reply(400, { error: '접수 요청을 확인할 수 없습니다. 페이지를 새로 열어주세요.' });
  const settings = inquirySettings(env, url.hostname);
  if (!settings.enabled || !env.DB) return reply(503, { error: '온라인 접수를 준비 중입니다. 잠시 후 다시 이용해주세요.' });
  if (!settings.localTest && url.protocol !== 'https:') return reply(403, { error: '안전한 홈페이지 연결에서 다시 제출해주세요.' });

  let raw: unknown;
  try { raw = await readLimitedJson(request); }
  catch (error) { return reply(error instanceof RangeError ? 413 : 400, { error: '문의 데이터 형식 또는 길이를 확인해주세요.' }); }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return reply(400, { error: '필수 입력값과 개인정보 동의를 확인해주세요.' });
  const data = parsed.data;
  if (data.consentVersion !== settings.version) return reply(409, { error: '개인정보 안내가 변경되었습니다. 내용을 별도로 복사한 뒤 페이지를 새로 열어주세요.' });
  const phone = data.phone.trim().replace(/^\+82\s?/, '0').replace(/[\s()-]/g, '');
  if (!/^(?:02\d{7,8}|01[016789]\d{7,8}|0[3-6][1-5]\d{7,8}|070\d{8})$/.test(phone))
    return reply(400, { error: '연락받을 전화번호를 확인해주세요.' });
  const guide = serviceGuides[data.service];
  const allowed = new Set([...guide.fields.map(field => field.key), 'details']);
  if (Object.entries(data.requests).some(([key, value]) => !allowed.has(key) || value.length > (key === 'details' ? 2000 : 200)))
    return reply(400, { error: '선택한 서비스의 입력 항목을 확인해주세요.' });
  const reference = data.reference ? portfolioItems.find(item => item.slug === data.reference && item.category === data.service) : undefined;
  if (data.reference && !reference) return reply(400, { error: '선택한 참고 사례를 확인해주세요.' });
  const requests = Object.fromEntries([...guide.fields.map(field => field.key), 'details'].map(key => [key, data.requests[key] || '']));
  const normalized = { service: data.service, region: data.region, budget: data.budget, requests,
    reference: reference?.slug || '', customerName: data.customerName, phone, consentVersion: data.consentVersion };
  const ip = settings.localTest ? 'loopback-test' : request.headers.get('cf-connecting-ip');
  if (!ip) return reply(503, { error: '접수 환경을 확인할 수 없습니다. 잠시 후 다시 이용해주세요.' });
  if (!settings.localTest) {
    const challenge = await verifyInquiryChallenge(data.turnstileToken, env, url.hostname, ip);
    if (challenge !== 'valid') return reply(challenge === 'invalid' ? 403 : 503,
      { error: challenge === 'invalid' ? '자동 접수 방지 확인을 다시 진행해주세요.' : '자동 접수 방지 확인에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
  const now = Date.now();
  const db = env.DB;
  try {
    const fingerprint = await hmac(env.INQUIRY_RATE_LIMIT_SECRET!, 'payload:' + JSON.stringify(normalized));
    const existing = await db.prepare('SELECT receipt_id, fingerprint FROM inquiries WHERE idempotency_key = ?1')
      .bind(idempotencyKey).first<ReceiptRow>();
    if (existing) return existing.fingerprint === fingerprint
      ? reply(200, { receiptId: existing.receipt_id, duplicate: true })
      : reply(409, { error: '같은 접수 요청의 내용이 변경되었습니다. 다시 제출해주세요.' });

    const buckets = [
      { value: `ip:${ip}`, duration: 10 * 60_000, limit: 10 },
      { value: `phone:${phone}`, duration: 30 * 60_000, limit: 3 },
    ];
    const statements = [db.prepare('DELETE FROM inquiry_rate_limits WHERE expires_at <= ?1').bind(now)];
    for (const bucket of buckets) {
      const hash = await hmac(env.INQUIRY_RATE_LIMIT_SECRET!, bucket.value);
      const start = Math.floor(now / bucket.duration) * bucket.duration;
      statements.push(db.prepare(`INSERT INTO inquiry_rate_limits (bucket_key, attempts, expires_at)
        VALUES (?1, 1, ?2) ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1 RETURNING attempts`)
        .bind(`${hash}:${start}`, start + bucket.duration));
    }
    const limits = await db.batch<{ attempts: number }>(statements);
    if (limits.some(result => !result.success)) throw new Error('storage');
    if (buckets.some((bucket, index) => (limits[index + 1].results[0]?.attempts || 0) > bucket.limit))
      return reply(429, { error: '접수 요청이 많습니다. 잠시 후 다시 시도해주세요.' }, { 'Retry-After': '1800' });

    const receiptId = 'JF-' + crypto.randomUUID();
    // A single atomic INSERT also prevents identical submissions with different keys.
    const saved = await db.prepare(`INSERT INTO inquiries
      (receipt_id, idempotency_key, fingerprint, service, region, requests_json, budget, reference_slug,
       customer_name, phone, consent, consent_version, consent_notice_json, created_at, status)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?12, ?13, 'new'
      WHERE NOT EXISTS (SELECT 1 FROM inquiries WHERE fingerprint = ?3 AND created_at >= ?14)
      ON CONFLICT(idempotency_key) DO NOTHING RETURNING receipt_id`)
      .bind(receiptId, idempotencyKey, fingerprint, data.service, data.region, JSON.stringify(requests),
        data.budget, reference?.slug || null, data.customerName, phone, settings.version,
        JSON.stringify({ purpose: settings.purpose, items: settings.items, retention: settings.retention, contact: settings.contact }),
        now, now - 10 * 60_000).first<{ receipt_id: string }>();
    if (saved) return reply(201, { receiptId: saved.receipt_id });
    const raced = await db.prepare('SELECT receipt_id, fingerprint FROM inquiries WHERE idempotency_key = ?1').bind(idempotencyKey).first<ReceiptRow>();
    if (raced && raced.fingerprint !== fingerprint) return reply(409, { error: '접수 요청을 다시 확인해주세요.' });
    const duplicate = raced || await db.prepare('SELECT receipt_id, fingerprint FROM inquiries WHERE fingerprint = ?1 AND created_at >= ?2 LIMIT 1')
      .bind(fingerprint, now - 10 * 60_000).first<ReceiptRow>();
    if (duplicate) return reply(200, { receiptId: duplicate.receipt_id, duplicate: true });
    throw new Error('storage');
  } catch {
    // Do not log request bodies, bound parameters, phone numbers, or D1 error strings.
    return reply(503, { error: '접수 저장을 완료하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 제출해주세요.' });
  }
}
