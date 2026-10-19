// Anonymous GET only. Never emit redirect query strings, cookies or response bodies.
import { readFileSync, writeFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../deployment/admin-access.json', import.meta.url), 'utf8'));
const origin = 'https://thejoyflower.co.kr';
const paths = ['/', '/portfolio', '/inquiry', '/admin/', '/admin/login', '/admin/inquiries',
  '/admin/inquiries/check-protection', '/api/admin/', '/api/admin/inquiries',
  '/api/admin/summary', '/api/admin/session', '/api/admin/notifications', '/api/admin/check-protection'];
const results = [];
for (const path of paths) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const location = response.headers.get('location');
  const destination = location ? new URL(location, origin) : null;
  const protectedPath = path.startsWith('/admin') || path.startsWith('/api/admin');
  const accessRedirect = !!destination && destination.origin === config.teamDomain && [302,303,307].includes(response.status);
  results.push({ path, status: response.status, accessRedirect,
    audienceMatches: destination?.searchParams.has('kid') ? destination.searchParams.get('kid') === config.audience : null,
    pass: protectedPath ? accessRedirect : response.status === 200 });
  await response.body?.cancel();
}
const report = { checkedAt: new Date().toISOString(), anonymousOnly: true, results };
writeFileSync(new URL('../deployment/access-public-20261013.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (results.some(row => !row.pass || row.audienceMatches === false)) process.exitCode = 1;
