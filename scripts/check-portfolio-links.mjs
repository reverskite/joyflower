// Read-only HTML checks; no JavaScript execution, submissions or external requests.
// node --experimental-strip-types scripts/check-portfolio-links.mjs http://127.0.0.1:5189 [https://configured-site-origin]
import assert from 'node:assert/strict';
import { portfolioItems, portfolioSeo, relatedPortfolioItems, sortPortfolioItems } from '../app/portfolio-data.ts';

const base = new URL(process.argv[2] || 'http://127.0.0.1:5189');
assert.ok(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Local HTTP loopback only');
const expectedOrigin = process.argv[3] ? new URL(process.argv[3]).origin : undefined;
const paths = portfolioItems.map(item => `/portfolio/${item.slug}`);
assert.equal(new Set(paths).size, paths.length, 'Unique portfolio slugs');

function decode(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(?:x([\da-f]+)|(\d+));/gi,
    (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10)));
}
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map(([, key, double, single]) => [key.toLowerCase(), decode(double ?? single)]));
}
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(([tag]) => attributes(tag));
}
function links(html) {
  return tags(html, 'a').map(tag => tag.href).filter(Boolean);
}
async function html(path, userAgent = 'JoyflowerLocalLinkCheck') {
  const response = await fetch(new URL(path, base), {
    redirect: 'manual', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, 200, `${path}: HTTP 200 without redirects`);
  assert.match(response.headers.get('content-type') || '', /text\/html/, `${path}: HTML response`);
  // RSC payloads and scripts must never count as discoverable HTML anchors.
  const raw = await response.text();
  if (expectedOrigin) {
    const business = [...raw.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(([, json]) => JSON.parse(json)).find(data => data['@type'] === 'LocalBusiness');
    assert.equal(business?.url, expectedOrigin, `${path}: JSON-LD business origin`);
    assert.equal(business?.['@id'], `${expectedOrigin}/#business`, `${path}: JSON-LD business ID`);
  }
  return raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
}
function metadata(body, path) {
  assert.equal([...body.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>/gi)].length, 1, `${path}: one title`);
  assert.equal([...body.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].length, 1, `${path}: one H1`);
  const descriptions = tags(body, 'meta').filter(tag => tag.name === 'description');
  assert.equal(descriptions.length, 1, `${path}: one description`);
  assert.ok(descriptions[0].content?.trim(), `${path}: nonempty description`);
  if (expectedOrigin) {
    const canonical = tags(body, 'link').filter(tag => tag.rel === 'canonical');
    assert.deepEqual(canonical.map(tag => new URL(tag.href).href), [new URL(path, expectedOrigin).href], `${path}: canonical unchanged`);
    const meta = tags(body, 'meta');
    assert.deepEqual(meta.filter(tag => tag.property === 'og:url').map(tag => new URL(tag.content).href),
      [new URL(path, expectedOrigin).href], `${path}: Open Graph URL`);
    for (const image of ['og:image', 'twitter:image']) {
      const value = meta.find(tag => tag.property === image || tag.name === image)?.content;
      assert.ok(value, `${path}: ${image} present`);
      assert.equal(new URL(value).origin, expectedOrigin, `${path}: ${image} origin`);
    }
  }
}

const index = await html('/portfolio');
metadata(index, '/portfolio');
const directory = index.match(/<details\b[^>]*class="portfolio-directory"[^>]*>([\s\S]*?)<\/details>/i);
assert.ok(directory, 'Visitor-facing native disclosure is server-rendered');
const directoryLinks = links(directory[1]);
assert.deepEqual(directoryLinks.slice().sort(), paths.slice().sort(), 'Every case has one ordinary directory anchor');
assert.deepEqual(directoryLinks, sortPortfolioItems().map(item => `/portfolio/${item.slug}`), 'Directory follows the shared display priority');
const caseLinks = [...new Set(links(index).filter(href => href.startsWith('/portfolio/')))];
assert.deepEqual(caseLinks.sort(), paths.slice().sort(), 'Initial HTML exposes exactly the actual detail URLs');
assert.equal(tags(index, 'a').filter(tag => tag.class?.split(' ').includes('project-card')).length, 6, 'Initial card count remains six');
const firstChristmasCards = sortPortfolioItems(portfolioItems.filter(item => item.category === 'christmas'))
  .slice(0, 6).map(item => `/portfolio/${item.slug}`);
const cardLinks = body => tags(body, 'a').filter(tag => tag.class?.split(' ').includes('project-card')).map(tag => tag.href);
assert.deepEqual(cardLinks(index), firstChristmasCards, 'Portfolio initial cards follow priority');
assert.deepEqual(cardLinks(await html('/')), firstChristmasCards, 'Homepage uses the same first six cases');
assert.deepEqual(cardLinks(await html('/christmas')), firstChristmasCards, 'Service preview uses the same priority');
assert.match(index, />더 보기<\/button>/, 'Existing load-more button retained');

const yeti = await html('/portfolio', 'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)');
assert.deepEqual([...new Set(links(yeti).filter(href => href.startsWith('/portfolio/')))].sort(), paths.slice().sort(), 'Yeti receives the same complete link set');

for (const item of portfolioItems) {
  const path = `/portfolio/${item.slug}`;
  const body = await html(path);
  metadata(body, path);
  const expectedSeo = portfolioSeo(item);
  assert.equal(decode(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)[1]), expectedSeo.title, `${path}: data-driven title`);
  assert.equal(tags(body, 'meta').find(tag => tag.name === 'description').content, expectedSeo.description, `${path}: data-driven description`);
  const photos = tags(body, 'img');
  const primary = photos.find(photo => photo.src === item.image);
  assert.equal(primary?.alt, item.detail?.alt ?? item.alt, `${path}: representative alt`);
  assert.ok(Number(primary.width) > 0 && Number(primary.height) > 0, `${path}: representative dimensions`);
  const gallerySection = body.match(/<section\b[^>]*class="section case-gallery"[^>]*>([\s\S]*?)<\/section>/i);
  const galleryPhotos = tags(gallerySection?.[1] ?? '', 'img');
  assert.equal(galleryPhotos.length, item.gallery?.length ?? 0, `${path}: gallery count`);
  for (const [index, photo] of (item.gallery ?? []).entries()) {
    const rendered = galleryPhotos[index];
    assert.equal(rendered?.src, photo.image, `${path}: gallery image path`);
    assert.equal(rendered?.alt, photo.alt, `${path}: gallery alt`);
    assert.equal(rendered?.loading, 'lazy', `${path}: gallery lazy loading`);
  }
  const relatedSection = body.match(/<section\b[^>]*class="section case-related"[^>]*>([\s\S]*?)<\/section>/i);
  assert.deepEqual(relatedSection ? links(relatedSection[1]) : [], relatedPortfolioItems(item).map(project => `/portfolio/${project.slug}`), `${path}: related links from the same data`);
  assert.ok(links(body).includes('/portfolio'), `${path}: return link`);
  assert.ok(links(body).includes(`/inquiry?service=${item.category}&reference=${item.slug}`), `${path}: inquiry link`);
  console.log(`PASS ${path}: HTTP 200, exact metadata, alt, related, return and inquiry links`);
}
// Regional service information and relevant cases must also exist before hydration.
const serviceChecks = [
  { path: '/', title: /대전.*공간 연출/, heading: /조이플라워/, text: ['대전', '세종'], cases: [] },
  { path: '/christmas', title: /대전·세종.*크리스마스트리.*대여·설치/, heading: /대전·세종.*크리스마스트리 대여/, text: ['2~6m', '보통 2개월', '직접 설치·철거', '기업 크리스마스트리 렌탈'], cases: ['daejeon-nakwon-hotel', 'sejong-ak-plaza', 'oci-headquarters', 'lg-energy-solution'] },
  { path: '/planterior', title: /대전.*조화 플랜테리어/, heading: /대전 조화 플랜테리어/, text: ['현장 조건', '설치 가능 범위'], cases: ['penthouse-planterior', 'library-planterior'] },
  { path: '/landscape', title: /대전.*조경관리/, heading: /대전 조경관리/, text: ['현장 확인 후 협의', '작업 가능 범위'], cases: [] },
];
const serviceTitles = new Set();
const serviceDescriptions = new Set();
for (const check of serviceChecks) {
  const body = await html(check.path, 'Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)');
  metadata(body, check.path);
  const title = decode(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)[1]);
  const description = tags(body, 'meta').find(tag => tag.name === 'description').content;
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)[1];
  const text = decode(main.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
  const heading = decode(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)[1].replace(/<[^>]*>/g, ' '));
  assert.match(title, check.title, `${check.path}: regional service title`);
  assert.match(heading, check.heading, `${check.path}: useful H1`);
  for (const value of check.text) assert.ok(text.includes(value), `${check.path}: server-rendered ${value}`);
  for (const slug of check.cases) {
    assert.ok(portfolioItems.some(item => item.slug === slug), `Existing related case: ${slug}`);
    assert.ok(links(main).includes(`/portfolio/${slug}`), `${check.path}: ordinary related case link ${slug}`);
  }
  assert.ok(links(main).includes('/portfolio'), `${check.path}: reachable portfolio index`);
  assert.ok(links(main).some(href => href === '/inquiry' || href.startsWith('/inquiry?service=')), `${check.path}: inquiry CTA`);
  assert.ok(!tags(body, 'meta').some(tag => tag.name === 'robots' && /noindex/.test(tag.content)), `${check.path}: indexable public service`);
  serviceTitles.add(title);
  serviceDescriptions.add(description);
}
assert.equal(serviceTitles.size, serviceChecks.length, 'Unique home/service titles');
assert.equal(serviceDescriptions.size, serviceChecks.length, 'Unique home/service descriptions');
console.log('PASS regional SEO: four server-rendered pages, unique metadata, service facts, related cases and inquiry CTAs.');
metadata(await html('/inquiry'), '/inquiry');
const sitemapResponse = await fetch(new URL('/sitemap.xml', base), { signal: AbortSignal.timeout(15_000) });
assert.equal(sitemapResponse.status, 200, 'Sitemap HTTP 200');
const sitemap = await sitemapResponse.text();
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, loc]) => decode(loc));
if (expectedOrigin) {
  assert.equal(new Set(locations).size, locations.length, 'No duplicate sitemap URLs');
  assert.deepEqual(locations.filter(loc => new URL(loc).pathname.startsWith('/portfolio/')).sort(), paths.map(path => `${expectedOrigin}${path}`).sort(), 'All cases retained in the actual sitemap');
  assert.deepEqual(locations.slice().sort(), ['/', '/christmas', '/planterior', '/landscape', '/portfolio', '/inquiry', ...paths]
    .map(path => new URL(path, expectedOrigin).href).sort(), 'Only the six public pages and actual cases belong in the sitemap');
  const robotsResponse = await fetch(new URL('/robots.txt', base), { signal: AbortSignal.timeout(15_000) });
  assert.equal(robotsResponse.status, 200);
  assert.match(robotsResponse.headers.get('content-type'), /text\/plain/);
  const robots = await robotsResponse.text();
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Allow:\s*\//i);
  assert.ok(robots.includes(`Sitemap: ${expectedOrigin}/sitemap.xml`));
} else {
  console.log('NOTE: supply the configured origin as argument 2 to require canonical and sitemap URL checks.');
}
console.log(`PASS: ${paths.length}/${paths.length} detail pages reachable from initial HTML without JavaScript; Yeti, six-card preview, load-more, service navigation${expectedOrigin ? ', canonical and sitemap' : ''}.`);
