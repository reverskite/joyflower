export const inquiryChallengeAction = 'inquiry';

export function turnstileConfigured(env: Cloudflare.Env, hostname: string) {
  // Cloudflare's public test keys must never enable a public deployment.
  const siteKey = env.TURNSTILE_SITE_KEY || '';
  const secret = env.TURNSTILE_SECRET_KEY || '';
  return /^[A-Za-z0-9_-]{10,100}$/.test(siteKey) && secret.length >= 20 && secret.length <= 200 &&
    !/^[123]x0+/.test(siteKey) && !/^[123]x0+/.test(secret) &&
    env.TURNSTILE_HOSTNAME === hostname && /^[a-z0-9.-]+$/.test(hostname) && hostname.includes('.');
}

export async function verifyInquiryChallenge(token: string | undefined, env: Cloudflare.Env,
  hostname: string, remoteIp: string, transport: typeof fetch = fetch): Promise<'valid' | 'invalid' | 'unavailable'> {
  if (!turnstileConfigured(env, hostname)) return 'unavailable';
  if (!token?.trim() || token.length > 2048) return 'invalid';
  try {
    const response = await transport('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp,
        idempotency_key: crypto.randomUUID() }),
    });
    if (!response.ok) return 'unavailable';
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object') return 'unavailable';
    const data = result as Record<string, unknown>;
    if (data.success !== true || data.hostname !== hostname || data.action !== inquiryChallengeAction) return 'invalid';
    return 'valid';
  } catch {
    // Never log tokens, IP addresses, provider responses or secrets.
    return 'unavailable';
  }
}
