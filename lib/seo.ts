import type { Metadata } from 'next';

export const siteName = '조이플라워';
export const homeSeo = {
  title: '조이플라워 | 대전 공간 연출·조경관리',
  description: '대전 기반 공간 연출·조경관리 업체 조이플라워. 세종을 비롯한 전국 현장의 크리스마스트리 대여·설치, 조화 플랜테리어, 조경관리를 상담합니다. 실제 시공 사진과 서비스별 상담 안내를 확인하세요.',
};

// Public, build-time configuration. Never derive the canonical host from a request.
export function getSiteOrigin(value = process.env.NEXT_PUBLIC_SITE_URL): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':') ||
      /\.(?:test|invalid|example|local)$/.test(host) ||
      /(^|\.)example\.(?:com|org|net)$/.test(host)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

type PageSeo = { title: string; description: string; image?: string; imageAlt?: string };

export function sitemapPaths(pageFiles: string[], portfolioSlugs: string[]): string[] {
  const pages = pageFiles
    .filter(file => !file.includes('[') && !file.split('/').some(part => part.startsWith('_')))
    .map(file => file.replace(/^\./, '').replace(/\/page\.tsx$/, '').replace(/\/\([^/]+\)/g, '') || '/');
  return [...new Set([...pages, ...portfolioSlugs.map(slug => `/portfolio/${slug}`)])].sort();
}

export function pageMetadata(
  { title, description, image = '/hero.webp', imageAlt = '조이플라워 공간 연출 이미지' }: PageSeo,
  pathname?: string,
): Metadata {
  const origin = getSiteOrigin();
  const url = origin && pathname ? new URL(pathname, origin).href : undefined;
  const images = origin ? [{ url: new URL(image, origin).href, alt: imageAlt }] : undefined;
  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title, description, siteName, locale: 'ko_KR', type: 'website',
      ...(url ? { url } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary', title, description,
      ...(images ? { images } : {}),
    },
  };
}

export function localBusinessData() {
  const origin = getSiteOrigin();
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    ...(origin ? { '@id': `${origin}/#business`, url: origin } : {}),
    name: siteName,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '대전 대덕구 선비마을로 170',
      addressCountry: 'KR',
    },
    areaServed: { '@type': 'Country', name: '대한민국' },
  };
}
