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
const state=await mkdtemp(path.join(tmpdir(),'joyflower-sms-'));
async function compile(dev) {
  const result=await build({stdin:{resolveDir:root,contents:`
    import {handleInquiry} from './lib/inquiry-handler.ts';
    import {handleAdminNotifications} from './lib/admin-notifications.ts';
    import {localSessionRoute} from './lib/admin-auth.ts';
    import {processNotificationBatch} from './lib/inquiry-notifications.ts';
    import {smsConfig,smsMessage,SMS_TEXT,validateSmsText} from './lib/sms.ts';
    import {createSmsMockSender} from './lib/sms-mock-sender.ts';
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
        const config=smsConfig(env,url.hostname);
        const job={receipt_id:'JF-00000000-0000-4000-8000-000000000000',created_at:1};
        const m=smsMessage(job);const s=createSmsMockSender();
        const first=await s.send(m,config), second=await s.send(m,config);
        const changed=await s.send({...m,text:m.text+'!'},config);
        return Response.json({first,second,changed,changedRecipient:await s.send(m,{...config,recipientPhone:'CHANGED_TEST_ONLY'}),lookup:await s.lookup(m.messageId,config)});
      }
      if(url.pathname==='/test/length') {
        const config=smsConfig(env,url.hostname), sender=createSmsMockSender();
        const message=smsMessage({receipt_id:'JF-FIXTURE-LENGTH'});
        return Response.json({default:validateSmsText(SMS_TEXT),ascii90:validateSmsText('a'.repeat(90)),
          ascii91:validateSmsText('a'.repeat(91)),hangul45:validateSmsText('가'.repeat(45)),hangul46:validateSmsText('가'.repeat(46)),
          mixed90:validateSmsText('가'.repeat(44)+'a\\n'),unsupported:validateSmsText('😀'),unreviewed:validateSmsText('똠'),
          empty:validateSmsText(''),control:validateSmsText('a\\u0000'),
          oversized:await sender.send({...message,text:'a'.repeat(91)},config),
          unicode:await sender.send({...message,text:'😀'},config),
          lms:await sender.send({...message,type:'LMS'},config)});
      }
      if(url.pathname==='/test/run') {
        const messages=[]; const sendResults=[]; const scenario=url.searchParams.get('scenario')||'normal';
        const base=createSmsMockSender(scenario==='hold'?'normal':scenario,ledger,url.searchParams.get('reason')||'provider_rejected');
        const sender={kind:scenario==='provider'?'provider':'mock',provider:scenario==='provider'?'solapi':'mock',async send(message,config){
          messages.push(message);
          if(scenario==='hold') {holdStarted=true;await new Promise(r=>{const timer=setTimeout(r,5000);release=()=>{clearTimeout(timer);r();};});}
          const outcome=await base.send(message,config);sendResults.push(outcome);return outcome;
        }};
        try {const result=await processNotificationBatch(env,url.searchParams.get('host')||url.hostname,
          {smsSender:sender,...(url.searchParams.has('now')?{now:Number(url.searchParams.get('now'))}:{})});
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
  SMS_PROVIDER:'mock',SMS_SENDER_PHONE:'TEST_ONLY',SMS_RECIPIENT_PHONE:'TEST_ONLY',SMS_SEND_ENABLED:'false',
  SOLAPI_API_KEY:'fixture-key-'+randomBytes(24).toString('hex'),SOLAPI_API_SECRET:'fixture-secret-'+randomBytes(24).toString('hex')};
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
  for(const name of ['0000_inquiries.sql','0001_admin_status.sql','0002_inquiry_notifications.sql','0003_notification_channels.sql'])
    await db.batch((await migration(name)).map(sql=>db.prepare(sql)));
  // Exercise all legacy statuses, both channels, nullable fields and non-default routing.
  await db.prepare('UPDATE inquiry_notification_channels SET enabled=1').run();
  for(const status of ['pending','processing','mock_sent','sent','accepted','delivered','failed','unknown']) {
    const id='JF-'+randomUUID();
    await db.prepare(`INSERT INTO inquiries (receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,customer_name,phone,consent,consent_version,consent_notice_json,created_at,status)
      VALUES (?,?,?,'christmas','fixture','{}','fixture','fixture','01000000000',1,'local-test-v1','{}',1,'new')`).bind(id,randomUUID(),id).run();
    await db.prepare('UPDATE inquiry_notifications SET status=?,attempts=2,lease_token=?,lease_until=123,completed_at=456,last_error=?,provider_message_id=? WHERE receipt_id=?')
      .bind(status,'fixture-lease',status==='failed'?'sender_failed':null,'fixture-provider-id',id).run();
  }
  await db.prepare("UPDATE inquiry_notification_channels SET enabled=0 WHERE channel='EMAIL'").run();
  const legacy=(await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id,channel').all()).results;
  const legacyInquiries=(await db.prepare('SELECT * FROM inquiries ORDER BY receipt_id').all()).results;
  const legacyRoutes=(await db.prepare('SELECT * FROM inquiry_notification_channels ORDER BY channel').all()).results;
  const smsMigration=await migration('0004_sms_notifications.sql');
  await assert.rejects(db.batch([...smsMigration.map(sql=>db.prepare(sql)),db.prepare('SELECT fixture_missing_column FROM inquiries')]));
  assert.deepEqual((await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id,channel').all()).results,legacy);
  assert.deepEqual((await db.prepare('SELECT * FROM inquiry_notification_channels ORDER BY channel').all()).results,legacyRoutes);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name='inquiry_notification_created'").first()).n,1);
  await db.batch(smsMigration.map(sql=>db.prepare(sql)));
  assert.deepEqual((await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id,channel').all()).results,legacy);
  assert.deepEqual((await db.prepare('SELECT * FROM inquiries ORDER BY receipt_id').all()).results,legacyInquiries);
  assert.deepEqual((await db.prepare("SELECT * FROM inquiry_notification_channels WHERE channel!='SMS' ORDER BY channel").all()).results,legacyRoutes);
  assert.equal((await db.prepare("SELECT enabled FROM inquiry_notification_channels WHERE channel='SMS'").first()).enabled,0);
  await assert.rejects(db.prepare("INSERT INTO inquiry_notification_channels(channel) VALUES ('INVALID')").run());
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  await db.prepare('DELETE FROM inquiries').run();
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications').first()).n,0);
  pass('atomic SMS migration/rollback preserves every email/Kakao job field, inquiries, routing and FK cascade; no backfill');

  const route=async channels=>db.batch(['EMAIL','KAKAO_ALIMTALK','SMS'].map(c=>db.prepare('UPDATE inquiry_notification_channels SET enabled=? WHERE channel=?').bind(channels.includes(c)?1:0,c)));
  const row=async id=>db.prepare("SELECT * FROM inquiry_notifications WHERE receipt_id=? AND channel='SMS'").bind(id).first();
  const fresh=async name=>{await db.prepare('DELETE FROM inquiry_rate_limits').run();const result=await submit(name);assert.equal(result.status,201);return result.data.receiptId;};
  await route(['EMAIL']);
  const first=await fresh('default-email');
  assert.deepEqual((await db.prepare('SELECT channel FROM inquiry_notifications WHERE receipt_id=?').bind(first).all()).results,[{channel:'EMAIL'}]);
  await route(['EMAIL','KAKAO_ALIMTALK','SMS']);
  const both=await fresh('both-channels');
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications WHERE receipt_id=?').bind(both).first()).n,3);
  await route(['SMS']);
  await db.prepare('DELETE FROM inquiry_rate_limits').run();
  const key=randomUUID();const concurrent=await Promise.all([submit('sms-only',key),submit('sms-only',key)]);
  assert.ok(concurrent.every(r=>[200,201].includes(r.status)));
  const id=concurrent[0].data.receiptId;assert.equal(concurrent[1].data.receiptId,id);
  assert.equal((await submit('sms-only')).data.receiptId,id);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM inquiry_notifications WHERE receipt_id=?').bind(id).first()).n,1);
  pass('routing produces exactly 1 default email, 3 explicit channels or 1 SMS; duplicate receipts add no jobs');

  for(const method of ['GET','POST']) {
    assert.equal((await call('/api/admin/notifications',method)).status,401);
    assert.equal((await call('/api/admin/notifications',method,undefined,{'Cf-Access-Jwt-Assertion':'forged'})).status,401);
  }
  const login=await call('/api/admin/session','POST',undefined,{'X-Local-Admin-Secret':secret});
  cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/notifications','POST',undefined,{Origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await call('/api/admin/notifications?scenario=unknown','POST')).status,400);
  const list=await call('/api/admin/notifications');assert.equal(list.status,200);
  assert.ok(list.data.items.some(item=>item.channel==='SMS'));
  assert.deepEqual(list.data.mockChannels,['EMAIL','SMS']);
  assert.equal(list.headers.get('cache-control'),'no-store');assert.match(list.headers.get('x-robots-tag'),/noindex/);
  for(const value of [payload.phone,payload.customerName,payload.requests.details,bindings.SOLAPI_API_KEY,bindings.SOLAPI_API_SECRET,'TEST_ONLY'])
    assert.ok(!JSON.stringify(list.data).includes(value));
  pass('admin list/dispatch authentication, CSRF and query restrictions; no recipient/profile/template/auth leakage');

  const length=(await call('/test/length')).data;
  assert.deepEqual(length.default,{valid:true,bytes:68});
  for(const name of ['ascii90','hangul45','mixed90'])assert.deepEqual(length[name],{valid:true,bytes:90});
  assert.deepEqual(length.ascii91,{valid:false,bytes:91});assert.deepEqual(length.hangul46,{valid:false,bytes:92});
  for(const name of ['unsupported','unreviewed','control'])assert.deepEqual(length[name],{valid:false,bytes:null});
  assert.equal(length.empty.valid,false);
  for(const name of ['oversized','unicode','lms'])assert.equal(length[name].kind,'permanent_failure');
  pass('SMS 90-byte boundaries, reviewed EUC-KR subset, unsupported characters and LMS rejected without truncation');

  const batches=await Promise.all([call('/test/run'),call('/test/run')]);
  assert.equal(batches.reduce((n,r)=>n+r.data.result.mockSent,0),2); // both-channel receipt and SMS-only receipt
  const messages=batches.flatMap(r=>r.data.messages);assert.equal(messages.length,2);
  const message=messages.find(m=>m.messageId.endsWith(id));
  assert.equal(message.channel,'SMS');assert.equal(message.type,'SMS');
  assert.equal(message.text,'[조이플라워]\n새 견적이 접수되었습니다.\n관리자 페이지에서 확인하세요.');
  assert.equal(message.messageId,'inquiry-notification/sms/'+id);
  assert.ok(!message.text.includes(id));assert.ok(!message.text.includes('http'));
  for(const value of [payload.phone,payload.customerName,payload.requests.details,bindings.SOLAPI_API_KEY,bindings.SOLAPI_API_SECRET,'TEST_ONLY']) assert.ok(!JSON.stringify(message).includes(value));
  assert.equal((await row(id)).status,'mock_sent');
  assert.equal((await call('/test/run')).data.result.processed,0);
  assert.equal((await db.prepare("SELECT status FROM inquiry_notifications WHERE receipt_id=? AND channel='EMAIL'").bind(first).first()).status,'pending');
  assert.equal((await db.prepare("SELECT status FROM inquiry_notifications WHERE receipt_id=? AND channel='KAKAO_ALIMTALK'").bind(both).first()).status,'pending');
  pass('concurrent SMS claims; short fixed information-only body and stable receipt/channel ID; paused email/Kakao untouched');

  const dedupe=await call('/test/dedupe');
  assert.equal(dedupe.data.first.kind,'mock_sent');assert.equal(dedupe.data.second.kind,'duplicate');
  assert.equal(dedupe.data.second.previous,'mock_sent');assert.equal(dedupe.data.changed.reason,'configuration_changed');
  assert.equal(dedupe.data.lookup.kind,'mock_sent');assert.equal(dedupe.data.changedRecipient.reason,'configuration_changed');
  pass('mock provider stable-ID deduplication, result lookup and changed-message rejection');

  const duplicate=await fresh('provider-duplicate');await call('/test/run');
  // Fixture-only redelivery after a lost acknowledgement. Production has no reset API.
  await db.prepare("UPDATE inquiry_notifications SET status='pending',completed_at=NULL WHERE receipt_id=? AND channel='SMS'").bind(duplicate).run();
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

  const adminDispatch=await fresh('authenticated-default-sender');
  const dispatched=await call('/api/admin/notifications','POST');
  assert.equal(dispatched.status,200);assert.equal(dispatched.data.mockSent,1);
  assert.equal((await row(adminDispatch)).status,'mock_sent');
  pass('authenticated admin POST invokes the default SMS Mock without exposing server configuration');

  for(const reason of ['provider_rejected','auth_error','recipient_error']) {
    const permanent=await fresh(reason);assert.equal((await call('/test/run?scenario=permanent_failure&reason='+reason)).data.result.failed,1);
    job=await row(permanent);assert.equal(job.status,'failed');assert.equal(job.last_error,reason);assert.equal(job.attempts,1);
    assert.equal((await call('/test/run?now='+(Date.now()+999999))).data.result.processed,0);
  }
  pass('permanent provider/auth/recipient failure stops after one attempt');

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
  pass('expired SMS lease quarantines and rejects stale completion without a second send');

  const ackFailure=await fresh('ack-storage-failure');
  await db.prepare("CREATE TRIGGER fixture_ack_failure BEFORE UPDATE ON inquiry_notifications WHEN NEW.channel='SMS' AND NEW.status='mock_sent' BEGIN SELECT RAISE(ABORT,'fixture'); END").run();
  assert.equal((await call('/test/run')).status,503);assert.equal((await row(ackFailure)).status,'processing');
  await db.prepare('DROP TRIGGER fixture_ack_failure').run();
  const recover=await call('/test/run?now='+(Date.now()+120000));assert.equal(recover.data.messages.length,0);assert.equal((await row(ackFailure)).status,'unknown');
  pass('acceptance acknowledgement DB failure leaves lease and later quarantines; no blind resend');

  // Missing, invalid and production config must not claim pending jobs.
  const gated=await fresh('gated');
  assert.equal((await call('/test/run?scenario=provider')).status,503);
  assert.equal((await row(gated)).attempts,0);
  const changes=[{INQUIRY_NOTIFICATION_MODE:'disabled'}, {SMS_PROVIDER:'solapi'}, {SMS_PROVIDER:''},
    {SMS_SEND_ENABLED:'true'},{SMS_SEND_ENABLED:''},{SMS_RECIPIENT_PHONE:'01000000000'},
    {SMS_SENDER_PHONE:'01000000000'},{SMS_RECIPIENT_PHONE:''},{SMS_SENDER_PHONE:''}];
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
  console.log(`All ${passed} SMS test groups passed; synthetic data only, no external delivery.`);
} finally {
  await mf.dispose();const resolved=path.resolve(state);
  if(path.dirname(resolved)===path.resolve(tmpdir())&&path.basename(resolved).startsWith('joyflower-sms-')) await rm(resolved,{recursive:true,force:true});
}
