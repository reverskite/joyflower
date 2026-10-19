// Applies only data-preserving notification migrations to this project's local D1.
// No credentials, query bindings or existing customer data are printed.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
assert.equal(path.resolve(process.cwd()).toLowerCase(), path.resolve(root).toLowerCase(), 'Run from the project root');
const args = process.argv.slice(2);
assert.ok(args.length <= 1 && args.every(x => x.startsWith('--channels=')), 'Only --channels=EMAIL,KAKAO_ALIMTALK,SMS is supported');
const selected = args.length ? args[0].slice('--channels='.length).split(',').filter(Boolean) : undefined;
if (selected) assert.ok(new Set(selected).size === selected.length && selected.every(c => ['EMAIL','KAKAO_ALIMTALK','SMS'].includes(c)), 'Invalid channel selection');
await import('./sites-env.mjs');
const { getPlatformProxy } = await import('wrangler');
const configPath = path.join(root, 'dist/server/wrangler.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.ok(config.d1_databases?.some(b => b.binding === 'DB'));
assert.ok(config.d1_databases.every(b => !b.remote));
const platform = await getPlatformProxy({configPath, persist: {path: path.join(root,'.wrangler/state/v3')}, remoteBindings:false});
try {
  const db = platform.env.DB;
  const before = await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first();
  const existing = await db.prepare("SELECT type,name FROM sqlite_schema WHERE name IN ('inquiry_notifications','inquiry_notification_due','inquiry_notification_created')").all();
  if (existing.results.length) {
    assert.equal(existing.results.length,3,'Incomplete notification schema; stop and review');
    console.log('Local notification schema already present; no changes made.');
  } else {
    const sql = await readFile(path.join(root,'drizzle/0002_inquiry_notifications.sql'),'utf8');
    const statements = sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
    assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first(),before);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM inquiry_notifications').first()).n,0);
    console.log('Local notification table/index/atomic trigger created; existing inquiry count unchanged; no backfill.');
  }
  const columns = (await db.prepare('PRAGMA table_info(inquiry_notifications)').all()).results;
  if (!columns.some(c => c.name === 'channel')) {
    const oldJobs = (await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id').all()).results;
    const sql = await readFile(path.join(root,'drizzle/0003_notification_channels.sql'),'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    const copied = (await db.prepare(`SELECT receipt_id,status,attempts,created_at,next_attempt_at,lease_token,
      lease_until,completed_at,last_error FROM inquiry_notifications WHERE channel='EMAIL' ORDER BY receipt_id`).all()).results;
    assert.deepEqual(copied, oldJobs);
    assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first(),before);
    console.log('Channel migration applied; all existing email job fields and inquiry count preserved; no Kakao backfill.');
  } else {
    assert.ok(columns.some(c=>c.name==='provider_message_id'));
    const routes=(await db.prepare('SELECT channel,enabled FROM inquiry_notification_channels ORDER BY channel').all()).results;
    assert.ok(routes.length === 2 || routes.length === 3);
    assert.deepEqual(routes.filter(r=>r.channel!=='SMS').map(r=>r.channel),['EMAIL','KAKAO_ALIMTALK']);
    console.log('Channel schema already present; no schema changes made.');
  }
  const routes=(await db.prepare('SELECT channel,enabled FROM inquiry_notification_channels ORDER BY channel').all()).results;
  if (!routes.some(r=>r.channel==='SMS')) {
    const oldJobs=(await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id,channel').all()).results;
    const sql=await readFile(path.join(root,'drizzle/0004_sms_notifications.sql'),'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
    assert.deepEqual((await db.prepare('SELECT * FROM inquiry_notifications ORDER BY receipt_id,channel').all()).results,oldJobs);
    assert.deepEqual((await db.prepare("SELECT channel,enabled FROM inquiry_notification_channels WHERE channel!='SMS' ORDER BY channel").all()).results,routes);
    assert.equal((await db.prepare("SELECT enabled FROM inquiry_notification_channels WHERE channel='SMS'").first()).enabled,0);
    assert.deepEqual(await db.prepare('SELECT COUNT(*) AS n FROM inquiries').first(),before);
    console.log('SMS migration applied; all job fields, existing routing and inquiry count preserved; SMS off, no backfill.');
  } else {
    assert.deepEqual(routes.map(r=>r.channel),['EMAIL','KAKAO_ALIMTALK','SMS']);
    const definitions=(await db.prepare("SELECT sql FROM sqlite_schema WHERE name IN ('inquiry_notifications','inquiry_notification_channels')").all()).results;
    assert.equal(definitions.length,2);
    assert.ok(definitions.every(r=>r.sql.includes("'SMS'")),'Incomplete SMS constraints');
    console.log('SMS schema already present; no schema changes made.');
  }
  if (selected) {
    await db.batch(['EMAIL','KAKAO_ALIMTALK','SMS'].map(c => db.prepare('UPDATE inquiry_notification_channels SET enabled=? WHERE channel=?').bind(selected.includes(c)?1:0,c)));
    console.log('Local routing updated; affects future jobs and pauses unselected channels; no sender invoked.');
  }
  // D1 exposes quick_check; full integrity_check is available on the local SQLite file.
  assert.deepEqual((await db.prepare('PRAGMA quick_check').all()).results,[{quick_check:'ok'}]);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  console.log('Local D1 quick_check=ok; foreign_key_check=0; no sender invoked.');
} catch {
  console.error('Local notification migration/check failed. Details suppressed; inspect schema before retry.');
  process.exitCode=1;
} finally { await platform.dispose(); }
