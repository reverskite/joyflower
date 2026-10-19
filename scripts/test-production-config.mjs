import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionConfig, readProductionConfig, adminAccessConfig } from './production-config.ts';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inquiryPrivacy } from '../lib/inquiry-privacy.mjs';
import { inquirySettings } from '../lib/inquiry-settings.ts';

// Synthetic identifiers for pure validation only; never written as real configuration.
const fixture = {
  workerName: 'joyflower-test', workersSubdomain: 'test-account',
  accountId: '1234567890abcdef1234567890abcdef', databaseName: 'isolated-test',
  databaseId: '12345678-1234-4234-8234-123456789abc',
};
const accessFixture = { teamDomain: 'https://synthetic-team.cloudflareaccess.com', audience: 'a'.repeat(64),
  emails: 'admin@example.com', hostname: 'joyflower-test.test-account.workers.dev' };

test('server-only Access configuration binds to the production hostname and keeps admin disabled', () => {
  const config = productionConfig(fixture, accessFixture);
  assert.equal(config.worker.vars.ADMIN_ACCESS_AUDIENCE, accessFixture.audience);
  assert.equal(config.worker.vars.ADMIN_ACCESS_EMAILS, accessFixture.emails);
  assert.equal(config.worker.vars.ADMIN_ENABLED, 'false');
  assert.equal(config.worker.vars.INQUIRY_INTAKE_ENABLED, 'false');
  assert.ok(Object.keys(config.worker.vars).every(key => !key.startsWith('NEXT_PUBLIC_ADMIN')));
});

test('reject invalid, mismatched or extra admin settings instead of silently ignoring them', () => {
  for (const invalid of [null, {}, [], { ...accessFixture, hostname: 'other.example.com' },
    { ...accessFixture, teamDomain: 'https://other.example.com' }, { ...accessFixture, audience: '' },
    { ...accessFixture, emails: 'admin@example.com,other@example.com' },
    { ...accessFixture, ADMIN_ENABLED: 'true' }, { ...accessFixture, API_SECRET: 'synthetic' }])
    assert.throws(() => adminAccessConfig(invalid, 'https://' + accessFixture.hostname));
});

test('production origin and DB binding match the validated identifiers', () => {
  const config = productionConfig(fixture);
  assert.equal(config.siteUrl, 'https://joyflower-test.test-account.workers.dev');
  assert.equal(config.worker.name, fixture.workerName);
  assert.equal(config.worker.account_id, fixture.accountId);
  assert.deepEqual(config.worker.d1_databases, [{ binding: 'DB', database_name: fixture.databaseName,
    database_id: fixture.databaseId, migrations_dir: fileURLToPath(new URL('../drizzle', import.meta.url)) }]);
  assert.equal(config.worker.workers_dev, true);
  assert.equal(config.worker.preview_urls, false);
});

test('a custom domain controls SEO and routes, without publishing duplicate workers.dev or preview URLs', () => {
  const config = productionConfig({ ...fixture, siteUrl: 'https://business.fixture/' });
  assert.equal(config.siteUrl, 'https://business.fixture');
  assert.deepEqual(config.worker.routes, [{ pattern: 'business.fixture', custom_domain: true }]);
  assert.equal(config.worker.workers_dev, false);
  assert.equal(config.worker.preview_urls, false);
  assert.deepEqual(config.worker.d1_databases, productionConfig(fixture).worker.d1_databases);
  assert.equal(config.worker.vars.ADMIN_ENABLED, 'false');
  assert.equal(config.worker.vars.INQUIRY_INTAKE_ENABLED, 'false');
  assert.equal(config.worker.vars.INQUIRY_NOTIFICATION_MODE, 'disabled');
  assert.equal(config.worker.vars.SMS_SEND_ENABLED, 'false');
  assert.equal(productionConfig({ ...fixture, siteUrl: 'https://joyflower-test.test-account.workers.dev' }).worker.workers_dev, true);
});

test('unsafe or non-origin public site URLs cannot reach the build', () => {
  for (const siteUrl of ['', null, false, 42, 'http://business.fixture', 'https://localhost',
    'https://127.0.0.1', 'https://example.com', 'https://business.invalid', 'https://business.fixture/path',
    'https://business.fixture?key=value', 'https://business.fixture#fragment', 'https://business.fixture:8443',
    'https://user:password@business.fixture', 'https://other.account.workers.dev', ' https://business.fixture'])
    assert.throws(() => productionConfig({ ...fixture, siteUrl }));
});

test('custom-domain Access configuration must match its hostname and still stays disabled', () => {
  const access = { ...accessFixture, hostname: 'business.fixture' };
  const config = productionConfig({ ...fixture, siteUrl: 'https://business.fixture' }, access);
  assert.equal(config.worker.vars.ADMIN_ACCESS_AUDIENCE, access.audience);
  assert.equal(config.worker.vars.ADMIN_ENABLED, 'false');
  assert.throws(() => productionConfig({ ...fixture, siteUrl: 'https://business.fixture' }, accessFixture));
});

