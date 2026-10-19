// Synthetic local databases only. Production config, auth and remote D1 are never used.
import './sites-env.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const parent = path.join(project, '.sites-runtime', 'operation-backup-drill');
await mkdir(parent, { recursive: true });
const workspace = path.join(parent, randomUUID());
await mkdir(workspace);
const configFile = path.join(workspace, 'wrangler.json');
const fixtureId = '12345678-1234-4234-8234-123456789abc';
await writeFile(configFile, JSON.stringify({ name: 'joyflower-backup-fixture', compatibility_date: '2026-05-15',
  d1_databases: [{ binding: 'DB', database_name: 'isolated-backup-fixture', database_id: fixtureId }] }));
const source = path.join(workspace, '.wrangler', 'state');
const restored = path.join(workspace, 'restored');
function cli(args, state = source) {
  assert.ok(!args.includes('--remote'));
  const result = spawnSync(process.execPath, ['--import', './scripts/sites-env.mjs',
    path.join(project, 'node_modules/wrangler/bin/wrangler.js'), 'd1', ...args,
    '--local', '--config', configFile, ...(args[0] === 'export' ? [] : ['--persist-to', state])], { cwd: project, encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw Error(`Local backup fixture failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}
function rows(state) {
  return JSON.parse(cli(['execute', 'isolated-backup-fixture', '--command',
    'SELECT * FROM inquiries ORDER BY receipt_id; SELECT * FROM inquiry_status_history ORDER BY id; SELECT * FROM inquiry_notifications ORDER BY receipt_id, channel; SELECT * FROM inquiry_notification_channels ORDER BY channel; PRAGMA foreign_key_check;', '--json'], state));
}
let report;
try {
  const migrations = ['0000_inquiries.sql', '0001_admin_status.sql', '0002_inquiry_notifications.sql', '0003_notification_channels.sql', '0004_sms_notifications.sql'];
  const sql = [];
  for (const file of migrations) sql.push(await readFile(path.join(project, 'drizzle', file), 'utf8'));
  sql.push(`INSERT INTO inquiries(receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,customer_name,phone,consent,consent_version,consent_notice_json,created_at,status,status_updated_at,status_version)
    VALUES('JF-${randomUUID()}','${randomUUID()}','synthetic-fingerprint','christmas','가상 지역','{"details":"실제 고객 정보 아님"}','테스트','가상 고객','01000000000',1,'local-test-v1','{}',1000,'completed',2000,1);
    INSERT INTO inquiry_status_history(receipt_id,previous_status,next_status,changed_at,actor)
    SELECT receipt_id,'reviewing','completed',2000,'synthetic-operator' FROM inquiries;`);
  const seed = path.join(workspace, 'fixture.sql');
  await writeFile(seed, sql.join('\n').replaceAll('--> statement-breakpoint', ''));
  cli(['execute', 'isolated-backup-fixture', '--file', seed]);
  const before = rows(source).map(item => item.results);
  const backup = path.join(workspace, 'backup.sql');
  cli(['export', 'isolated-backup-fixture', '--output', backup]);
  const bytes = await readFile(backup);
  assert.ok(bytes.length > 0);
  cli(['execute', 'isolated-backup-fixture', '--file', backup], restored);
  const after = rows(restored).map(item => item.results);
  assert.deepEqual(after, before);
  assert.equal(after.at(-1).length, 0);
  report = { scope: 'isolated local fixtures only', passed: true, migrations: migrations.length,
    inquiryRecords: after[0].length, statusHistoryRecords: after[1].length,
    outboxRecords: after[2].length, channelRecords: after[3].length,
    foreignKeyErrors: 0, backupBytes: bytes.length, backupSha256: createHash('sha256').update(bytes).digest('hex'),
    operatingDbReadOrWritten: false };
} finally {
  const absolute = await realpath(workspace);
  const safeParent = await realpath(parent);
  assert.equal(path.dirname(absolute), safeParent);
  assert.match(path.basename(absolute), /^[a-f0-9-]{36}$/);
  await rm(absolute, { recursive: true, force: true });
}
await writeFile(path.join(project, 'deployment/local-backup-drill-20261012.json'),
  JSON.stringify({ ...report, artifactsRemovedAfterTest: true }, null, 2));
console.log('PASS isolated local D1 export/import: inquiry, history, outbox and channel data match; no production DB access.');
