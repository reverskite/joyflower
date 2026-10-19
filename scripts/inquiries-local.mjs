// OS-local operator tool. It has no HTTP endpoint and never accepts --remote.
import './sites-env.mjs';
import { getPlatformProxy } from 'wrangler';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (!config.d1_databases?.some(x => x.binding === 'DB') || config.d1_databases.some(x => x.remote))
  throw new Error('Build the local DB binding first. Remote bindings are not permitted.');
const [action = 'list', receiptId, status] = process.argv.slice(2);
if (!['list', 'show', 'status', 'purge-tests'].includes(action)) throw new Error('Use list, show <receipt>, status <receipt> <new|reviewing|completed>, or purge-tests.');
if (['show', 'status'].includes(action) && !/^JF-[0-9a-f-]{36}$/i.test(receiptId || '')) throw new Error('Invalid receipt number.');
if (action === 'status' && !['new', 'reviewing', 'completed'].includes(status)) throw new Error('Invalid status.');
// Wrangler CLI adds /v3 itself; getPlatformProxy takes the already-versioned root.
const platform = await getPlatformProxy({ configPath, persist: { path: fileURLToPath(new URL('../.wrangler/state/v3/', import.meta.url)) }, remoteBindings: false });
try {
  const db = platform.env.DB;
  if (action === 'list') {
    const result = await db.prepare('SELECT receipt_id, service, status, created_at FROM inquiries ORDER BY created_at DESC LIMIT 30').all();
    console.table(result.results); // Default output omits names, phones, and requests.
  } else if (action === 'show') {
    const row = await db.prepare('SELECT receipt_id, service, region, requests_json, budget, reference_slug, customer_name, phone, consent_version, created_at, status FROM inquiries WHERE receipt_id = ?1').bind(receiptId).first();
    console.log(row || 'No matching local record.');
  } else if (action === 'status') {
    const row = await db.prepare('SELECT status_version FROM inquiries WHERE receipt_id = ?').bind(receiptId).first();
    if (!row) throw new Error('No matching local record.');
    const now = Date.now();
    const result = await db.batch([
      db.prepare(`INSERT INTO inquiry_status_history (receipt_id, previous_status, next_status, changed_at, actor)
        SELECT receipt_id, status, ?, ?, 'local:operator-cli' FROM inquiries WHERE receipt_id = ? AND status_version = ? AND status != ?`)
        .bind(status, now, receiptId, row.status_version, status),
      db.prepare('UPDATE inquiries SET status = ?, status_updated_at = ?, status_version = status_version + 1 WHERE receipt_id = ? AND status_version = ? AND status != ?')
        .bind(status, now, receiptId, row.status_version, status),
    ]);
    console.log(`Updated ${result[1].meta.changes} local record(s) with audit history.`);
  } else {
    const result = await db.prepare("DELETE FROM inquiries WHERE consent_version = 'local-test-v1'").run();
    console.log(`Removed ${result.meta.changes} local-test-v1 record(s).`);
  }
} finally { await platform.dispose(); }
