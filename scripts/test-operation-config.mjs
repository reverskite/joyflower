import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operationPlan, operationVars, operationBlockers, operationEvidenceKeys } from './operation-config.ts';
import { productionConfig } from './production-config.ts';

const closed = { stage: 'closed', activationApproval: '', turnstileSiteKey: '',
  evidence: Object.fromEntries(operationEvidenceKeys.map(k => [k, ''])) };
const host = 'business.fixture';
const production = { workerName: 'operation-fixture', workersSubdomain: 'test-account',
  accountId: '1234567890abcdef1234567890abcdef', databaseName: 'isolated-fixture',
  databaseId: '12345678-1234-4234-8234-123456789abc', siteUrl: `https://${host}` };
const access = { teamDomain: 'https://synthetic-team.cloudflareaccess.com', audience: 'a'.repeat(64),
  emails: 'admin@example.invalid', hostname: host };
const ready = { ...closed, activationApproval: 'in-memory approval fixture; not actual authorization',
  turnstileSiteKey: 'synthetic-public-sitekey',
  evidence: Object.fromEntries(operationEvidenceKeys.map(k => [k, 'isolated test evidence'])) };

test('closed plan preserves every existing production flag and does not create secrets', () => {
  assert.deepEqual(productionConfig(production, undefined, closed), productionConfig(production));
  assert.deepEqual(operationVars(closed, host, false), {});
});
test('unknown, secret, sender and local-bypass fields are rejected', () => {
  for (const extra of [{ TURNSTILE_SECRET_KEY: 'not-real' }, { INQUIRY_RATE_LIMIT_SECRET: 'not-real' },
    { SMS_SEND_ENABLED: 'true' }, { INQUIRY_NOTIFICATION_MODE: 'mock' }, { INQUIRY_LOCAL_TEST_MODE: 'true' }])
    assert.throws(() => operationPlan({ ...closed, ...extra }));
  for (const value of [null, [], {}, { ...closed, stage: 'all' },
    { ...closed, activationApproval: true }, { ...closed, evidence: {} },
    { ...closed, evidence: { ...closed.evidence, unexpected: '' } }]) assert.throws(() => operationPlan(value));
});
test('public widget settings persist without opening intake and reject dummy keys', () => {
  const vars = productionConfig(production, undefined, { ...closed, turnstileSiteKey: ready.turnstileSiteKey }).worker.vars;
  assert.equal(vars.TURNSTILE_HOSTNAME, host); assert.equal(vars.TURNSTILE_SITE_KEY, ready.turnstileSiteKey);
  assert.equal(vars.INQUIRY_INTAKE_ENABLED, 'false'); assert.equal(vars.ADMIN_ENABLED, 'false');
  for (const key of ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF', ' bad key'])
    assert.throws(() => operationPlan({ ...closed, turnstileSiteKey: key }));
});
test('admin stage needs explicit approval, official-host Access and verified Access flow', () => {
  for (const delta of [{ activationApproval: '' }, { evidence: { ...ready.evidence, access: '' } }])
    assert.throws(() => operationVars({ ...ready, stage: 'admin-only', ...delta }, host, true));
  assert.throws(() => operationVars({ ...ready, stage: 'admin-only' }, host, false));
  const vars = productionConfig(production, access, { ...ready, stage: 'admin-only' }).worker.vars;
  assert.equal(vars.ADMIN_ENABLED, 'true'); assert.equal(vars.INQUIRY_INTAKE_ENABLED, 'false');
  assert.throws(() => productionConfig(production, { ...access, hostname: 'old.account.workers.dev' }, { ...ready, stage: 'admin-only' }));
});
test('intake cannot open when any operational prerequisite is missing', () => {
  for (const key of operationEvidenceKeys)
    assert.throws(() => operationVars({ ...ready, stage: 'intake', evidence: { ...ready.evidence, [key]: '' } }, host, true));
  assert.throws(() => operationVars({ ...ready, stage: 'intake', turnstileSiteKey: '' }, host, true));
  assert.ok(operationBlockers(closed, false, 'intake').includes('retentionProcedure'));
});
test('ready fixture enables only admin and intake, never notifications, cron or local bypass', () => {
  const worker = productionConfig(production, access, { ...ready, stage: 'intake' }).worker;
  assert.equal(worker.vars.ADMIN_ENABLED, 'true'); assert.equal(worker.vars.INQUIRY_INTAKE_ENABLED, 'true');
  assert.equal(worker.vars.INQUIRY_LOCAL_TEST_MODE, 'false'); assert.equal(worker.vars.INQUIRY_NOTIFICATION_MODE, 'disabled');
  assert.equal(worker.vars.SMS_SEND_ENABLED, 'false'); assert.equal(worker.triggers, undefined);
  assert.ok(!('TURNSTILE_SECRET_KEY' in worker.vars)); assert.ok(!('INQUIRY_RATE_LIMIT_SECRET' in worker.vars));
});
test('closing the stage restores safe flags even when historical evidence remains', () => {
  const vars = productionConfig(production, access, { ...ready, stage: 'closed' }).worker.vars;
  assert.equal(vars.ADMIN_ENABLED, 'false'); assert.equal(vars.INQUIRY_INTAKE_ENABLED, 'false');
});
