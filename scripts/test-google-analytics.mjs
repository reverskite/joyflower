import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackPublicPage, GA_MEASUREMENT_ID, GA_SITE_ORIGIN } from '../lib/google-analytics.ts';

const portfolio = ['/portfolio/oci-headquarters'];
function browser(origin = GA_SITE_ORIGIN, existingTag = false) {
  const scripts = [];
  return {
    scripts,
    location: { origin, href: origin + '/?phone=SYNTHETIC_PRIVATE#private' },
    document: {
      title: 'SYNTHETIC_PRIVATE',
      referrer: 'https://referrer.example/private?phone=SYNTHETIC_PRIVATE#private',
      querySelector: () => existingTag || scripts.length ? {} : null,
      createElement: () => ({}),
      head: { appendChild: script => scripts.push(script) },
    },
  };
}
const commands = host => (host.dataLayer ?? []).map(args => Array.from(args));
const views = host => commands(host).filter(args => args[0] === 'event' && args[1] === 'page_view');

test('one script/config; initial view and SPA transitions exactly once, including back', () => {
  const host = browser();
  assert.equal(trackPublicPage('/', portfolio, host), 'sent');
  assert.equal(trackPublicPage('/', portfolio, host), 'duplicate');
  assert.equal(trackPublicPage('/christmas', portfolio, host), 'sent');
  assert.equal(trackPublicPage('/christmas', portfolio, host), 'duplicate');
  assert.equal(trackPublicPage('/', portfolio, host), 'sent');
  assert.equal(host.scripts.length, 1);
  assert.equal(host.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  const configs = commands(host).filter(args => args[0] === 'config');
  assert.equal(configs.length, 1);
  assert.equal(configs[0][2].send_page_view, false);
  assert.equal(views(host).length, 3);
  assert.equal(views(host)[1][2].page_referrer, GA_SITE_ORIGIN + '/');
});

test('only known public routes; admin, API, unknown slug and local/preview excluded', () => {
  for (const route of ['/admin', '/admin/inquiries/SYNTHETIC_PRIVATE', '/api/inquiries', '/portfolio/unknown', '/unknown']) {
    const host = browser();
    assert.equal(trackPublicPage(route, portfolio, host), 'excluded');
    assert.equal(host.scripts.length, 0);
    assert.equal(views(host).length, 0);
  }
  for (const origin of ['http://127.0.0.1:5174', 'https://preview.workers.dev', 'https://www.thejoyflower.co.kr']) {
    const host = browser(origin);
    assert.equal(trackPublicPage('/', portfolio, host), 'excluded');
    assert.equal(host.scripts.length, 0);
  }
  assert.equal(trackPublicPage(portfolio[0], portfolio, browser()), 'sent');
});

test('query/hash, input data, document title and private referrer path are never queued', () => {
  const host = browser();
  trackPublicPage('/inquiry', portfolio, host);
  assert.ok(!JSON.stringify(commands(host)).includes('SYNTHETIC_PRIVATE'));
  assert.equal(views(host)[0][2].page_location, GA_SITE_ORIGIN + '/inquiry');
  assert.equal(views(host)[0][2].page_referrer, 'https://referrer.example');
  assert.equal(views(host)[0][2].page_title, '견적문의 | 조이플라워');
});

test('disable after entering excluded area; resume public tracking without private referrer', () => {
  const host = browser();
  trackPublicPage('/', portfolio, host);
  trackPublicPage('/admin/inquiries/SYNTHETIC_PRIVATE', portfolio, host);
  assert.equal(host[`ga-disable-${GA_MEASUREMENT_ID}`], true);
  assert.equal(views(host).length, 1);
  trackPublicPage('/', portfolio, host);
  assert.equal(host[`ga-disable-${GA_MEASUREMENT_ID}`], false);
  assert.equal(views(host).length, 2);
  assert.equal(views(host)[1][2].page_referrer, '');
  assert.equal(host.scripts.length, 1);
});

test('existing Google tag is not installed or configured a second time', () => {
  for (const host of [browser(GA_SITE_ORIGIN, true), { ...browser(), gtag() {} }]) {
    assert.equal(trackPublicPage('/', portfolio, host), 'existing-tag');
    assert.equal(host.scripts.length, 0);
    assert.equal(views(host).length, 0);
  }
});
