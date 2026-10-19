// Offline in-memory fixtures only; never add test projects to the real data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portfolioItems, sortPortfolioItems } from '../app/portfolio-data.ts';

test('priority sorting preserves every real case and never mutates its source', () => {
  const before = JSON.stringify(portfolioItems);
  const sorted = sortPortfolioItems();
  assert.equal(JSON.stringify(portfolioItems), before);
  assert.equal(sorted.length, portfolioItems.length);
  assert.deepEqual(new Set(sorted), new Set(portfolioItems));
  assert.equal(sorted[0].slug, 'oci-headquarters');
  assert.equal(sorted[1].slug, 'warm-christmas');
  for (const item of portfolioItems) if (item.displayPriority !== undefined)
    assert.ok(Number.isSafeInteger(item.displayPriority) && item.displayPriority >= 0);
});

test('ties and unpinned cases preserve original order, including category filtering', () => {
  const example = portfolioItems[0];
  const fixtures = [
    { ...example, slug: 'unpinned-a', displayPriority: undefined },
    { ...example, slug: 'tie-a', displayPriority: 20 },
    { ...example, slug: 'first', displayPriority: 0 },
    { ...example, slug: 'tie-b', displayPriority: 20 },
    { ...example, slug: 'unpinned-b', displayPriority: undefined },
  ];
  assert.deepEqual(sortPortfolioItems(fixtures).map(x => x.slug), ['first', 'tie-a', 'tie-b', 'unpinned-a', 'unpinned-b']);
  for (const category of ['christmas', 'planterior', 'landscape']) {
    assert.deepEqual(sortPortfolioItems().filter(x => x.category === category),
      sortPortfolioItems(portfolioItems.filter(x => x.category === category)));
  }
});

test('a future case can be pinned through data alone without dropping existing cases', () => {
  const synthetic = { ...portfolioItems[0], slug: 'test-only-priority-fixture', displayPriority: 5 };
  const sorted = sortPortfolioItems([...portfolioItems, synthetic]);
  assert.equal(sorted[0], synthetic);
  assert.equal(sorted.length, portfolioItems.length + 1);
  assert.deepEqual(sorted.filter(x => x !== synthetic), sortPortfolioItems());
  assert.ok(!portfolioItems.includes(synthetic));
});
