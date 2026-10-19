import { z } from 'zod';
import { authenticateAdmin, adminReply, sameOrigin, discardAdminBody } from './admin-auth';
import { inquiryRetention, type RetentionRecord, type RetentionChange } from './inquiry-retention';
const receiptPattern = /^JF-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const statusSchema = z.enum(['new', 'reviewing', 'completed']);
const querySchema = z.object({
  service: z.enum(['christmas', 'planterior', 'landscape']).optional(), status: statusSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1), pageSize: z.enum(['20', '50', '100']).default('20'),
  receipt: z.string().max(39).regex(/^[JF0-9a-f-]*$/i).optional(),
}).strict();
function koreaDate(value: string) {
  const utc = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) throw new Error('date');
  return utc - 9 * 3_600_000;
}
export async function handleAdminInquiries(request: Request, env: Cloudflare.Env, id?: string, summary = false): Promise<Response> {
  const admin = await authenticateAdmin(request, env);
  if (!admin) { await discardAdminBody(request); return adminReply(401, { error: '관리자 인증이 필요합니다.' }); }
  if (!env.DB) return adminReply(503, { error: '관리자 저장소를 준비 중입니다.' });
  if (id && !receiptPattern.test(id)) return adminReply(400, { error: '접수번호 형식을 확인해주세요.' });
  const db = env.DB;
  try {
    if (request.method === 'GET' && summary) {
      const result = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'new'),0) AS new,
        COALESCE(SUM(status = 'reviewing'),0) AS reviewing, COALESCE(SUM(status = 'completed'),0) AS completed FROM inquiries`).first();
      return adminReply(200, result);
    }
    if (request.method === 'GET' && id) {
      const row = await db.prepare(`SELECT receipt_id, service, region, requests_json, budget, reference_slug,
        customer_name, phone, consent, consent_version, consent_notice_json, created_at, status,
        status_updated_at, status_version FROM inquiries WHERE receipt_id = ?`).bind(id).first<RetentionRecord & Record<string, unknown>>();
      if (!row) return adminReply(404, { error: '접수 내역이 없습니다.' });
      const history = await db.prepare(`SELECT previous_status, next_status, changed_at, actor
        FROM inquiry_status_history WHERE receipt_id = ? ORDER BY id DESC LIMIT 100`).bind(id).all<RetentionChange>();
      return adminReply(200, { inquiry: row, history: history.results, retention: inquiryRetention(row, history.results[0]) });
    }
    if (request.method === 'GET' && !id) {
      const params = new URL(request.url).searchParams;
      if ([...params.keys()].some(k => params.getAll(k).length !== 1)) return adminReply(400, { error: '필터 형식을 확인해주세요.' });
      const parsed = querySchema.safeParse(Object.fromEntries(params));
      if (!parsed.success) return adminReply(400, { error: '필터 형식을 확인해주세요.' });
      const query = parsed.data;
      const conditions: string[] = []; const values: (string | number)[] = [];
      for (const key of ['service', 'status'] as const) if (query[key]) { conditions.push(key + ' = ?'); values.push(query[key]); }
      try {
        const from = query.from ? koreaDate(query.from) : undefined;
        const to = query.to ? koreaDate(query.to) + 86_400_000 : undefined;
        if (from !== undefined && to !== undefined && from >= to) throw new Error('date');
        if (from !== undefined) { conditions.push('created_at >= ?'); values.push(from); }
        if (to !== undefined) { conditions.push('created_at < ?'); values.push(to); }
      } catch { return adminReply(400, { error: '접수일 범위를 확인해주세요.' }); }
      if (query.receipt) { conditions.push('receipt_id LIKE ?'); values.push(query.receipt + '%'); }
      const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
      const size = Number(query.pageSize);
      const results = await db.batch<Record<string, string | number>>([
        db.prepare('SELECT COUNT(*) AS total FROM inquiries' + where).bind(...values),
        db.prepare(`SELECT receipt_id, service, region, budget, created_at, status, status_updated_at, status_version
          FROM inquiries${where} ORDER BY created_at DESC, receipt_id DESC LIMIT ? OFFSET ?`).bind(...values, size, (query.page - 1) * size),
      ]);
      return adminReply(200, { items: results[1].results, total: results[0].results[0].total, page: query.page, pageSize: size });
    }
    if (request.method === 'PATCH' && id) {
      if (!sameOrigin(request)) return adminReply(403, { error: '요청 출처를 확인해주세요.' });
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return adminReply(415, { error: 'JSON 요청이 필요합니다.' });
      const reader = request.body?.getReader();
      if (!reader) return adminReply(400, { error: '변경 내용을 확인해주세요.' });
      let text = ''; let bytes = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 1024) { await reader.cancel(); return adminReply(413, { error: '요청이 너무 큽니다.' }); }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return adminReply(400, { error: '변경 내용을 확인해주세요.' }); }
      const parsed = z.object({ status: statusSchema, version: z.number().int().min(0).max(2_147_483_647) }).strict().safeParse(raw);
      if (!parsed.success) return adminReply(400, { error: '허용된 상태와 버전을 확인해주세요.' });
      const { status, version } = parsed.data;
      const current = await db.prepare('SELECT status, status_version FROM inquiries WHERE receipt_id = ?').bind(id).first<{ status: string; status_version: number }>();
      if (!current) return adminReply(404, { error: '접수 내역이 없습니다.' });
      if (current.status === status && (current.status_version === version || current.status_version === version + 1))
        return adminReply(200, { status, version: current.status_version, unchanged: true });
      if (current.status_version !== version) return adminReply(409, { error: '다른 작업에서 상태가 변경되었습니다. 새로 조회해주세요.' });
      const now = Date.now();
      // D1 batch is transactional: audit insert and versioned update are atomic.
      const result = await db.batch<{ status: string; status_version: number }>([
        db.prepare(`INSERT INTO inquiry_status_history (receipt_id, previous_status, next_status, changed_at, actor)
          SELECT receipt_id, status, ?, ?, ? FROM inquiries WHERE receipt_id = ? AND status_version = ? AND status != ?`)
          .bind(status, now, admin.mode + ':' + admin.subject, id, version, status),
        db.prepare(`UPDATE inquiries SET status = ?, status_updated_at = ?, status_version = status_version + 1
          WHERE receipt_id = ? AND status_version = ? AND status != ? RETURNING status, status_version`).bind(status, now, id, version, status),
      ]);
      const updated = result[1].results[0];
      if (!updated) return adminReply(409, { error: '상태가 변경되었습니다. 새로 조회해주세요.' });
      return adminReply(200, { status: updated.status, version: updated.status_version });
    }
    return adminReply(405, { error: '허용되지 않은 요청입니다.' });
  } catch { return adminReply(503, { error: '관리자 작업을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.' }); }
}
