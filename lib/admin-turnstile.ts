import { authenticateAdmin, adminReply, sameOrigin, discardAdminBody } from './admin-auth';
import { verifyInquiryChallenge } from './inquiry-turnstile';

// Deliberately has no database or notification dependency.
export async function handleAdminTurnstile(request: Request, env: Cloudflare.Env) {
  try {
    if (!await authenticateAdmin(request, env)) return adminReply(401, { error: '관리자 인증이 필요합니다.' });
    if (request.method !== 'POST') return adminReply(405, { error: 'POST 요청이 필요합니다.' }, { Allow: 'POST' });
    if (!sameOrigin(request)) return adminReply(403, { error: '요청 출처를 확인해주세요.' });
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.search) return adminReply(400, { error: '진단 요청 주소를 확인해주세요.' });
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
      return adminReply(415, { error: 'JSON 요청이 필요합니다.' });
    const reader = request.body?.getReader();
    if (!reader) return adminReply(400, { error: '진단 요청을 확인해주세요.' });
    let size = 0; let text = '';
    const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) { await reader.cancel(); return adminReply(413, { error: '요청이 너무 큽니다.' }); }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let body;
    try { body = JSON.parse(text); } catch { return adminReply(400, { error: '진단 요청을 확인해주세요.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
        typeof body.token !== 'string' || !body.token.trim() || body.token.length > 2048)
      return adminReply(400, { error: '진단 요청을 확인해주세요.' });
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return adminReply(503, { result: 'unavailable' });
    const result = await verifyInquiryChallenge(body.token, env, url.hostname, ip);
    return adminReply(result === 'unavailable' ? 503 : 200, { result });
  } catch {
    return adminReply(503, { result: 'unavailable' });
  } finally { await discardAdminBody(request); }
}
