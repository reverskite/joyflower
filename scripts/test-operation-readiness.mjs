// Pure, offline tests: no operating keys, external requests or production DB.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyInquiryChallenge, turnstileConfigured } from '../lib/inquiry-turnstile.ts';
import { inquiryRetention, threeMonthsAfterKorea } from '../lib/inquiry-retention.ts';

const hostname = 'operation-fixture.example.invalid';
const env = { TURNSTILE_HOSTNAME: hostname, TURNSTILE_SITE_KEY: 'unit-fixture-site-key',
  TURNSTILE_SECRET_KEY: 'unit-fixture-secret-not-real' };
test('Siteverify is pinned and sends only token, secret, IP and independent retry UUID', async () => {
  const result = await verifyInquiryChallenge('synthetic-token', env, hostname, '192.0.2.1', async (url, init) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.ok(init.signal);
    const body = JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(), ['idempotency_key', 'remoteip', 'response', 'secret']);
    assert.equal(body.secret, env.TURNSTILE_SECRET_KEY); assert.equal(body.remoteip, '192.0.2.1');
    assert.match(body.idempotency_key, /^[a-f0-9-]{36}$/);
    return Response.json({ success: true, hostname, action: 'inquiry' });
  });
  assert.equal(result, 'valid');
});
test('forged, expired, replayed, wrong action/host and malformed provider results fail closed', async () => {
  for (const result of [{ success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, hostname: 'other.invalid', action: 'inquiry' },
    { success: true, hostname, action: 'login' }, { success: 'true', hostname, action: 'inquiry' }, null]) {
    assert.notEqual(await verifyInquiryChallenge('fixture-token', env, hostname, '192.0.2.1',
      async () => Response.json(result)), 'valid');
  }
});
test('missing/oversize token, invalid/test config and network/HTTP/JSON failures never pass', async () => {
  const unexpected = async () => { throw new Error('must not request'); };
  assert.equal(await verifyInquiryChallenge('', env, hostname, '', unexpected), 'invalid');
  assert.equal(await verifyInquiryChallenge('x'.repeat(2049), env, hostname, '', unexpected), 'invalid');
  assert.equal(await verifyInquiryChallenge('fixture', {}, hostname, '', unexpected), 'unavailable');
  assert.equal(turnstileConfigured({ ...env, TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, hostname), false);
  assert.equal(turnstileConfigured({ ...env, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, hostname), false);
  for (const transport of [async () => { throw new Error('timeout'); },
    async () => new Response('', { status: 503 }), async () => new Response('not json')])
    assert.equal(await verifyInquiryChallenge('fixture', env, hostname, '192.0.2.1', transport), 'unavailable');
});
test('three calendar months use Korea dates, month-end clamping and leap years, never 90 days', () => {
  for (const [start, end] of [['2026-01-31', '2026-04-30'], ['2027-11-30', '2028-02-29'],
    ['2026-11-30', '2027-02-28'], ['2026-10-12', '2027-01-12']]) {
    const input = Date.parse(start + 'T00:30:00+09:00');
    assert.equal(threeMonthsAfterKorea(input), Date.parse(end + 'T00:30:00+09:00'));
  }
});
test('completion requires matching history; reopened/incomplete records cannot be auto-expired', () => {
  const closed = Date.parse('2026-06-30T10:00:00+09:00');
  const row = { status: 'completed', created_at: closed - 1000, status_updated_at: closed, status_version: 1 };
  const history = { next_status: 'completed', changed_at: closed };
  const expires = threeMonthsAfterKorea(closed);
  assert.equal(inquiryRetention(row, history, expires - 1).state, 'retained');
  assert.equal(inquiryRetention(row, history, expires).state, 'expired');
  assert.equal(inquiryRetention(row, undefined, expires).state, 'review_required');
  assert.equal(inquiryRetention({ ...row, status_updated_at: null }, history, expires).state, 'review_required');
  assert.equal(inquiryRetention(row, { ...history, changed_at: closed - 1 }, expires).state, 'review_required');
  assert.equal(inquiryRetention({ ...row, status: 'reviewing' }, history, expires).state, 'in_progress');
  const newClose = expires + 1000;
  assert.equal(inquiryRetention({ ...row, status_updated_at: newClose, status_version: 3 },
    { ...history, changed_at: newClose }, newClose).expiresAt, threeMonthsAfterKorea(newClose));
});
