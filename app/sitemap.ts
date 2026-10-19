/// <reference types="vite/client" />
import type { MetadataRoute } from 'next';
import { getSiteOrigin, sitemapPaths } from '../lib/seo';
import { portfolioItems } from './portfolio-data';

// Vite discovers concrete public pages at build/dev startup; do not import their UI.
// The unreviewed privacy notice is noindex and is not submitted to search engines.
const pageFiles = Object.keys(import.meta.glob('./**/page.tsx')).filter(file => file !== './privacy/page.tsx' && !file.startsWith('./admin/'));

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  if (!origin) return [];
  return sitemapPaths(pageFiles, portfolioItems.map(item => item.slug))
    .map(pathname => ({ url: new URL(pathname, origin).href }));
}
