/// <reference types="vite/client" />
import { discardRequestBody } from './request-body';
type AccessKey = JsonWebKey & { kid: string; alg?: string; use?: string };
type AccessConfig = { issuer: string; audience: string; emails: string[] };
export type AdminIdentity = { subject: string; mode: 'access' | 'local' };
const encoder = new TextEncoder();
const keyCache = new Map<string, { until: number; keys: AccessKey[] }>();
const keyRefreshAfter = new Map<string, number>();

async function fetchAccessKeys(issuer: string, fetchKeys: typeof fetch): Promise<AccessKey[]> {
  const response = await fetchKeys(issuer + '/cdn-cgi/access/certs', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || Number(response.headers.get('content-length')) > 100_000 || !response.body) throw new Error('keys');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = ''; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 100_000) { void reader.cancel().catch(() => {}); throw new Error('keys'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const data = JSON.parse(text);
  if (!Array.isArray(data.keys) || data.keys.length > 30 || data.keys.some((key: unknown) => !key || typeof key !== 'object'))
    throw new Error('keys');
  return data.keys;
}

export function accessConfig(env: Cloudflare.Env): AccessConfig | null {
  const issuer = env.ADMIN_ACCESS_TEAM_DOMAIN || '';
  const audience = env.ADMIN_ACCESS_AUDIENCE || '';
  const emails = (env.ADMIN_ACCESS_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (env.ADMIN_ENABLED !== 'true' || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer) ||
      !/^[a-zA-Z0-9_-]{16,256}$/.test(audience) || !emails.length) return null;
  return { issuer, audience, emails };
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('token');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

// Configuration pins the JWKS origin. Never fetch an issuer, jku or x5u from a token.
export async function verifyAccessToken(token: string, config: AccessConfig, fetchKeys: typeof fetch = fetch): Promise<AdminIdentity | null> {
  try {
    if (token.length > 16_384) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 256 || header.crit ||
        claims.iss !== config.issuer || !(typeof claims.aud === 'string' ? claims.aud === config.audience :
          Array.isArray(claims.aud) && claims.aud.includes(config.audience)) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        !Number.isSafeInteger(claims.iat) || claims.iat > now + 30 || claims.iat >= claims.exp ||
        (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
        typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 ||
        typeof claims.email !== 'string' || !config.emails.includes(claims.email.toLowerCase())) return null;
    let cached = keyCache.get(config.issuer);
    if (!cached || cached.until < Date.now()) {
      cached = { until: Date.now() + 300_000, keys: await fetchAccessKeys(config.issuer, fetchKeys) };
      keyCache.set(config.issuer, cached);
    }
    // Access can rotate its signing key during our five-minute cache window.
    // Refresh on an unknown kid, but at most once per issuer per 30 seconds.
    if (!cached.keys.some(key => key.kid === header.kid) && (keyRefreshAfter.get(config.issuer) || 0) <= Date.now()) {
      keyRefreshAfter.set(config.issuer, Date.now() + 30_000);
      cached = { until: Date.now() + 300_000, keys: await fetchAccessKeys(config.issuer, fetchKeys) };
      keyCache.set(config.issuer, cached);
    }
    const jwk = cached.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) return null;
    return { subject: claims.sub, mode: 'access' };
  } catch { return null; }
}

export async function authenticateAdmin(request: Request, env: Cloudflare.Env): Promise<AdminIdentity | null> {
  // Vite replaces DEV with false and removes this import from production bundles.
  if (import.meta.env.DEV) {
    const local = await import('./admin-local-auth');
    if (local.localEnabled(request, env)) return local.authenticateLocal(request, env);
  }
  const config = accessConfig(env);
  if (!config) return null;
  // Identity/email headers and unsigned local assertions are never trusted.
  return verifyAccessToken(request.headers.get('cf-access-jwt-assertion') || '', config);
}

export function adminReply(status: number, body: unknown, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra } });
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export const discardAdminBody = discardRequestBody;

export async function localSessionRoute(request: Request, env: Cloudflare.Env) {
  if (import.meta.env.DEV) {
    const local = await import('./admin-local-auth');
    return local.sessionRoute(request, env);
  }
  await discardAdminBody(request);
  return adminReply(403, { error: '운영에서는 Cloudflare Access 인증을 사용합니다.' });
}
