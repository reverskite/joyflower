import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAdminResponse } from '../lib/admin-response.ts';

test('Access redirects, login HTML and denied sessions become a safe login instruction', async () => {
  for (const response of [new Response(null, { status: 302 }),
    new Response('private login HTML', { headers: { 'content-type': 'text/html' } }),
    Response.json({ error: 'private denial detail' }, { status: 401 }),
    Response.json({ error: 'private denial detail' }, { status: 403 }),
    { type: 'opaqueredirect' }])
    await assert.rejects(readAdminResponse(response), /관리자 로그인/);
});
test('upstream failures and malformed JSON never expose raw server content', async () => {
  for (const response of [new Response('private upstream detail', { status: 502 }),
    new Response('private invalid JSON', { headers: { 'content-type': 'application/json' } })])
    await assert.rejects(readAdminResponse(response), /서버 응답을 확인하지 못했습니다/);
});
test('authenticated JSON and status conflict messages remain usable', async () => {
  assert.deepEqual(await readAdminResponse(Response.json({ items: [], total: 0 })), { items: [], total: 0 });
  await assert.rejects(readAdminResponse(Response.json({ error: '상태가 변경되었습니다.' }, { status: 409 })), /상태가 변경/);
});
