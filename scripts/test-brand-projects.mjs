import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brandProjects, publicBrandProjects, approvedBrandLogo } from '../app/brand-projects-data.ts';
import { portfolioItems } from '../app/portfolio-data.ts';

test('only evidenced projects are visible; public order is stable and source data is unchanged', () => {
  const before = JSON.stringify(brandProjects);
  const shown = publicBrandProjects();
  assert.equal(new Set(shown.map(entry => entry.id)).size, shown.length);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i - 1].displayPriority <= shown[i].displayPriority);
  assert.equal(JSON.stringify(brandProjects), before);
  const existing = new Set(portfolioItems.map(project => project.slug));
  for (const entry of shown) {
    assert.ok(entry.projectVerified && entry.projectEvidence.trim());
    if (entry.portfolio) assert.ok(existing.has(entry.portfolio.slug));
  }
  for (const entry of brandProjects.filter(entry => !entry.projectVerified)) {
    assert.equal(publicBrandProjects([{ ...entry, isVisible: true }]).length, 0);
  }
});

test('approval, identity, evidence, local path and dimensions are all required independently', () => {
  const fixture = { ...brandProjects[0], usageStatus: 'approved', approvalReference: 'in-memory test fixture only', logoPath: '/brand-logos/lg-energy-solution.svg' };
  assert.equal(approvedBrandLogo(fixture), true);
  for (const delta of [
    { usageStatus: 'pending' }, { usageStatus: 'unavailable' }, { approvalReference: '' },
    { logoIdentityVerified: false }, { projectVerified: false }, { projectEvidence: '' },
    { isVisible: false }, { logoPath: null }, { logoPath: '/brand-logos/../pending/logo.svg' },
    { logoPath: 'https://external.example/logo.svg' }, { logoWidth: 0 }, { logoHeight: undefined },
  ]) assert.equal(approvedBrandLogo({ ...fixture, ...delta }), false);
  for (const entry of brandProjects.filter(entry => entry.usageStatus !== 'approved')) assert.equal(approvedBrandLogo(entry), false);
});

test('a verified case without a matching detail page is retained without a fabricated link', () => {
  const fixture = { ...brandProjects[0], portfolioId: 'not-a-real-portfolio' };
  const [result] = publicBrandProjects([fixture]);
  assert.equal(result.portfolio, undefined);
});

test('future confirmed projects can be ordered through data without mutating portfolio records', () => {
  const before = JSON.stringify(portfolioItems);
  const fixture = { ...brandProjects[0], id: 'test-only-brand', displayPriority: 5 };
  assert.equal(publicBrandProjects([...brandProjects, fixture])[0].id, fixture.id);
  assert.equal(JSON.stringify(portfolioItems), before);
});

test('research downloads are intact and are not shipped as public assets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../deployment/brand-logos/download-manifest.json', import.meta.url), 'utf8'));
  for (const asset of manifest) {
    assert.ok(asset.file.startsWith('deployment/brand-logos/pending/'));
    const bytes = await readFile(new URL(`../${asset.file}`, import.meta.url));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    if (asset.file.endsWith('.svg')) {
      const svg = bytes.toString('utf8');
      assert.match(svg, /<svg\b/);
      assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+\s*=|javascript:|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i);
    }
  }
  const files = await readdir(new URL('../public/brand-logos/', import.meta.url));
  for (const entry of brandProjects.filter(approvedBrandLogo)) {
    assert.ok((await readFile(new URL(`../public${entry.logoPath}`, import.meta.url))).length > 0);
  }
  for (const file of files.filter(file => !file.startsWith('.'))) {
    assert.ok(brandProjects.some(entry => approvedBrandLogo(entry) && entry.logoPath === `/brand-logos/${file}`), `Unapproved public asset: ${file}`);
  }
});
