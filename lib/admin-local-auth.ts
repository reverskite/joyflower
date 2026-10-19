/// <reference types="vite/client" />
import { adminReply, sameOrigin, type AdminIdentity } from './admin-auth';
const cookieName = 'joyflower_local_admin';
const attempts = new Map<string, { count: number; until: number }>();
export function localEnabled(request: Request, env: Cloudflare.Env) {
  return import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname) &&
    env.ADMIN_LOCAL_ENABLED === 'true' && (env.ADMIN_LOCAL_SECRET?.length || 0) >= 32;
}
async function key(env: Cloudflare.Env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_LOCAL_SECRET!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function authenticateLocal(request: Request, env: Cloudflare.Env): Promise<AdminIdentity | null> {
  if (!localEnabled(request, env)) return null;
  try {
    const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
    const [expires, nonce, signature, extra] = token.split('.');
    if (extra || !/^\d{13}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature) ||
        Number(expires) <= Date.now() || Number(expires) > Date.now() + 3_601_000) return null;
    const bytes = Uint8Array.from(signature.match(/../g)!, s => parseInt(s, 16));
    if (!await crypto.subtle.verify('HMAC', await key(env), bytes, new TextEncoder().encode(expires + '.' + nonce))) return null;
    return { subject: 'local-test-admin', mode: 'local' };
  } catch { return null; }
}
export async function sessionRoute(request: Request, env: Cloudflare.Env) {
  if (!localEnabled(request, env)) return adminReply(403, { error: '로컬 인증이 비활성화되어 있습니다.' });
  if (!sameOrigin(request)) return adminReply(403, { error: '요청 출처를 확인해주세요.' });
  const flags = '; Path=/; HttpOnly; SameSite=Strict' + (new URL(request.url).protocol === 'https:' ? '; Secure' : '');
  if (request.method === 'DELETE') return adminReply(200, { ok: true }, { 'Set-Cookie': cookieName + '=; Max-Age=0' + flags });
  if (request.method !== 'POST') return adminReply(405, { error: '허용되지 않은 요청입니다.' });
  // A bounded per-isolate throttle for loopback development only. Never an operating login.
  const origin = new URL(request.url).origin;
  const previous = attempts.get(origin);
  const bucket = previous && previous.until > Date.now() ? previous : { count: 0, until: Date.now() + 60_000 };
  attempts.set(origin, bucket);
  if (++bucket.count > 5) return adminReply(429, { error: '잠시 후 다시 시도해주세요.' });
  // Credential travels in a request header, not a URL, client bundle or browser storage.
  const supplied = request.headers.get('x-local-admin-secret') || '';
  if (supplied.length > 256) return adminReply(401, { error: '인증정보를 확인해주세요.' });
  const enc = new TextEncoder();
  const proof = await crypto.subtle.sign('HMAC', await key(env), enc.encode(supplied));
  if (!await crypto.subtle.verify('HMAC', await key(env), proof, enc.encode(env.ADMIN_LOCAL_SECRET!)))
    return adminReply(401, { error: '인증정보를 확인해주세요.' });
  const payload = String(Date.now() + 3_600_000) + '.' + crypto.randomUUID().replaceAll('-', '');
  const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), enc.encode(payload)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return adminReply(200, { ok: true }, { 'Set-Cookie': cookieName + '=' + payload + '.' + signature + '; Max-Age=3600' + flags });
}
