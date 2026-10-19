import assert from 'node:assert/strict';

// The optional logo gallery was removed from the homepage at the owner's request.
const base = process.argv[2] ?? 'http://127.0.0.1:5197';
const response = await fetch(base, { headers: { 'User-Agent': 'Yeti/1.1 (+http://naver.me/spd)' } });
assert.equal(response.status, 200);
const html = await response.text();
assert.ok(!html.includes('id="brand-projects"'));
assert.ok(!html.includes('/__brand-logo-preview/'));
assert.ok(!html.includes('/brand-logos/'));
assert.ok(!html.includes('deployment/brand-logos/pending'));
assert.ok(html.includes('id="portfolio"'));
assert.ok(html.includes('HOW WE WORK'));
for (const path of ['/deployment/brand-logos/pending/lg-energy-solution.svg', '/__brand-logo-preview/lg-energy-solution.svg', '/brand-logos/lg-energy-solution.svg']) {
  assert.equal((await fetch(new URL(path, base))).status, 404, path);
}
console.log('PASS removed logo gallery: no section or logo assets in server HTML; existing portfolio and workflow retained; preview assets unavailable.');