test('legacy Access settings remain on disk but are not trusted for a custom-domain migration', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'joyflower-production-config-'));
  try {
    const productionFile = path.join(directory, 'production.json');
    const adminFile = path.join(directory, 'admin-access.json');
    writeFileSync(productionFile, JSON.stringify({ ...fixture, siteUrl: 'https://business.fixture' }));
    const original = JSON.stringify(accessFixture);
    writeFileSync(adminFile, original);
    const migrated = readProductionConfig(productionFile, adminFile);
    assert.equal(migrated.worker.vars.ADMIN_ENABLED, 'false');
    assert.equal(migrated.worker.vars.ADMIN_ACCESS_AUDIENCE, undefined);
    assert.equal(readFileSync(adminFile, 'utf8'), original);
    writeFileSync(adminFile, JSON.stringify({ ...accessFixture, audience: '' }));
    assert.throws(() => readProductionConfig(productionFile, adminFile));
    writeFileSync(adminFile, JSON.stringify({ ...accessFixture, hostname: 'unrelated.fixture' }));
    assert.throws(() => readProductionConfig(productionFile, adminFile));
    writeFileSync(adminFile, JSON.stringify({ ...accessFixture, hostname: 'business.fixture' }));
    assert.equal(readProductionConfig(productionFile, adminFile).worker.vars.ADMIN_ACCESS_AUDIENCE, accessFixture.audience);
  } finally {
    // mkdtempSync creates this isolated directory below the OS temporary root.
    assert.equal(path.dirname(directory), tmpdir());
    assert.ok(path.basename(directory).startsWith('joyflower-production-config-'));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('sensitive functionality stays disabled, with no scheduler or sender configuration', () => {
  const worker = productionConfig(fixture).worker;
  assert.deepEqual(worker.vars, { INQUIRY_INTAKE_ENABLED: 'false', INQUIRY_LOCAL_TEST_MODE: 'false',
    ADMIN_ENABLED: 'false', INQUIRY_NOTIFICATION_MODE: 'disabled', SMS_SEND_ENABLED: 'false',
    INQUIRY_PRIVACY_VERSION: inquiryPrivacy.version, INQUIRY_RETENTION_NOTICE: inquiryPrivacy.retention,
    INQUIRY_PRIVACY_CONTACT: inquiryPrivacy.contact });
  assert.equal('triggers' in worker, false);
  assert.equal('queues' in worker, false);
});

test('incomplete example cannot be used as operational settings', () => {
  const example = JSON.parse(readFileSync(new URL('../deployment/production.example.json', import.meta.url), 'utf8'));
  assert.throws(() => productionConfig(example));
});

test('confirmed privacy notice stays consistent without enabling intake or bypassing missing prerequisites', () => {
  const vars = productionConfig(fixture).worker.vars;
  const settings = inquirySettings(vars, 'joyflower-test.test-account.workers.dev');
  assert.equal(settings.retention, inquiryPrivacy.retention);
  assert.equal(settings.contact, inquiryPrivacy.contact);
  assert.equal(settings.version, inquiryPrivacy.version);
  assert.equal(settings.enabled, false);
  const enabled = { ...vars, INQUIRY_INTAKE_ENABLED: 'true', DB: {}, INQUIRY_RATE_LIMIT_SECRET: 'synthetic-fixture-'.repeat(3) };
  assert.equal(inquirySettings(enabled, 'example.com').enabled, false, 'Public intake requires Turnstile configuration');
  Object.assign(enabled, { TURNSTILE_SITE_KEY: 'unit-fixture-site-key', TURNSTILE_SECRET_KEY: 'unit-fixture-secret-not-real', TURNSTILE_HOSTNAME: 'example.com' });
  assert.equal(inquirySettings(enabled, 'example.com').enabled, true);
  assert.equal(inquirySettings({ ...enabled, TURNSTILE_HOSTNAME: 'another.invalid' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, TURNSTILE_SECRET_KEY: '' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, INQUIRY_RATE_LIMIT_SECRET: '' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, DB: undefined }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, INQUIRY_RETENTION_NOTICE: '' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, INQUIRY_PRIVACY_CONTACT: '' }, 'example.com').enabled, false);
  assert.equal(inquirySettings({ ...enabled, INQUIRY_LOCAL_TEST_MODE: 'true' }, 'example.com').localTest, false);
});

for (const [field, badValues] of Object.entries({
  workerName: ['', 'site-creator-vinext-starter', '../other', 'name.invalid'],
  workersSubdomain: ['', 'https://test.workers.dev', 'test/path'],
  accountId: ['', '0'.repeat(32), 'not-an-account'],
  databaseName: ['', 'site-creator-d1', '../dev'],
  databaseId: ['', '00000000-0000-4000-8000-000000000000', '00000000-0000-0000-0000-000000000000', 'invalid'],
})) {
  test(`reject invalid ${field}`, () => {
    for (const value of badValues) assert.throws(() => productionConfig({ ...fixture, [field]: value }));
  });
}

test('reject unexpected fields rather than copying secrets to Worker vars', () => {
  assert.throws(() => productionConfig({ ...fixture, API_SECRET: 'synthetic-secret' }));
  for (const value of [null, [], 'invalid', 42]) assert.throws(() => productionConfig(value));
});

test('missing configuration fails before a build can run', () => {
  assert.throws(() => readProductionConfig(new URL('./missing-production-fixture.json', import.meta.url)),
    /Missing deployment\/production.json/);
});
