// Isolated local D1 + generated RSA fixtures. No external Access or Cloudflare account.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
const require = createRequire(await realpath(fileURLToPath(new URL('../node_modules/wrangler/package.json', import.meta.url))));
const { build } = require('esbuild'); const { Miniflare } = require('miniflare');
const root = fileURLToPath(new URL('../', import.meta.url));
const state = await mkdtemp(path.join(tmpdir(), 'joyflower-admin-'));
const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const issuer = 'https://joyflower-unit-fixture.cloudflareaccess.com';
const audience = 'unit-test-audience-123456';
const now = Math.floor(Date.now() / 1000);
const baseClaims = { iss: issuer, aud: [audience], exp: now + 3600, iat: now - 1, sub: 'synthetic-admin-id', email: 'admin@example.invalid' };
async function token(claims = {}, header = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const prefix = encode({ alg: 'RS256', kid: 'test-key', ...header }) + '.' + encode({ ...baseClaims, ...claims });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(prefix));
  return prefix + '.' + Buffer.from(signature).toString('base64url');
}
async function compile(dev) {
  const result = await build({ stdin: { resolveDir: root, contents: `
    import { handleAdminInquiries } from './lib/admin-inquiries.ts';
    import { handleAdminNotifications } from './lib/admin-notifications.ts';
    import { localSessionRoute } from './lib/admin-auth.ts';
    // Fixture-only JWKS transport. Production source still fetches the pinned Access origin.
    globalThis.fetch = async (url) => {
      if (String(url) !== ${JSON.stringify(issuer + '/cdn-cgi/access/certs')}) throw Error('unexpected external fetch');
      return Response.json({keys:[${JSON.stringify(jwk)}]});
    };
    export default { fetch(request, env) {
      const path = new URL(request.url).pathname;
      if (path === '/api/admin/session') return localSessionRoute(request, env);
      if (path === '/api/admin/notifications') return handleAdminNotifications(request, env);
      const id = path.startsWith('/api/admin/inquiries/') ? path.split('/').pop() : undefined;
      return handleAdminInquiries(request, env, id, path === '/api/admin/summary');
    }};` }, define: { 'import.meta.env.DEV': String(dev) }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  return result.outputFiles[0].text;
}
const localSecret = randomBytes(32).toString('hex');
const bindings = { ADMIN_LOCAL_ENABLED: 'true', ADMIN_LOCAL_SECRET: localSecret };
const baseOptions = { modules: true, script: await compile(true), compatibilityDate: '2026-05-15', d1Databases: ['DB'], d1Persist: state, bindings };
const mf = new Miniflare(baseOptions);
const origin = 'http://127.0.0.1';
let cookie = ''; let assertion = '';
async function call(route = '/api/admin/inquiries', method = 'GET', body, extra = {}, authenticated = true) {
  const headers = { ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(authenticated && assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {}), ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers.Origin ??= origin;
  const response = await mf.dispatchFetch(origin + route, { method, headers, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  return { status: response.status, data: await response.json(), headers: response.headers };
}
let passed = 0;
function pass(message) { console.log('PASS ' + message); passed++; }
try {
  const db = await mf.getD1Database('DB');
  for (const file of ['0000_inquiries.sql', '0001_admin_status.sql', '0002_inquiry_notifications.sql', '0003_notification_channels.sql', '0004_sms_notifications.sql']) {
    const sql = await readFile(path.join(root, 'drizzle', file), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  const ids = [];
  for (let i = 0; i < 25; i++) {
    const id = 'JF-' + randomUUID(); ids.push(id);
    await db.prepare(`INSERT INTO inquiries (receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,customer_name,phone,consent,consent_version,consent_notice_json,created_at,status)
      VALUES (?,?,?,?,?,?,?,?,?,1,'local-test-v1','{}',?,?)`).bind(id, randomUUID(), 'fixture-' + i, ['christmas','planterior','landscape'][i % 3], '가상 테스트 지역', '{"workDate":"가상 일정"}', '테스트 예산', '가상 고객', '01000000000', Date.parse('2026-10-09T03:00:00Z') + i, ['new','reviewing','completed'][i % 3]).run();
  }
  pass('both migrations preserve existing inquiry structure; synthetic fixtures only');
  for (const route of ['/api/admin/inquiries', '/api/admin/summary', '/api/admin/inquiries/' + ids[0], '/api/admin/notifications']) {
    const denied = await call(route, 'GET', undefined, {}, false); assert.equal(denied.status, 401); assert.ok(!JSON.stringify(denied.data).includes('01000000000'));
    assert.equal((await call(route, 'GET', undefined, { 'Cf-Access-Jwt-Assertion': 'pretend-access', 'Cf-Access-Authenticated-User-Email': 'admin@example.invalid' }, false)).status, 401);
  }
  assert.equal((await call('/api/admin/inquiries/' + ids[0], 'PATCH', { status: 'reviewing', version: 0 }, {}, false)).status, 401);
  pass('all data APIs reject missing/forged identity; no PII returned');
  assert.equal((await call('/api/admin/session', 'POST', undefined, { 'X-Local-Admin-Secret': 'bad' })).status, 401);
  assert.equal((await call('/api/admin/session', 'POST', undefined, { 'X-Local-Admin-Secret': localSecret, Origin: 'https://evil.invalid' })).status, 403);
  const login = await call('/api/admin/session', 'POST', undefined, { 'X-Local-Admin-Secret': localSecret });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/inquiries', 'GET', undefined, { Cookie: cookie + 'tampered' })).status, 401);
  pass('loopback login, invalid credential/origin and tampered session checks');
  const list = await call(); assert.equal(list.status, 200); assert.equal(list.data.total, 25); assert.equal(list.data.items.length, 20); assert.equal(list.data.items[0].receipt_id, ids[24]);
  for (const row of list.data.items) { assert.equal(row.phone, undefined); assert.equal(row.customer_name, undefined); assert.equal(row.requests_json, undefined); }
  assert.equal((await call('/api/admin/inquiries?page=2')).data.items.length, 5);
  assert.equal((await call('/api/admin/inquiries?service=christmas&status=new&from=2026-10-09&to=2026-10-09')).data.total, 9);
  assert.equal((await call('/api/admin/inquiries?from=2026-10-10')).data.total, 0);
  assert.equal((await call('/api/admin/inquiries?receipt=' + ids[1])).data.total, 1);
  for (const query of ['page=0','page=1.2','pageSize=999','status=deleted','service=evil','sort=phone','from=2026-02-30','from=2026-10-10&to=2026-10-09','page=1&page=2',"receipt='OR1=1"])
    assert.equal((await call('/api/admin/inquiries?' + query)).status, 400, query);
  const counts = (await call('/api/admin/summary')).data; assert.deepEqual(counts, { total: 25, new: 9, reviewing: 8, completed: 8 });
  pass('latest-first list, no list PII, summary, filters, Korea dates and pagination validation');
  const detail = await call('/api/admin/inquiries/' + ids[0]); assert.equal(detail.data.inquiry.phone, '01000000000'); assert.equal(detail.data.inquiry.idempotency_key, undefined); assert.equal(detail.data.inquiry.fingerprint, undefined);
  assert.equal((await call('/api/admin/inquiries/JF-' + randomUUID())).status, 404);
  assert.equal((await call('/api/admin/inquiries/bad')).status, 400);
  pass('authenticated detail, no security identifiers, invalid/missing receipt handling');
  const endpoint = '/api/admin/inquiries/' + ids[0];
  assert.equal((await call(endpoint, 'PATCH', { status: 'deleted', version: 0 })).status, 400);
  assert.equal((await call(endpoint, 'PATCH', { status: 'reviewing', version: 0 }, { Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await call(endpoint, 'PATCH', { status: 'reviewing', version: 0 }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await call(endpoint, 'PATCH', { status: 'reviewing', version: 0 }, { Origin: '' })).status, 403);
  assert.equal((await call(endpoint, 'PATCH', '{bad')).status, 400);
  assert.equal((await call(endpoint, 'PATCH', 'x'.repeat(1025))).status, 413);
  const races = await Promise.all(['reviewing','completed'].map(status => call(endpoint, 'PATCH', { status, version: 0 })));
  assert.deepEqual(races.map(r => r.status).sort(), [200,409]);
  const updated = (await call(endpoint)).data; assert.equal(updated.inquiry.status_version, 1); assert.ok(updated.inquiry.status_updated_at); assert.equal(updated.history.length, 1); assert.equal(updated.history[0].actor, 'local:local-test-admin');
  assert.equal((await call(endpoint, 'PATCH', { status: updated.inquiry.status, version: 0 })).status, 200);
  assert.equal((await call(endpoint)).data.history.length, 1);
  pass('CSRF, status allowlist, actual body size, atomic audit/version update, race and duplicate retry');
  const retentionId = 'JF-' + randomUUID();
  const oldClose = Date.parse('2026-01-31T10:00:00+09:00');
  await db.prepare(`INSERT INTO inquiries (receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,
    customer_name,phone,consent,consent_version,consent_notice_json,created_at,status,status_updated_at,status_version)
    VALUES (?,?,?,'christmas','synthetic','{}','','synthetic','01000000000',1,'local-test-v1','{}',?,'completed',?,1)`)
    .bind(retentionId, randomUUID(), 'retention-fixture', oldClose - 1000, oldClose).run();
  await db.prepare(`INSERT INTO inquiry_status_history (receipt_id,previous_status,next_status,changed_at,actor)
    VALUES (?,'reviewing','completed',?,'local:retention-fixture')`).bind(retentionId, oldClose).run();
  const expired = await call('/api/admin/inquiries/' + retentionId);
  assert.equal(expired.data.retention.state, 'expired');
  assert.equal(expired.data.retention.expiresAt, Date.parse('2026-04-30T10:00:00+09:00'));
  assert.equal((await call('/api/admin/inquiries/' + ids[2])).data.retention.state, 'review_required');
  assert.equal((await call('/api/admin/inquiries/' + retentionId, 'PATCH', { status: 'reviewing', version: 1 })).status, 200);
  assert.equal((await call('/api/admin/inquiries/' + retentionId)).data.retention.state, 'in_progress');
  // Only this isolated fixture DB is modified. Proposed deletion always rechecks state/version/date.
  const conditionalDelete = () => db.prepare('DELETE FROM inquiries WHERE receipt_id=? AND status=? AND status_version=? AND status_updated_at=? RETURNING receipt_id')
    .bind(retentionId, 'completed', 1, oldClose).all();
  assert.equal((await conditionalDelete()).results.length, 0, 'reopened record must survive stale purge plan');
  await db.prepare("UPDATE inquiries SET status='completed',status_version=1,status_updated_at=? WHERE receipt_id=?")
    .bind(oldClose, retentionId).run();
  assert.equal((await conditionalDelete()).results.length, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM inquiry_status_history WHERE receipt_id=?').bind(retentionId).first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM inquiry_notifications WHERE receipt_id=?').bind(retentionId).first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first()).n, 25);
  pass('retention preview, invalid legacy dates, explicit reopening, stale purge exclusion and local-only FK cascade deletion');
  const loggedOut = await call('/api/admin/session', 'DELETE'); assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  cookie = ''; assert.equal((await call()).status, 401);
  pass('local logout expires browser cookie; requests without session denied');
  const productionScript = await compile(false);
  assert.ok(!productionScript.includes('joyflower_local_admin')); assert.ok(!productionScript.includes('x-local-admin-secret'));
  await mf.setOptions({ ...baseOptions, script: productionScript, bindings: { ...bindings, ADMIN_ENABLED: 'true', ADMIN_ACCESS_TEAM_DOMAIN: issuer, ADMIN_ACCESS_AUDIENCE: audience, ADMIN_ACCESS_EMAILS: baseClaims.email } });
  assert.equal((await call('/api/admin/session', 'POST', undefined, { 'X-Local-Admin-Secret': localSecret })).status, 403);
  assert.equal((await call()).status, 401);
  assertion = await token(); assert.equal((await call()).status, 200);
  assert.equal((await call('/api/admin/notifications')).status, 200);
  assert.equal((await call('/api/admin/notifications', 'POST')).status, 403);
  for (const claims of [{ aud: 'wrong' }, { iss: 'https://evil.invalid' }, { exp: now - 1 }, { iat: now + 100 }, { nbf: now + 100 }, { email: 'outsider@example.invalid' }, { sub: '' }]) { assertion = await token(claims); assert.equal((await call()).status, 401); }
  assertion = await token({}, { alg: 'HS256' }); assert.equal((await call()).status, 401);
  const valid = await token(); assertion = valid.slice(0, -15) + 'AAAAAAAAAAAAAAA'; assert.equal((await call()).status, 401);
  assertion = await token();
  assert.equal((await call('/api/admin/inquiries/' + ids[1], 'PATCH', { status: 'completed', version: 0 })).status, 200);
  pass('production build excludes local login; valid signed RS256 Access JWT accepted, issuer/audience/expiry/identity/signature failures rejected');
  await mf.setOptions({ ...baseOptions, script: productionScript, bindings: { ...bindings, ADMIN_ENABLED: 'true' } });
  assert.equal((await call()).status, 401);
  pass('missing operating Access configuration fails closed despite local flags and signed fixture');
  await mf.setOptions({ ...baseOptions, script: productionScript, bindings: { ...bindings, ADMIN_ENABLED: 'true', ADMIN_ACCESS_TEAM_DOMAIN: issuer, ADMIN_ACCESS_AUDIENCE: audience, ADMIN_ACCESS_EMAILS: baseClaims.email } });
  const activeDb = await mf.getD1Database('DB');
  const before = await activeDb.prepare('SELECT status, status_version FROM inquiries WHERE receipt_id = ?').bind(ids[2]).first();
  await activeDb.prepare('DROP TABLE inquiry_status_history').run();
  const failed = await call('/api/admin/inquiries/' + ids[2], 'PATCH', { status: 'new', version: before.status_version });
  assert.equal(failed.status, 503); assert.ok(!JSON.stringify(failed.data).includes('01000000000'));
  assert.deepEqual(await activeDb.prepare('SELECT status, status_version FROM inquiries WHERE receipt_id = ?').bind(ids[2]).first(), before);
  pass('audit storage failure returns safe 503 without changing the inquiry status');
  console.log(`All ${passed} admin test groups passed; isolated fixture DB removed on exit.`);
} finally {
  await mf.dispose();
  const resolved = path.resolve(state);
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('joyflower-admin-')) await rm(resolved, { recursive: true, force: true });
}
