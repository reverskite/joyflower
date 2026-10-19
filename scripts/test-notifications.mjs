// Synthetic fixtures in isolated Miniflare D1. No real email/network transport.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(await realpath(path.join(root, 'node_modules/wrangler/package.json')));
const { build } = require('esbuild');
const { Miniflare } = require('miniflare');
const state = await mkdtemp(path.join(tmpdir(), 'joyflower-notifications-'));
async function compile(dev) {
  const built = await build({ stdin: { resolveDir: root, contents: `
    import { handleInquiry } from './lib/inquiry-handler.ts';
    import { handleAdminNotifications } from './lib/admin-notifications.ts';
    import { localSessionRoute } from './lib/admin-auth.ts';
    import { processNotificationBatch } from './lib/inquiry-notifications.ts';
    globalThis.fetch = async () => { throw Error('External transport forbidden in fixture'); };
    export default { async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname === '/api/inquiries') return handleInquiry(request, env);
      if (url.pathname === '/api/admin/session') return localSessionRoute(request, env);
      if (url.pathname === '/api/admin/notifications') return handleAdminNotifications(request, env);
      if (url.pathname === '/test/run') {
        const messages = [];
        const sender = { kind: 'mock', async send(message) {
          messages.push(message);
          if (url.searchParams.has('fail')) throw Error('transport-secret-01000000000');
        }};
        const result = await processNotificationBatch(env, url.searchParams.get('host') || url.hostname,
          {sender, ...(url.searchParams.has('now') ? {now: Number(url.searchParams.get('now'))} : {})});
        return Response.json({result, messages});
      }
      return new Response(null, {status:404});
    }};` }, define: { 'import.meta.env.DEV': String(dev) }, bundle: true, write: false,
    format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
  return built.outputFiles[0].text;
}
const origin = 'http://127.0.0.1';
const secret = randomBytes(32).toString('hex');
const bindings = {
  INQUIRY_INTAKE_ENABLED: 'true', INQUIRY_LOCAL_TEST_MODE: 'true',
  INQUIRY_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'),
  ADMIN_LOCAL_ENABLED: 'true', ADMIN_LOCAL_SECRET: secret,
  INQUIRY_NOTIFICATION_MODE: 'mock', INQUIRY_NOTIFICATION_TO: 'fixture@example.invalid',
  INQUIRY_NOTIFICATION_ADMIN_ORIGIN: origin + ':5189',
};
const options = { modules: true, script: await compile(true), compatibilityDate: '2026-05-15',
  d1Databases: ['DB'], d1Persist: state, bindings };
const mf = new Miniflare(options);
let cookie = ''; let passed = 0;
function pass(name) { console.log('PASS ' + name); passed++; }
const payload = {service:'christmas',region:'가상 지역',budget:'합성 테스트',requests:{details:'가상 문의'},
  customerName:'가상 고객',phone:'01000000000',consent:true,consentVersion:'local-test-v1',website:''};
async function call(route, method='GET', body, headers={}) {
  const response = await mf.dispatchFetch(origin + route, {method,
    headers:{...(cookie ? {Cookie:cookie} : {}), ...(method !== 'GET' ? {Origin:origin} : {}),
      ...(body ? {'Content-Type':'application/json'} : {}), ...headers},
    ...(body ? {body:JSON.stringify(body)} : {})});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
async function submit(budget, key=randomUUID()) {
  return call('/api/inquiries','POST',{...payload,budget},{'Idempotency-Key':key});
}
try {
  const db = await mf.getD1Database('DB');
  async function migrate(name) {
    const sql = await readFile(path.join(root,'drizzle',name),'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await migrate('0000_inquiries.sql'); await migrate('0001_admin_status.sql');
  assert.equal((await submit('before-migration')).status,201);
  await migrate('0002_inquiry_notifications.sql');
  await migrate('0003_notification_channels.sql');
  await migrate('0004_sms_notifications.sql');
  const jobs = async () => (await db.prepare('SELECT * FROM inquiry_notifications ORDER BY created_at').all()).results;
  assert.equal((await jobs()).length,0);
  pass('migration preserves preexisting inquiry and never backfills old email');

  const key = randomUUID();
  const submissions = await Promise.all([submit('new',key),submit('new',key)]);
  assert.ok(submissions.every(x=>[200,201].includes(x.status)));
  const receipt=submissions[0].data.receiptId;
  assert.equal(submissions[1].data.receiptId,receipt);
  assert.equal((await jobs()).length,1);
  assert.equal((await submit('new')).data.receiptId,receipt);
  assert.equal((await jobs()).length,1);
  assert.equal((await submit('changed',key)).status,409);
  pass('atomic inquiry/outbox creation; concurrent key retries and content deduplication yield one job');

  for(const method of ['GET','POST']) {
    assert.equal((await call('/api/admin/notifications',method)).status,401);
    assert.equal((await call('/api/admin/notifications',method,undefined,{'Cf-Access-Jwt-Assertion':'forged'})).status,401);
  }
  const login=await call('/api/admin/session','POST',undefined,{'X-Local-Admin-Secret':secret});
  assert.equal(login.status,200); cookie=login.headers.get('set-cookie').split(';')[0];
  const list=await call('/api/admin/notifications');
  assert.equal(list.status,200); assert.equal(list.data.items.length,1);
  for(const privateValue of [payload.customerName,payload.phone,payload.requests.details,bindings.INQUIRY_NOTIFICATION_TO,secret])
    assert.ok(!JSON.stringify(list.data).includes(privateValue));
  assert.equal(list.headers.get('cache-control'),'no-store');
  assert.match(list.headers.get('x-robots-tag'),/noindex/);
  assert.equal((await call('/api/admin/notifications','POST',undefined,{Origin:'https://evil.invalid'})).status,403);
  pass('admin APIs reject missing/forged identity and cross-origin mutation; list omits PII and config');

  const outcomes=await Promise.all([call('/test/run'),call('/test/run')]);
  assert.equal(outcomes.reduce((n,r)=>n+r.data.result.processed,0),1);
  const message=outcomes.flatMap(r=>r.data.messages)[0];
  assert.equal(message.subject,'[조이플라워] 새로운 견적 문의가 접수되었습니다.');
  assert.equal(message.to,bindings.INQUIRY_NOTIFICATION_TO);
  assert.ok(message.text.includes(receipt)); assert.ok(message.text.includes('(한국 시간)'));
  assert.ok(message.text.includes(origin+':5189/admin/inquiries/'+receipt));
  for(const value of [payload.customerName,payload.phone,payload.requests.details,payload.region]) assert.ok(!message.text.includes(value));
  assert.equal((await jobs())[0].status,'mock_sent');
  assert.equal((await call('/api/admin/notifications','POST')).data.processed,0);
  pass('concurrent dispatch claims one lease; minimal email content and explicit mock_sent; no resend');

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const failedReceipt=(await submit('sender-failure')).data.receiptId;
  const before=await db.prepare('SELECT * FROM inquiries WHERE receipt_id=?').bind(failedReceipt).first();
  const failure=await call('/test/run?fail');
  assert.equal(failure.data.result.failed,1);
  let job=await db.prepare('SELECT * FROM inquiry_notifications WHERE receipt_id=?').bind(failedReceipt).first();
  assert.equal(job.status,'pending'); assert.equal(job.attempts,1); assert.equal(job.last_error,'sender_failed');
  assert.deepEqual(await db.prepare('SELECT * FROM inquiries WHERE receipt_id=?').bind(failedReceipt).first(),before);
  assert.equal((await call('/test/run')).data.result.processed,0);
  const retry=await call('/test/run?now='+job.next_attempt_at);
  assert.equal(retry.data.result.mockSent,1);
  assert.equal(retry.data.messages[0].idempotencyKey,failure.data.messages[0].idempotencyKey);
  pass('sender failure preserves saved inquiry; safe error, due-time backoff and stable retry idempotency key');

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const maxReceipt=(await submit('maximum-attempts')).data.receiptId;
  for(let i=1;i<=5;i++) {
    job=await db.prepare('SELECT * FROM inquiry_notifications WHERE receipt_id=?').bind(maxReceipt).first();
    assert.equal((await call('/test/run?fail&now='+job.next_attempt_at)).data.result.failed,1);
  }
  job=await db.prepare('SELECT * FROM inquiry_notifications WHERE receipt_id=?').bind(maxReceipt).first();
  assert.equal(job.status,'failed'); assert.equal(job.attempts,5);
  assert.equal((await call('/test/run?now='+(job.next_attempt_at+999999))).data.result.processed,0);
  pass('five failed attempts stop retries without deleting saved inquiry');

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const crashReceipt=(await submit('expired-lease')).data.receiptId;
  await db.prepare("UPDATE inquiry_notifications SET status='processing',attempts=1,lease_token='old',lease_until=1 WHERE receipt_id=?").bind(crashReceipt).run();
  assert.equal((await call('/test/run')).data.result.mockSent,1);
  await db.prepare("UPDATE inquiry_notifications SET status='processing',attempts=5,lease_token='crashed',lease_until=1 WHERE receipt_id=?").bind(crashReceipt).run();
  await call('/test/run');
  job=await db.prepare('SELECT * FROM inquiry_notifications WHERE receipt_id=?').bind(crashReceipt).first();
  assert.equal(job.status,'failed'); assert.equal(job.last_error,'attempts_exhausted');
  pass('expired lease recovery and exhausted crash lease termination');

  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  await db.prepare("CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON inquiry_notifications BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();
  const countBefore=(await db.prepare('SELECT count(*) AS n FROM inquiries').first()).n;
  assert.equal((await submit('atomic-outbox-failure')).status,503);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiries').first()).n,countBefore);
  await db.prepare('DROP TRIGGER fixture_outbox_failure').run();
  pass('outbox creation error rolls back unsaved inquiry instead of silently losing notification');

  assert.equal((await call('/test/run?host=public.example.invalid')).data.result.enabled,false);
  await mf.setOptions({...options,bindings:{...bindings,INQUIRY_NOTIFICATION_MODE:'disabled'}});
  assert.equal((await call('/test/run')).data.result.enabled,false);
  await mf.setOptions({...options,bindings:{...bindings,INQUIRY_NOTIFICATION_ADMIN_ORIGIN:'https://untrusted.invalid'}});
  assert.equal((await call('/test/run')).data.result.enabled,false);
  await mf.setOptions({...options,script:await compile(false)});
  assert.equal((await call('/test/run')).data.result.enabled,false);
  assert.equal((await call('/api/admin/notifications','POST')).status,401);
  pass('disabled/misconfigured/public-host/production gates reject mock despite local flags');
  console.log(`All ${passed} notification test groups passed; no real email sent.`);
} finally {
  await mf.dispose();
  const resolved=path.resolve(state);
  if(path.dirname(resolved)===path.resolve(tmpdir()) && path.basename(resolved).startsWith('joyflower-notifications-'))
    await rm(resolved,{recursive:true,force:true});
}
