// Generated offline JWT/Siteverify fixtures; no production keys, DB or network.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const require = createRequire(realpathSync('node_modules/wrangler/package.json'));
const { build } = require('esbuild');
const { Miniflare } = require('miniflare');
const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']);
const jwk = { ...await webcrypto.subtle.exportKey('jwk', pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const issuer = 'https://joyflower-unit-fixture.cloudflareaccess.com';
const audience = 'unit-test-audience-123456';
const now = Math.floor(Date.now() / 1000);
const baseClaims = { iss: issuer, aud: [audience], exp: now + 3600, iat: now - 1, sub: 'synthetic-admin-id', email: 'admin@example.invalid' };
async function token(claims = {}, header = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const prefix = encode({ alg: 'RS256', kid: 'test-key', ...header }) + '.' + encode({ ...baseClaims, ...claims });
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(prefix));
  return prefix + '.' + Buffer.from(signature).toString('base64url');
}
const host = 'diagnostic.example.invalid';
const secret = 'synthetic-turnstile-secret-not-real';
const compiled = await build({ stdin: { resolveDir: process.cwd(), contents: `
import { handleAdminTurnstile } from './lib/admin-turnstile.ts';
const used = new Set();
globalThis.fetch = async (url, init) => {
  if (url === ${JSON.stringify(issuer + '/cdn-cgi/access/certs')}) return Response.json({keys:[${JSON.stringify(jwk)}]});
  if (url !== 'https://challenges.cloudflare.com/turnstile/v0/siteverify') throw Error('network forbidden');
  const body = JSON.parse(init.body);
  if (body.secret !== ${JSON.stringify(secret)} || init.redirect !== 'error') throw Error('incorrect server settings');
  if (body.response === 'network-failure') throw Error('sensitive provider error');
  const valid = !used.has(body.response) && !['expired','forged'].includes(body.response);
  used.add(body.response);
  return Response.json({success:valid, hostname:body.response==='wrong-host'?'other.invalid':${JSON.stringify(host)},
    action:body.response==='wrong-action'?'other':'inquiry'});
};
export default { fetch(request, env) {
  const isolated = {...env};
  Object.defineProperty(isolated,'DB',{get(){throw Error('DB must not be accessed');}});
  return handleAdminTurnstile(request,isolated);
}};` }, bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',define:{'import.meta.env.DEV':'false'},logLevel:'silent' });
const bindings = { ADMIN_ENABLED:'true', ADMIN_ACCESS_TEAM_DOMAIN:issuer, ADMIN_ACCESS_AUDIENCE:audience,
  ADMIN_ACCESS_EMAILS:baseClaims.email, TURNSTILE_SITE_KEY:'synthetic-public-sitekey',
  TURNSTILE_SECRET_KEY:secret, TURNSTILE_HOSTNAME:host, INQUIRY_INTAKE_ENABLED:'false', INQUIRY_NOTIFICATION_MODE:'disabled' };
const options = { modules:true, script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',bindings };
const mf = new Miniflare(options);
let assertion = await token();
async function call(value='normal', extra={}, method='POST', origin='https://'+host, raw) {
  const headers = { 'cf-access-jwt-assertion':assertion,'cf-connecting-ip':'192.0.2.1',
    origin,'content-type':'application/json',...extra };
  const response = await mf.dispatchFetch('https://'+host+'/api/admin/turnstile', {method,headers,
    ...(method==='POST'?{body:raw ?? JSON.stringify({token:value})}:{})});
  assert.equal(response.headers.get('cache-control'),'no-store', 'Diagnostic handler must return guarded response: '+response.status);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  const text = await response.text();
  assert.ok(!text.includes(secret) && (!assertion || !text.includes(assertion)) && !text.includes('192.0.2.1'));
  return {status:response.status,body:JSON.parse(text)};
}
try {
  assert.deepEqual(await call(),{status:200,body:{result:'valid'}});
  assert.deepEqual(await call(),{status:200,body:{result:'invalid'}});
  for(const value of ['expired','forged','wrong-host','wrong-action'])
    assert.deepEqual(await call(value),{status:200,body:{result:'invalid'}});
  console.log('PASS normal, replay, simulated expiry, hostname/action checks; no DB dependency');
  assert.deepEqual(await call('network-failure'),{status:503,body:{result:'unavailable'}});
  console.log('PASS provider failure is unavailable, never expected rejection success');
  for(const identity of ['', 'forged', await token({email:'outsider@example.invalid'}),await token({exp:now-1}),await token({aud:'wrong'})]) {
    assertion=identity; assert.equal((await call('unused')).status,401);
  }
  assertion=await token();
  assert.equal((await call('unused',{},'GET')).status,405);
  assert.equal((await call('unused',{},'POST','https://evil.invalid')).status,403);
  assert.equal((await call('unused',{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await call('unused',{'content-type':'text/plain'})).status,415);
  for(const raw of ['{}','null','[]','{bad',JSON.stringify({token:'x',hostname:host}),JSON.stringify({token:'x'.repeat(2049)})])
    assert.equal((await call('unused',{},'POST','https://'+host,raw)).status,400);
  assert.equal((await call('unused',{},'POST','https://'+host,'x'.repeat(4097))).status,413);
  console.log('PASS JWT/allowlist/expiry, CSRF, methods, JSON and streamed body limits');
  await mf.setOptions({...options,bindings:{...bindings,ADMIN_ENABLED:'false'}});
  assert.equal((await call()).status,401);
  await mf.setOptions({...options,bindings:{...bindings,TURNSTILE_SECRET_KEY:''}});
  assert.deepEqual(await call(),{status:503,body:{result:'unavailable'}});
  console.log('PASS existing admin-off gate retained; missing widget secret fails closed');
} finally { await mf.dispose(); }
