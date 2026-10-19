'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPublicPage } from '../lib/google-analytics';

export default function GoogleAnalytics({ portfolioPaths }: { portfolioPaths: string[] }) {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) trackPublicPage(pathname, portfolioPaths);
  }, [pathname, portfolioPaths]);
  return null;
}
