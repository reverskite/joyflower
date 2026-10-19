// Read-only public GETs; no credentials, form submission, notifications or DB access.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin = 'https://thejoyflower.co.kr';
async function get(url) { return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) }); }
const [home, sitemap, robots, inquiry, admin, api, www, http] = await Promise.all([
  '/', '/sitemap.xml', '/robots.txt', '/inquiry', '/api/admin/inquiries', '/api/inquiries',
].map(route => get(origin + route)).concat([get('https://www.thejoyflower.co.kr/'), get('http://thejoyflower.co.kr/')]));
const [html, xml, rules, form] = await Promise.all([home.text(), sitemap.text(), robots.text(), inquiry.text()]);
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.ok(urls.every(url => url.startsWith(origin + '/')));
const details = urls.filter(url => url.startsWith(origin + '/portfolio/'));
const states = [];
for (const url of details) {
  const response = await get(url);
  states.push({ path: new URL(url).pathname, status: response.status });
  await response.body?.cancel();
}
const result = { scope: 'public GET only; live deployment may differ from local unpublished source',
  home: home.status, inquiry: inquiry.status, sitemap: sitemap.status, robots: robots.status,
  sitemapUrlCount: urls.length, portfolioCount: details.length, portfolioResponses: states,
  canonicalOfficial: /<link[^>]+(?:rel="canonical"[^>]+href="https:\/\/thejoyflower\.co\.kr\/?"|href="https:\/\/thejoyflower\.co\.kr\/?"[^>]+rel="canonical")/.test(html),
  naverVerificationPresent: html.includes('name="naver-site-verification"'),
  phonePresent: form.includes('tel:01034110792'), kakaoPresent: form.includes('https://open.kakao.com/me/joyflower_tree'),
  intakeClosedNotice: form.includes('현재 온라인 접수는 받지 않습니다.'),
  adminAnonymousStatus: admin.status, inquiryGetStatus: api.status,
  www: { status: www.status, location: www.headers.get('location') },
  http: { status: http.status, location: http.headers.get('location') },
  robotsBlocksAdmin: rules.includes('/admin'), robotsBlocksApi: rules.includes('/api'),
  adminNoindex: /noindex/.test(admin.headers.get('x-robots-tag') || ''),
  robotsSitemapReference: rules.includes(origin + '/sitemap.xml'), robotsRules: rules.slice(0,8000) };
await writeFile(new URL('../deployment/activation-live-public-20261012.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (home.status !== 200 || inquiry.status !== 200 || sitemap.status !== 200 || robots.status !== 200 ||
    states.some(item => item.status !== 200) || ![401,403,302].includes(admin.status) || api.status !== 405 ||
    !result.canonicalOfficial || !result.naverVerificationPresent || !result.phonePresent || !result.kakaoPresent || !result.intakeClosedNotice ||
    www.status !== 301 || www.headers.get('location') !== origin + '/' || http.status !== 301 || http.headers.get('location') !== origin + '/')
  process.exitCode = 1;
