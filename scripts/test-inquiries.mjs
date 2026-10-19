// Isolated local Miniflare/D1 only. No Cloudflare account or production resources.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';

const require = createRequire(await realpath(fileURLToPath(new URL('../node_modules/wrangler/package.json', import.meta.url))));
const { build } = require('esbuild');
const { Miniflare } = require('miniflare');
const root = fileURLToPath(new URL('../', import.meta.url));
const state = await mkdtemp(path.join(tmpdir(), 'joyflower-inquiries-'));
const compiled = await build({
  stdin: { contents: `import { handleInquiry } from './lib/inquiry-handler.ts';
    const used = new Set();
    // Offline Siteverify fixture. No real keys, tokens or network calls.
    globalThis.fetch = async (url, init) => {
      if (url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') throw Error('unexpected fetch');
      const body = JSON.parse(init.body);
      if (body.response === 'outage') throw Error('simulated outage');
      if (body.response === 'expired' || used.has(body.response))
        return Response.json({success:false, 'error-codes':['timeout-or-duplicate']});
      used.add(body.response);
      return Response.json({success: body.response.startsWith('valid-'),
        hostname: body.response === 'wrong-host' ? 'wrong.invalid' : 'inquiry-fixture.example.invalid',
        action: body.response === 'wrong-action' ? 'login' : 'inquiry'});
    };
    export default { fetch(request, env) { return handleInquiry(request, env); } };`, resolveDir: root },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent',
});
const baseOptions = { modules: true, script: compiled.outputFiles[0].text,
  compatibilityDate: '2026-05-15', d1Databases: ['DB'], d1Persist: state,
  bindings: { INQUIRY_INTAKE_ENABLED: 'true', INQUIRY_LOCAL_TEST_MODE: 'true',
    INQUIRY_RATE_LIMIT_SECRET: randomBytes(32).toString('hex') } };
const mf = new Miniflare(baseOptions);
const origin = 'http://127.0.0.1';
const payload = { service: 'christmas', region: '로컬 검증 지역', budget: '테스트',
  requests: { height: '테스트 규격', installDate: '테스트 일정', details: '실제 고객 정보 아님' },
  customerName: '로컬 테스트 담당자', phone: '01000000000', consent: true, consentVersion: 'local-test-v1', website: '' };
