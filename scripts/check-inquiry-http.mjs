// Read-only checks against a locally built Worker. No valid customer submissions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpRequest } from 'node:http';

const base = new URL(process.argv[2] || 'http://127.0.0.1:5174');
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Local HTTP loopback only.');
function localFetch(route, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || '';
    const request = httpRequest(new URL(route, base), {
      method: options.method || 'GET', agent: false,
      headers: { Connection: 'close', 'Content-Length': Buffer.byteLength(body), ...options.headers },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode,
        headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])),
      })));
      response.on('error', reject);
    });
    request.setTimeout(10_000, () => request.destroy(new Error(`Local HTTP check timed out: ${options.method || 'GET'} ${route}`)));
    request.on('error', reject);
    if (body) request.end(body);
    else request.end();
  });
}
assert.equal((await localFetch('/api/inquiries', { method: 'POST',
  headers: { Origin: base.origin, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: '{}' })).status, 503);
assert.equal((await localFetch('/api/inquiries')).status, 405);
assert.equal((await localFetch('/api/inquiries/not-a-receipt')).status, 404);
const inquiry = await (await localFetch('/inquiry?service=landscape')).text();
assert.ok(inquiry.includes('조경관리 상담 정보'));
assert.ok(/<button[^>]+disabled[^>]*>온라인 접수 준비 중/.test(inquiry));
assert.ok(inquiry.includes('현재 온라인 접수는 받지 않습니다.'));
assert.ok(inquiry.includes('작성한 내용은 서버에 저장되지 않습니다.'));
assert.match(inquiry, /<a\b[^>]*href="tel:01034110792"/);
assert.match(inquiry, /<a\b[^>]*href="https:\/\/open\.kakao\.com\/me\/joyflower_tree"/);
const privacy = await (await localFetch('/privacy')).text();
assert.ok(privacy.includes('noindex'));
const receipt = 'JF-' + randomUUID();
for (const route of ['/api/admin/inquiries', '/api/admin/summary', '/api/admin/session', '/api/admin/notifications', '/api/admin/inquiries/' + receipt]) {
  const response = await localFetch(route, { headers: { 'Cf-Access-Jwt-Assertion': 'forged', 'Cf-Access-Authenticated-User-Email': 'fake@example.invalid' } });
  assert.equal(response.status, 401, route);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.ok(!(await response.text()).includes('customer_name'));
}
assert.equal((await localFetch('/api/admin/inquiries/' + receipt, { method: 'PATCH', headers: { Origin: base.origin, 'Content-Type': 'application/json' }, body: '{"status":"completed","version":0}' })).status, 401);
assert.equal((await localFetch('/api/admin/session', { method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json', 'X-Local-Admin-Secret': 'pretend-local-key' }, body: '{}' })).status, 403);
assert.equal((await localFetch('/api/admin/notifications', { method: 'POST', headers: { Origin: base.origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
const loginResponse = await localFetch('/admin/login');
assert.equal(loginResponse.headers.get('cache-control'), 'no-store');
const loginHtml = await loginResponse.text();
assert.ok(loginHtml.includes('noindex'));
assert.ok(!loginHtml.includes('name="local-secret"'));
for (const route of ['/admin', '/admin/inquiries', '/admin/notifications', '/admin/inquiries/' + receipt]) {
  const response = await localFetch(route);
  assert.ok([302, 303, 307, 308].includes(response.status), route);
  assert.equal(response.headers.get('location'), '/admin/login');
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
for (const route of ['/', '/christmas', '/planterior', '/landscape', '/portfolio', '/inquiry', '/privacy', '/portfolio/penthouse-planterior']) {
  const response = await localFetch(route);
  assert.equal(response.status, 200, route);
  const html = await response.text();
  assert.equal((html.match(/<script[^>]+type="application\/ld\+json"/g) || []).length, 1, route);
}
for (const route of ['/robots.txt', '/sitemap.xml']) assert.equal((await localFetch(route)).status, 200);
assert.equal((await localFetch('/not-a-real-page')).status, 404);

const root = fileURLToPath(new URL('../', import.meta.url));
const localVars = await readFile(path.join(root, '.dev.vars'), 'utf8').catch(() => '');
const localSecret = localVars.match(/INQUIRY_RATE_LIMIT_SECRET="([^"]+)"/)?.[1];
const adminSecret = localVars.match(/ADMIN_LOCAL_SECRET="([^"]+)"/)?.[1];
for (const secret of [localSecret, adminSecret].filter(Boolean)) {
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(full);
      else if (/\.(js|json|html)$/.test(entry.name)) assert.ok(!(await readFile(full, 'utf8')).includes(secret), 'Local secret must not be bundled');
    }
  }
  await scan(path.join(root, 'dist'));
  assert.ok(!inquiry.includes(secret) && !loginHtml.includes(secret));
}
console.log('PASS built Worker: inquiry policy gate and phone/Kakao fallback, admin/notification auth/redirects/no-store/noindex/local-login-disabled, SSR, SEO/JSON-LD, 404, no local secrets in build or HTML.');
