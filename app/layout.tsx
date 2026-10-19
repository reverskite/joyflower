import type { Metadata } from "next";
import { getSiteOrigin, homeSeo, localBusinessData, pageMetadata } from "../lib/seo";
import "./globals.css";
import GoogleAnalytics from "./google-analytics";
import { portfolioItems } from "./portfolio-data";
export const metadata: Metadata = {
 ...pageMetadata(homeSeo),
 ...(getSiteOrigin() ? { metadataBase: new URL(getSiteOrigin()!) } : {}),
 icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
 verification: {
  other: { "naver-site-verification": "77947d351d49012eca72f3bb3d4168a580f26dd8" },
 },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body><script id="joyflower-business" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessData()).replace(/</g, '\\u003c') }}/>{children}<GoogleAnalytics portfolioPaths={portfolioItems.map(item => `/portfolio/${item.slug}`)} /></body></html>; }
