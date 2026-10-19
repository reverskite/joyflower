/* eslint-disable @next/next/no-html-link-for-pages -- Admin navigation deliberately rechecks server authentication on every document. */
import type { Metadata } from 'next';
import './admin.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '업체 전용 관리 | 조이플라워', robots: { index: false, follow: false }, alternates: { canonical: null }, openGraph: null, twitter: null };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="jf-admin"><header className="admin-header"><a href="/admin" className="admin-brand">✳ JOY FLOWER <span>업체 전용 관리</span></a><a href="/">고객 홈페이지 ↗</a></header>{children}</div>;
}
