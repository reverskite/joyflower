// Isolated synthetic D1 + internal mocks only. No provider endpoints or phone delivery.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(await realpath(path.join(root,'node_modules/wrangler/package.json')));
const {build}=require('esbuild'); const {Miniflare}=require('miniflare');
const state=await mkdtemp(path.join(tmpdir(),'joyflower-kakao-'));
async function compile(dev) {
  const result=await build({stdin:{resolveDir:root,contents:`
    import {handleInquiry} from './lib/inquiry-handler.ts';
    import {handleAdminNotifications} from './lib/admin-notifications.ts';
    import {localSessionRoute} from './lib/admin-auth.ts';
    import {processNotificationBatch} from './lib/inquiry-notifications.ts';
    import {kakaoAlimtalkConfig,kakaoAlimtalkMessage} from './lib/kakao-alimtalk.ts';
    import {createKakaoAlimtalkMockSender} from './lib/kakao-alimtalk-mock-sender.ts';
    globalThis.fetch=async()=>{throw Error('External requests forbidden');};
    const ledger=new Map(); let release; let holdStarted=false;
    export default {async fetch(request,env) {
      const url=new URL(request.url);
      if(url.pathname==='/api/inquiries') return handleInquiry(request,env);
      if(url.pathname==='/api/admin/session') return localSessionRoute(request,env);
      if(url.pathname==='/api/admin/notifications') return handleAdminNotifications(request,env);
      if(url.pathname==='/test/hold-status') return Response.json({started:holdStarted});
      if(url.pathname==='/test/release') {release?.();return Response.json({ok:true});}
      if(url.pathname==='/test/dedupe') {
        const config=kakaoAlimtalkConfig(env,url.hostname);
        const job={receipt_id:'JF-00000000-0000-4000-8000-000000000000',created_at:1};
        const m=kakaoAlimtalkMessage(job,config);const s=createKakaoAlimtalkMockSender();
        const first=await s.send(m,config), second=await s.send(m,config);
        const changed=await s.send({...m,templateCode:'mock-changed'},config);
        return Response.json({first,second,changed,lookup:await s.lookup(m.messageId,config)});
      }
      if(url.pathname==='/test/run') {
        const messages=[]; const sendResults=[]; const scenario=url.searchParams.get('scenario')||'normal';
        const base=createKakaoAlimtalkMockSender(scenario==='hold'?'normal':scenario,ledger,url.searchParams.get('reason')||'template_error');
        const sender={kind:'mock',provider:'mock',async send(message,config){
          messages.push(message);
          if(scenario==='hold') {holdStarted=true;await new Promise(r=>{const timer=setTimeout(r,5000);release=()=>{clearTimeout(timer);r();};});}
          const outcome=await base.send(message,config);sendResults.push(outcome);return outcome;
        }};
        try {const result=await processNotificationBatch(env,url.searchParams.get('host')||url.hostname,
          {kakaoSender:sender,...(url.searchParams.has('now')?{now:Number(url.searchParams.get('now'))}:{})});
          return Response.json({result,messages,sendResults});
        }catch{return Response.json({safeError:true},{status:503});}
      }
      return new Response(null,{status:404});
    }};`},define:{'import.meta.env.DEV':String(dev)},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  return result.outputFiles[0].text;
}
const origin='http://127.0.0.1';const secret=randomBytes(32).toString('hex');
const bindings={INQUIRY_INTAKE_ENABLED:'true',INQUIRY_LOCAL_TEST_MODE:'true',INQUIRY_RATE_LIMIT_SECRET:randomBytes(32).toString('hex'),
  ADMIN_LOCAL_ENABLED:'true',ADMIN_LOCAL_SECRET:secret,INQUIRY_NOTIFICATION_MODE:'mock',
  INQUIRY_NOTIFICATION_TO:'fixture@example.invalid',INQUIRY_NOTIFICATION_ADMIN_ORIGIN:origin+':5189',
  KAKAO_ALIMTALK_PROVIDER:'mock',KAKAO_ALIMTALK_SENDER_PROFILE_ID:'mock-profile',KAKAO_ALIMTALK_TEMPLATE_CODE:'mock-template',
  KAKAO_ALIMTALK_RECIPIENT_PHONE:'TEST_ONLY',KAKAO_ALIMTALK_API_AUTH:'test-auth-'+randomBytes(24).toString('hex'),
  KAKAO_ALIMTALK_ADMIN_URL:'https://admin.example.invalid/admin'};
const options={modules:true,script:await compile(true),compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:state,bindings};
const mf=new Miniflare(options);let cookie='';let passed=0;
function pass(name){console.log('PASS '+name);passed++;}
async function call(route,method='GET',body,headers={}) {
  const response=await mf.dispatchFetch(origin+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),
    ...(method!=='GET'?{Origin:origin}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},
    ...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const payload={service:'christmas',region:'합성 지역',budget:'합성 예산',requests:{details:'실제 고객 정보 아님'},customerName:'가상 고객',phone:'01000000000',consent:true,consentVersion:'local-test-v1',website:''};
const submit=(budget,key=randomUUID())=>call('/api/inquiries','POST',{...payload,budget},{'Idempotency-Key':key});
try {
  let db=await mf.getD1Database('DB');
  const migration=async name=>(await readFile(path.join(root,'drizzle',name),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
  for(const name of ['0000_inquiries.sql','0001_admin_status.sql','0002_inquiry_notifications.sql'])
    for(const sql of await migration(name))await db.prepare(sql).run();
  // Preserve every old status and retry/lease field across the child-table rebuild.
  for(const status of ['pending','processing','mock_sent','sent','failed']) {
    const id='JF-'+randomUUID();
    await db.prepare(`INSERT INTO inquiries (receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,customer_name,phone,consent,consent_version,consent_notice_json,created_at,status)
      VALUES (?,?,?,'christmas','fixture','{}','fixture','fixture','01000000000',1,'local-test-v1','{}',1,'new')`).bind(id,randomUUID(),id).run();
    await db.prepare('UPDATE inquiry_notifications SET status=?,attempts=2,lease_token=?,lease_until=123,completed_at=456,last_error=? WHERE receipt_id=?')
      .bind(status,'fixture-lease',status==='failed'?'sender_failed':null,id).run();
  }
  const legacy=(await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id').all()).results;
  const channelMigration=await migration('0003_notification_channels.sql');
  await assert.rejects(db.batch([...channelMigration.map(s=>db.prepare(s)),db.prepare('SELECT fixture_missing_column FROM inquiries')]));
  assert.deepEqual((await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id').all()).results,legacy);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='inquiry_notification_created'").first()).n,1);
  assert.equal((await db.prepare('PRAGMA table_info(inquiry_notifications)').all()).results.some(c=>c.name==='channel'),false);
  await db.batch(channelMigration.map(s=>db.prepare(s)));
  const copied=(await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id').all()).results;
  assert.equal(copied.length,legacy.length);
  copied.forEach((row,i)=>{assert.equal(row.channel,'EMAIL');assert.equal(row.provider_message_id,null);for(const key of Object.keys(legacy[i]))assert.deepEqual(row[key],legacy[i][key]);});
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  await db.prepare('DELETE FROM inquiries').run();
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications').first()).n,0);
  pass('atomic channel migration preserves all legacy email statuses/data; foreign keys and cascade valid');

  await db.batch((await migration('0004_sms_notifications.sql')).map(s=>db.prepare(s)));
  assert.equal((await db.prepare("SELECT enabled FROM inquiry_notification_channels WHERE channel='SMS'").first()).enabled,0);
  const route=async channels=>db.batch(['EMAIL','KAKAO_ALIMTALK','SMS'].map(c=>db.prepare('UPDATE inquiry_notification_channels SET enabled=? WHERE channel=?').bind(channels.includes(c)?1:0,c)));
  const row=async id=>db.prepare("SELECT * FROM inquiry_notifications WHERE receipt_id=? AND channel='KAKAO_ALIMTALK'").bind(id).first();
  const fresh=async name=>{await db.prepare('DELETE FROM inquiry_rate_limits').run();const result=await submit(name);assert.equal(result.status,201);return result.data.receiptId;};
  const first=await fresh('default-email');
  assert.deepEqual((await db.prepare('SELECT channel FROM inquiry_notifications WHERE receipt_id=?').bind(first).all()).results,[{channel:'EMAIL'}]);
  await route(['EMAIL','KAKAO_ALIMTALK']);
  const both=await fresh('both-channels');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications WHERE receipt_id=?').bind(both).first()).n,2);
  await route(['KAKAO_ALIMTALK']);
  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const key=randomUUID();const concurrent=await Promise.all([submit('kakao-only',key),submit('kakao-only',key)]);
  assert.ok(concurrent.every(r=>[200,201].includes(r.status)));
  const id=concurrent[0].data.receiptId;assert.equal(concurrent[1].data.receiptId,id);
  assert.equal((await submit('kakao-only')).data.receiptId,id);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications WHERE receipt_id=?').bind(id).first()).n,1);
  pass('routing produces exactly 1 default email, 2 explicit channels or 1 Kakao; duplicate receipts add no jobs');

  for(const method of ['GET','POST']) {
    assert.equal((await call('/api/admin/notifications',method)).status,401);
    assert.equal((await call('/api/admin/notifications',method,undefined,{'Cf-Access-Jwt-Assertion':'forged'})).status,401);
  }
  const login=await call('/api/admin/session','POST',undefined,{'X-Local-Admin-Secret':secret});
  cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/notifications','POST',undefined,{Origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await call('/api/admin/notifications?scenario=unknown','POST')).status,400);
  const list=await call('/api/admin/notifications');assert.equal(list.status,200);
  assert.equal(list.headers.get('cache-control'),'no-store');assert.match(list.headers.get('x-robots-tag'),/noindex/);
  for(const value of [payload.phone,payload.customerName,payload.requests.details,bindings.KAKAO_ALIMTALK_API_AUTH,bindings.KAKAO_ALIMTALK_SENDER_PROFILE_ID,bindings.KAKAO_ALIMTALK_TEMPLATE_CODE,bindings.KAKAO_ALIMTALK_ADMIN_URL,'TEST_ONLY'])
    assert.ok(!JSON.stringify(list.data).includes(value));
  pass('admin list/dispatch authentication, CSRF and query restrictions; no recipient/profile/template/auth leakage');

  const batches=await Promise.all([call('/test/run'),call('/test/run')]);
  assert.equal(batches.reduce((n,r)=>n+r.data.result.mockSent,0),2); // both-channel receipt and Kakao-only receipt
  const messages=batches.flatMap(r=>r.data.messages);assert.equal(messages.length,2);
  const message=messages.find(m=>m.variables.receiptNumber===id);
  assert.equal(message.button.url,bindings.KAKAO_ALIMTALK_ADMIN_URL);
  assert.equal(new URL(message.button.url).protocol,'https:');assert.equal(new URL(message.button.url).search,'');
  assert.ok(message.previewText.includes('새로운 견적 문의가 접수되었습니다.'));assert.ok(message.previewText.includes('한국 시간'));
  assert.ok(message.messageId.endsWith(id));
  for(const value of [payload.phone,payload.customerName,payload.requests.details,bindings.KAKAO_ALIMTALK_API_AUTH,'TEST_ONLY']) assert.ok(!JSON.stringify(message).includes(value));
  assert.equal((await row(id)).status,'mock_sent');
  assert.equal((await call('/test/run')).data.result.processed,0);
  assert.equal((await db.prepare("SELECT status FROM inquiry_notifications WHERE receipt_id=? AND channel='EMAIL'").bind(first).first()).status,'pending');
  pass('concurrent channel-specific claims; configured HTTPS button; receipt/time-only preview; paused email remains untouched');

  const dedupe=await call('/test/dedupe');
  assert.equal(dedupe.data.first.kind,'mock_sent');assert.equal(dedupe.data.second.kind,'duplicate');
  assert.equal(dedupe.data.second.previous,'mock_sent');assert.equal(dedupe.data.changed.reason,'configuration_changed');
  assert.equal(dedupe.data.lookup.kind,'mock_sent');
  pass('mock provider stable-ID deduplication, result lookup and changed-message rejection');

  const duplicate=await fresh('provider-duplicate');await call('/test/run');
  // Fixture-only redelivery after a lost acknowledgement. Production has no reset API.
  await db.prepare("UPDATE inquiry_notifications SET status='pending',completed_at=NULL WHERE receipt_id=? AND channel='KAKAO_ALIMTALK'").bind(duplicate).run();
  const duplicateRun=await call('/test/run');assert.equal(duplicateRun.data.sendResults[0].kind,'duplicate');
  assert.equal((await row(duplicate)).status,'mock_sent');
  pass('provider duplicate acknowledgement maps to previous result using the same message ID');

  const transient=await fresh('temporary');const original=await db.prepare('SELECT * FROM inquiries WHERE receipt_id=?').bind(transient).first();
  const failure=await call('/test/run?scenario=temporary_failure');assert.equal(failure.data.result.failed,1);
  let job=await row(transient);assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.equal(job.last_error,'sender_failed');
  assert.equal((await call('/test/run')).data.result.processed,0);
  const retry=await call('/test/run?now='+job.next_attempt_at);assert.equal(retry.data.result.mockSent,1);
  assert.equal(retry.data.messages[0].messageId,failure.data.messages[0].messageId);
  assert.deepEqual(await db.prepare('SELECT * FROM inquiries WHERE receipt_id=?').bind(transient).first(),original);
  pass('confirmed temporary rejection backs off then succeeds with same ID; saved inquiry unchanged');

  for(const reason of ['template_error','auth_error']) {
    const permanent=await fresh(reason);assert.equal((await call('/test/run?scenario=permanent_failure&reason='+reason)).data.result.failed,1);
    job=await row(permanent);assert.equal(job.status,'failed');assert.equal(job.last_error,reason);assert.equal(job.attempts,1);
    assert.equal((await call('/test/run?now='+(Date.now()+999999))).data.result.processed,0);
  }
  pass('permanent template/auth failure stops after one attempt');

  for(const scenario of ['unknown','throw']) {
    const uncertain=await fresh(scenario);assert.equal((await call('/test/run?scenario='+scenario)).data.result.unknown,1);
    job=await row(uncertain);assert.equal(job.status,'unknown');assert.equal(job.attempts,1);
    assert.equal((await call('/test/run?now='+(Date.now()+999999))).data.result.processed,0);
  }
  const accepted=await fresh('accepted');assert.equal((await call('/test/run?scenario=accepted')).data.result.accepted,1);
  job=await row(accepted);assert.equal(job.status,'accepted');assert.equal(job.completed_at,null);
  assert.ok(job.provider_message_id.startsWith('mock-'));
  assert.equal((await call('/test/run?now='+(Date.now()+999999))).data.result.processed,0);
  pass('timeouts/unknowns quarantine; provider acceptance stays unconfirmed and never blindly resends');

  const maximum=await fresh('maximum');
  for(let i=1;i<=5;i++) {job=await row(maximum);assert.equal((await call('/test/run?scenario=temporary_failure&now='+job.next_attempt_at)).data.result.failed,1);}
  job=await row(maximum);assert.equal(job.attempts,5);assert.equal(job.status,'failed');
  assert.equal((await call('/test/run?now='+(job.next_attempt_at+999999))).data.result.processed,0);
  pass('five-attempt limit on confirmed temporary failures');

  const held=await fresh('stale-ack');const waiting=call('/test/run?scenario=hold');
  for(let i=0;i<100;i++){if((await call('/test/hold-status')).data.started)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal((await call('/test/hold-status')).data.started,true);
  await call('/test/run?now='+(Date.now()+120000));assert.equal((await row(held)).status,'unknown');
  await call('/test/release');assert.equal((await waiting).data.result.mockSent,0);assert.equal((await row(held)).status,'unknown');
  pass('expired Kakao lease quarantines and rejects stale completion without a second send');

  const ackFailure=await fresh('ack-storage-failure');
  await db.prepare("CREATE TRIGGER fixture_ack_failure BEFORE UPDATE ON inquiry_notifications WHEN NEW.channel='KAKAO_ALIMTALK' AND NEW.status='mock_sent' BEGIN SELECT RAISE(ABORT,'fixture'); END").run();
  assert.equal((await call('/test/run')).status,503);assert.equal((await row(ackFailure)).status,'processing');
  await db.prepare('DROP TRIGGER fixture_ack_failure').run();
  const recover=await call('/test/run?now='+(Date.now()+120000));assert.equal(recover.data.messages.length,0);assert.equal((await row(ackFailure)).status,'unknown');
  pass('acceptance acknowledgement DB failure leaves lease and later quarantines; no blind resend');

  // Missing, invalid and production config must not claim pending jobs.
  const gated=await fresh('gated');
  const changes=[{INQUIRY_NOTIFICATION_MODE:'disabled'}, {KAKAO_ALIMTALK_PROVIDER:'unselected'},
    {KAKAO_ALIMTALK_TEMPLATE_CODE:''},{KAKAO_ALIMTALK_RECIPIENT_PHONE:'01000000000'},
    {KAKAO_ALIMTALK_ADMIN_URL:'http://admin.example.invalid/admin'},
    {KAKAO_ALIMTALK_ADMIN_URL:'https://admin.example.invalid/admin?token=forbidden'},
    {KAKAO_ALIMTALK_ADMIN_URL:'https://admin.example.invalid/admin#secret'},
    {KAKAO_ALIMTALK_ADMIN_URL:'https://admin.example.invalid/api/admin/session'}];
  for(const change of changes) {
    await mf.setOptions({...options,bindings:{...bindings,INQUIRY_NOTIFICATION_TO:'',...change}});
    assert.equal((await call('/test/run')).data.result.enabled,false);
  }
  await mf.setOptions({...options,bindings:{...bindings,INQUIRY_NOTIFICATION_TO:''}});
  assert.equal((await call('/test/run?host=public.example.invalid')).data.result.enabled,false);
  await mf.setOptions({...options,d1Databases:[]});assert.equal((await call('/test/run')).data.result.enabled,false);
  await mf.setOptions({...options,script:await compile(false)});
  assert.equal((await call('/test/run')).data.result.enabled,false);assert.equal((await call('/api/admin/notifications','POST')).status,401);
  db=await mf.getD1Database('DB');assert.equal((await row(gated)).attempts,0);
  pass('disabled/missing bindings/invalid config/real-number/public-host/production gates never send or claim');
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  console.log(`All ${passed} Kakao test groups passed; synthetic data only, no external delivery.`);
} finally {
  await mf.dispose();const resolved=path.resolve(state);
  if(path.dirname(resolved)===path.resolve(tmpdir())&&path.basename(resolved).startsWith('joyflower-kakao-')) await rm(resolved,{recursive:true,force:true});
}