let passed = 0;
async function send(body = payload, key = randomUUID(), extra = {}) {
  const response = await mf.dispatchFetch(origin + '/api/inquiries', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
try {
  let db = await mf.getD1Database('DB');
  for (const file of ['0000_inquiries.sql', '0001_admin_status.sql', '0002_inquiry_notifications.sql', '0003_notification_channels.sql', '0004_sms_notifications.sql']) {
    const migration = await readFile(path.join(root, 'drizzle', file), 'utf8');
    for (const statement of migration.split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
  console.log('PASS local D1 migration'); passed++;
  const count = async () => (await db.prepare('SELECT count(*) AS count FROM inquiries').first()).count;
  for (const bad of [
    { ...payload, consent: false }, { ...payload, consent: undefined }, { ...payload, region: ' ' },
    { ...payload, service: 'unknown' }, { ...payload, customerName: '' }, { ...payload, phone: 'invalid' },
    { ...payload, budget: 'x'.repeat(101) }, { ...payload, requests: { height: 'x'.repeat(201) } },
    { ...payload, requests: { wrongField: 'test' } }, { ...payload, reference: 'missing-case' },
    { ...payload, website: 'spam' }, { ...payload, status: 'completed' },
  ]) assert.equal((await send(bad)).status, 400);
  assert.equal(await count(), 0); console.log('PASS invalid inputs, service allowlist, consent, lengths, honeypot'); passed++;
  assert.equal((await send({ ...payload, consentVersion: 'old-version' })).status, 409);
  assert.equal((await send(payload, randomUUID(), { Origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await send(payload, randomUUID(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await send(payload, 'invalid-key')).status, 400);
  assert.equal((await send('broken JSON')).status, 400);
  assert.equal((await send(JSON.stringify({ ...payload, budget: 'x'.repeat(20000) }))).status, 413);
  console.log('PASS origin, type, key, version, malformed/oversize body'); passed++;

  const key = randomUUID();
  const concurrent = await Promise.all([send(payload, key), send(payload, key)]);
  assert.ok(concurrent.every(x => [200, 201].includes(x.status)));
  assert.equal(concurrent[0].data.receiptId, concurrent[1].data.receiptId);
  assert.equal(await count(), 1);
  assert.equal((await send({ ...payload, budget: 'changed' }, key)).status, 409);
  const anotherKey = await send();
  assert.equal(anotherKey.status, 200);
  assert.equal(anotherKey.data.receiptId, concurrent[0].data.receiptId);
  console.log('PASS atomic concurrent submission, retries, changed payload, same-content deduplication'); passed++;

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  for (const service of ['planterior', 'landscape']) {
    const result = await send({ ...payload, service, requests: { workDate: '테스트 일정', details: '로컬 테스트' },
      ...(service === 'planterior' ? { reference: 'penthouse-planterior' } : {}) });
    assert.equal(result.status, 201);
  }
  const stored = await db.prepare("SELECT * FROM inquiries WHERE service = 'planterior'").first();
  assert.equal(stored.reference_slug, 'penthouse-planterior');
  assert.equal(stored.consent, 1); assert.equal(stored.status, 'new');
  assert.equal(JSON.parse(stored.requests_json).workDate, '테스트 일정');
  assert.ok(stored.receipt_id.startsWith('JF-') && stored.created_at > 0);
  assert.ok(JSON.parse(stored.consent_notice_json).retention.includes('테스트'));
  console.log('PASS all three services, reference, schedule, receipt, consent snapshot, new status'); passed++;

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const distinct = await Promise.all(Array.from({ length: 4 }, (_, i) => send({ ...payload, budget: `limit-${i}` })));
  assert.equal(distinct.filter(x => x.status === 201).length, 3);
  const limited = distinct.find(x => x.status === 429);
  assert.ok(limited); assert.equal(limited.headers.get('retry-after'), '1800');
  const rateRows = (await db.prepare('SELECT bucket_key FROM inquiry_rate_limits').all()).results;
  assert.ok(rateRows.every(x => !x.bucket_key.includes(payload.phone) && !x.bucket_key.includes('loopback')));
  console.log('PASS persistent atomic phone rate limit and pseudonymous bucket keys'); passed++;

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const ipBurst = await Promise.all(Array.from({ length: 11 }, (_, i) => send({ ...payload,
    phone: '0100000' + String(i).padStart(4, '0'), budget: `ip-limit-${i}` })));
  assert.equal(ipBurst.filter(x => x.status === 201).length, 10);
  assert.equal(ipBurst.filter(x => x.status === 429).length, 1);
  console.log('PASS persistent atomic IP rate limit across different test phones'); passed++;

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const injection = await send({ ...payload, region: "test'); DROP TABLE inquiries;--", budget: 'bound SQL' });
  assert.equal(injection.status, 201); assert.ok(await count() > 0);
  assert.equal((await mf.dispatchFetch(origin + '/api/inquiries')).status, 405);
  const readResponse = await mf.dispatchFetch(origin + '/api/inquiries?receiptId=' + injection.data.receiptId);
  assert.equal(readResponse.status, 405); assert.ok(!(await readResponse.text()).includes(payload.phone));
  console.log('PASS bound SQL and no unauthenticated read endpoint'); passed++;

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const publicOrigin = 'https://inquiry-fixture.example.invalid';
  const productionBindings = { ...baseOptions.bindings, INQUIRY_LOCAL_TEST_MODE: 'false',
    INQUIRY_PRIVACY_VERSION: 'unit-policy-v1', INQUIRY_RETENTION_NOTICE: 'synthetic policy',
    INQUIRY_PRIVACY_CONTACT: 'synthetic contact', TURNSTILE_HOSTNAME: new URL(publicOrigin).hostname,
    TURNSTILE_SITE_KEY: 'unit-fixture-site-key', TURNSTILE_SECRET_KEY: 'unit-fixture-secret-not-real' };
  await mf.setOptions({ ...baseOptions, bindings: productionBindings });
  db = await mf.getD1Database('DB');
  async function publicSend(token, key = randomUUID(), additions = {}, requestOrigin = publicOrigin) {
    const response = await mf.dispatchFetch(requestOrigin + '/api/inquiries', {
      method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json',
        'Idempotency-Key': key, 'CF-Connecting-IP': '192.0.2.1' },
      body: JSON.stringify({ ...payload, consentVersion: 'unit-policy-v1', turnstileToken: token, ...additions }),
    });
    return { status: response.status, data: await response.json() };
  }
  const beforeChallenge = await count();
  for (const token of [undefined, '', 'forged', 'expired', 'wrong-host', 'wrong-action'])
    assert.equal((await publicSend(token)).status, 403);
  assert.equal((await publicSend('outage')).status, 503);
  assert.equal(await count(), beforeChallenge, 'rejected challenges never write inquiries');
  const verifiedKey = randomUUID();
  const verified = await publicSend('valid-first', verifiedKey);
  assert.equal(verified.status, 201);
  assert.equal((await publicSend('valid-first', verifiedKey)).status, 403, 'single-use token');
  const retry = await publicSend('valid-refreshed', verifiedKey);
  assert.equal(retry.status, 200); assert.equal(retry.data.receiptId, verified.data.receiptId);
  assert.equal((await publicSend('valid-changed', verifiedKey, { budget: 'changed' })).status, 409);
  assert.equal(await count(), beforeChallenge + 1);
  await mf.setOptions({ ...baseOptions, bindings: { ...productionBindings, INQUIRY_LOCAL_TEST_MODE: 'true', TURNSTILE_SECRET_KEY: '' } });
  assert.equal((await publicSend('valid-anything')).status, 503, 'loopback bypass cannot open a public hostname');
  await mf.setOptions({ ...baseOptions, bindings: { ...productionBindings, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' } });
  assert.equal((await publicSend('valid-anything')).status, 503, 'official dummy key is rejected on public hostname');
  await mf.setOptions(baseOptions);
  db = await mf.getD1Database('DB');
  console.log('PASS production-path Siteverify, missing/forged/expired/replayed tokens, outages, renewed-token deduplication and public bypass rejection'); passed++;

  await db.prepare('DROP TABLE inquiries').run();
  const failed = await send({ ...payload, budget: 'failure-test' });
  assert.equal(failed.status, 503); assert.equal(failed.data.receiptId, undefined);
  assert.ok(!JSON.stringify(failed.data).includes(payload.phone));
  console.log('PASS storage failure never returns success or sensitive error details'); passed++;

  await mf.setOptions({ ...baseOptions, bindings: { ...baseOptions.bindings, INQUIRY_LOCAL_TEST_MODE: 'false' } });
  assert.equal((await send()).status, 503);
  console.log('PASS unconfirmed operating policy keeps intake closed'); passed++;
  await mf.setOptions({ ...baseOptions, d1Databases: [] });
  assert.equal((await send()).status, 503);
  console.log('PASS missing D1 binding keeps intake closed'); passed++;
  console.log(`All ${passed} inquiry test groups passed (synthetic data, isolated local D1 only).`);
} finally {
  await mf.dispose();
  const resolved = path.resolve(state);
  // Delete only this script's freshly generated temporary fixture directory.
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('joyflower-inquiries-'))
    await rm(resolved, { recursive: true, force: true });
}
