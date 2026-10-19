// Offline generated RSA/JWKS fixtures only. No Cloudflare login or network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
const require = createRequire(await realpath(fileURLToPath(new URL('../node_modules/wrangler/package.json', import.meta.url))));
const { build } = require('esbuild');
const result = await build({ entryPoints: [fileURLToPath(new URL('../lib/admin-auth.ts', import.meta.url))],
  define: { 'import.meta.env.DEV': 'false' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { verifyAccessToken } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const pairs = await Promise.all([0, 1].map(() => webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify'])));
const keys = await Promise.all(pairs.map(async (pair, index) => ({ ...await webcrypto.subtle.exportKey('jwk', pair.publicKey),
  kid: 'fixture-key-' + index, alg: 'RS256', use: 'sig' })));
function config(name) { return { issuer: `https://${name}.cloudflareaccess.com`, audience: 'synthetic-audience', emails: ['owner@example.invalid'] }; }
async function token(settings, index = 0, header = {}, claims = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const prefix = encode({ alg: 'RS256', kid: keys[index].kid, ...header }) + '.' + encode({ iss: settings.issuer,
    aud: settings.audience, exp: now + 3600, iat: now - 1, sub: 'synthetic-owner', email: settings.emails[0], ...claims });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pairs[index].privateKey, new TextEncoder().encode(prefix));
  return prefix + '.' + Buffer.from(signature).toString('base64url');
}
test('cached key is reused; rotated key refreshes immediately on the same pinned issuer', async () => {
  const settings = config('rotation-fixture'); let calls = 0;
  const transport = async (url, options) => {
    assert.equal(url, settings.issuer + '/cdn-cgi/access/certs');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ keys: [keys[calls++ === 0 ? 0 : 1]] });
  };
  assert.ok(await verifyAccessToken(await token(settings), settings, transport));
  assert.ok(await verifyAccessToken(await token(settings), settings, transport));
  assert.equal(calls, 1);
  assert.ok(await verifyAccessToken(await token(settings, 1), settings, transport));
  assert.equal(calls, 2);
});
test('unknown kid bursts trigger at most one extra refresh and never authenticate', async () => {
  const settings = config('burst-fixture'); let calls = 0;
  const transport = async () => { calls++; return Response.json({ keys: [keys[0]] }); };
  assert.ok(await verifyAccessToken(await token(settings), settings, transport));
  const unknown = await token(settings, 0, { kid: 'unknown' });
  assert.deepEqual(await Promise.all(Array.from({ length: 12 }, () => verifyAccessToken(unknown, settings, transport))), Array(12).fill(null));
  assert.equal(calls, 2);
});
test('failed rotation refresh denies the new key but retains the last verified key', async () => {
  const settings = config('outage-fixture'); let calls = 0;
  const transport = async () => { if (++calls > 1) throw Error('offline fixture'); return Response.json({ keys: [keys[0]] }); };
  assert.ok(await verifyAccessToken(await token(settings), settings, transport));
  assert.equal(await verifyAccessToken(await token(settings, 1), settings, transport), null);
  assert.ok(await verifyAccessToken(await token(settings), settings, transport));
  assert.equal(calls, 2);
});
test('oversized streamed JWKS without Content-Length is cancelled and rejected', async () => {
  const settings = config('stream-fixture'); let cancelled = false;
  const transport = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(60_000)); },
    cancel() { cancelled = true; } }));
  assert.equal(await verifyAccessToken(await token(settings), settings, transport), null);
  assert.equal(cancelled, true);
});
test('invalid key sets and oversized declared bodies fail closed', async () => {
  let index = 0;
  for (const response of [Response.json({ keys: [null] }), Response.json({ keys: Array(31).fill(keys[0]) }),
    new Response('{}', { headers: { 'Content-Length': '100001' } }), new Response('not-json')]) {
    const settings = config('invalid-fixture-' + index++);
    assert.equal(await verifyAccessToken(await token(settings), settings, async () => response), null);
  }
});
test('untrusted key URLs and invalid identities do not redirect JWKS lookup or bypass signature', async () => {
  const settings = config('signature-fixture'); let calls = 0;
  const transport = async url => { calls++; assert.equal(url, settings.issuer + '/cdn-cgi/access/certs'); return Response.json({ keys: [keys[0]] }); };
  assert.equal(await verifyAccessToken(await token(settings, 0, {}, { email: 'outsider@example.invalid' }), settings, transport), null);
  assert.equal(calls, 0);
  assert.ok(await verifyAccessToken(await token(settings, 0, { jku: 'https://attacker.invalid/keys', x5u: 'https://attacker.invalid/cert' }), settings, transport));
  const forged = await token(settings, 1, { kid: keys[0].kid });
  assert.equal(await verifyAccessToken(forged, settings, transport), null);
  assert.equal(calls, 1);
});
