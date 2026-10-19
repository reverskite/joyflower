// Synthetic UI fixtures in the existing LOCAL D1 only. Never accepts --remote.
import './sites-env.mjs';
import { getPlatformProxy } from 'wrangler';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const action = process.argv[2];
if (!['seed', 'clean'].includes(action) || process.argv.length > 3) throw new Error('Use seed or clean (local only).');
const configPath = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (!config.d1_databases?.some(x => x.binding === 'DB') || config.d1_databases.some(x => x.remote)) throw new Error('Local DB binding required.');
const proxy = await getPlatformProxy({ configPath, persist: { path: fileURLToPath(new URL('../.wrangler/state/v3/', import.meta.url)) }, remoteBindings: false });
try {
  const db = proxy.env.DB;
  await db.prepare("DELETE FROM inquiries WHERE consent_version = 'admin-ui-test-v1'").run();
  if (action === 'seed') {
    for (let i = 0; i < 25; i++) {
      const service = ['christmas', 'planterior', 'landscape'][i % 3];
      await db.prepare(`INSERT INTO inquiries (receipt_id,idempotency_key,fingerprint,service,region,requests_json,budget,reference_slug,customer_name,phone,consent,consent_version,consent_notice_json,created_at,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,1,'admin-ui-test-v1',?,?,?)`).bind('JF-' + randomUUID(), randomUUID(), 'admin-ui-fixture-' + i,
        service, '가상 테스트 지역 ' + (i + 1), JSON.stringify({ space: '실제 현장 아님', workDate: '가상 희망 일정', installDate: '가상 설치 일정', details: '관리 화면 검증용 가상 요청입니다. 실제 고객 정보가 아닙니다.' }),
        '가상 예산', service === 'planterior' ? 'penthouse-planterior' : null, '가상 테스트 담당자', '01000000000',
        JSON.stringify({ purpose: '로컬 UI 검증', items: '가상 데이터만 사용', retention: '검증 종료 후 삭제', contact: '로컬 테스트 담당자 (운영 문의처 아님)' }),
        Date.now() - i * 60_000, ['new','reviewing','completed'][i % 3]).run();
    }
    console.log('Created 25 synthetic admin UI fixtures in local D1.');
  } else console.log('Removed admin-ui-test-v1 fixtures from local D1 (cascade removes their history).');
} finally { await proxy.dispose(); }
