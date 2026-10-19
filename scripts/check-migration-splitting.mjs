import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);');
try {
  for (const name of ['0000_inquiries.sql','0001_admin_status.sql','0002_inquiry_notifications.sql',
    '0003_notification_channels.sql','0004_sms_notifications.sql']) {
    const migration = readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8');
    // Remote D1's trigger splitter rejects BEGIN followed by CRLF although local SQLite accepts it.
    assert.equal(migration.includes('\r'), false, `${name}: use LF for remote D1 trigger compatibility`);
    const sql = migration +
      `\nINSERT INTO d1_migrations(name) VALUES ('${name}');`;
    const statements = unstable_splitSqlQuery(sql);
    db.exec('BEGIN');
    try {
      for (let i = 0; i < statements.length; i++) {
        try { db.exec(statements[i]); }
        catch (error) { throw new Error(`${name}, statement ${i + 1}: ${error.message}\n${statements[i]}`); }
      }
      db.exec('COMMIT');
      console.log(`PASS ${name}: ${statements.length} Wrangler statements`);
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (process.argv[2]) {
    const remote = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    assert.ok(remote.every((result) => result.success));
    const expected = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY type,name").all();
    const normalize = (rows) => rows.map((row) => ({ ...row, sql: row.sql.replace(/\s+/g, ' ').trim() }));
    assert.deepEqual(normalize(remote.at(-1).results), normalize(expected));
    console.log(`PASS remote schema matches ${expected.length} local tables/indexes/triggers`);
  }
} finally { db.close(); }
