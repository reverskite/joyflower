// Run: node --experimental-strip-types scripts/check-seo.mjs
// All configured-host checks stay in this process; no server or env file is changed.
import assert from 'node:assert/strict';
import { readdir, stat } from 'node:fs/promises';
import { getSiteOrigin, pageMetadata, localBusinessData, sitemapPaths } from '../lib/seo.ts';
import { portfolioCategories, portfolioItems, portfolioSeo, relatedPortfolioItems } from '../app/portfolio-data.ts';

// Validate the same source consumed by the UI, without mutating real cases.
async function validatePortfolio(items) {
  const slugs = new Set();
  const categories = new Set(portfolioCategories.map(([id]) => id));
  async function photo(value, label) {
    assert.match(value.image, /^\/(?!\/)[^?#\\%]+$/, `${label}: local public image path`);
    assert.ok(!value.image.split('/').some(part => part === '.' || part === '..'), `${label}: safe image path`);
    assert.ok((await stat(new URL(`../public${value.image}`, import.meta.url))).isFile(), `${label}: image file exists`);
    assert.ok(value.alt?.trim(), `${label}: image alt is required`);
    if (value.width !== undefined || value.height !== undefined) {
      assert.ok(Number.isInteger(value.width) && value.width > 0 && Number.isInteger(value.height) && value.height > 0, `${label}: positive image dimensions`);
    }
  }
  for (const item of items) {
    assert.match(item.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase slug with single hyphens');
    assert.ok(!slugs.has(item.slug), `Duplicate slug / detail URL: ${item.slug}`);
    slugs.add(item.slug);
    assert.ok(item.name?.trim(), `${item.slug}: project name is required`);
    assert.ok(categories.has(item.category), `${item.slug}: known category`);
    for (const key of ['categoryLabel', 'title', 'description', 'space', 'decorations']) {
      assert.ok(item[key]?.trim(), `${item.slug}: ${key} is required`);
    }
    for (const key of ['region', 'seoTitle', 'seoDescription']) {
      if (item[key] !== undefined) assert.ok(item[key].trim(), `${item.slug}: ${key} cannot be empty`);
    }
    if (item.detailDescription) assert.ok(item.detailDescription.every(text => text.trim()), `${item.slug}: nonempty detailed paragraphs`);
    await photo(item, item.slug);
    for (const image of item.gallery ?? []) {
      await photo(image, `${item.slug} gallery`);
      assert.ok(image.width && image.height, `${item.slug}: gallery dimensions are required`);
    }
  }
}

await validatePortfolio(portfolioItems);
// These deliberately invalid fixtures exist only in memory.
const sample = portfolioItems[0];
for (const [label, fixtures] of [
  ['duplicate slug', [sample, sample]],
  ['invalid slug', [{ ...sample, slug: 'Bad Slug' }]],
  ['missing name', [{ ...sample, name: '' }]],
  ['invalid category', [{ ...sample, category: 'invalid' }]],
  ['missing image', [{ ...sample, image: '/__missing_validation_image__.webp' }]],
  ['bad gallery path', [{ ...sample, gallery: [{ ...sample, image: '/../package.json' }] }]],
  ['missing gallery image', [{ ...sample, gallery: [{ ...sample, image: '/__missing_gallery_image__.webp' }] }]],
  ['empty alt', [{ ...sample, alt: '' }]],
  ['empty SEO title', [{ ...sample, seoTitle: '' }]],
  ['invalid dimensions', [{ ...sample, width: 0 }]],
]) {
  await assert.rejects(() => validatePortfolio(fixtures), undefined, `Reject ${label}`);
}

const originalOrigin = process.env.NEXT_PUBLIC_SITE_URL;
try {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  for (const value of ['', 'not-a-url', 'https://example.com', 'http://localhost:5173',
    'https://127.0.0.1', 'https://domain.invalid', 'https://domain.test',
    'https://business.fixture/path', 'https://business.fixture?query=1',
    'https://user:password@business.fixture']) {
    assert.equal(getSiteOrigin(value), undefined);
  }
  const input = { title: '고유 제목', description: '고유 설명', image: '/installation.webp' };
  const unset = pageMetadata(input, '/christmas');
  assert.equal(unset.alternates, undefined);
  assert.equal(unset.openGraph.images, undefined);
  assert.equal(unset.twitter.card, 'summary');
  assert.equal(localBusinessData().url, undefined);

  // A synthetic fixture used only in memory, never an actual site configuration.
  process.env.NEXT_PUBLIC_SITE_URL = 'https://seo-validation.fixture';
  const origin = getSiteOrigin();
  const configured = pageMetadata(input, '/christmas');
  assert.equal(configured.alternates.canonical, `${origin}/christmas`);
  assert.equal(configured.openGraph.title, input.title);
  assert.equal(configured.openGraph.images[0].url, `${origin}/installation.webp`);
  assert.equal(configured.twitter.card, 'summary_large_image');
  assert.equal(localBusinessData().url, origin);
  assert.equal(localBusinessData().telephone, undefined);
  for (const item of portfolioItems) {
    const seo = portfolioSeo(item);
    const generated = pageMetadata(seo, `/portfolio/${item.slug}`);
    assert.ok(seo.title.trim() && seo.description.trim() && seo.imageAlt.trim(), `${item.slug}: complete metadata`);
    assert.equal(generated.alternates.canonical, `${origin}/portfolio/${item.slug}`);
    assert.equal(generated.openGraph.images[0].url, `${origin}${item.image}`);
    const related = relatedPortfolioItems(item);
    assert.ok(related.length <= 3 && related.every(candidate => candidate.slug !== item.slug && candidate.category === item.category));
  }

  const pageFiles = [];
  async function collect(directory, prefix = '.') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await collect(new URL(`${entry.name}/`, directory), `${prefix}/${entry.name}`);
      else if (entry.name === 'page.tsx') pageFiles.push(`${prefix}/page.tsx`);
    }
  }
  await collect(new URL('../app/', import.meta.url));
  const paths = sitemapPaths(pageFiles.filter(file => file !== './privacy/page.tsx' && !file.startsWith('./admin/')), portfolioItems.map(item => item.slug));
  const publicNonPortfolioPaths = sitemapPaths(pageFiles.filter(file => file !== './privacy/page.tsx' && !file.startsWith('./admin/')), [])
    .filter(path => !path.startsWith('/portfolio/'));
  assert.equal(paths.length, publicNonPortfolioPaths.length + portfolioItems.length, 'Case count is data-driven');
  assert.equal(new Set(paths).size, paths.length);
  for (const item of portfolioItems) assert.ok(paths.includes(`/portfolio/${item.slug}`));
  assert.ok(paths.includes('/') && paths.includes('/inquiry'));
  assert.ok(paths.every(value => !value.includes('[') && !value.includes('?')));
  assert.deepEqual(sitemapPaths(['./_private/page.tsx', './(public)/page.tsx'], []), ['/']);
  console.log(`SEO checks passed: domain safeguards, metadata, JSON-LD, ${paths.length} public paths including ${portfolioItems.length} portfolio cases.`);
  console.log('Portfolio validation passed: slugs, categories, names, image files, dimensions, alt, SEO, related cases; 10 invalid fixtures rejected.');
} finally {
  if (originalOrigin === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalOrigin;
}
