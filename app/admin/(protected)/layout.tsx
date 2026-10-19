/* eslint-disable @next/next/no-html-link-for-pages -- Admin navigation deliberately rechecks server authentication on every document. */
import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { authenticateAdmin } from '../../../lib/admin-auth';
import { adminPageRequest } from '../../../lib/admin-page-request';
import { AdminSession } from '../admin-ui';
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const identity = await authenticateAdmin(await adminPageRequest(), env);
  if (!identity) redirect('/admin/login');
  return <><div className="admin-bar"><nav aria-label="관리 메뉴"><a href="/admin">대시보드</a><a href="/admin/inquiries">견적 목록</a><a href="/admin/notifications">알림 상태</a></nav><AdminSession mode={identity.mode}/></div><main className="admin-main">{children}</main></>;
}
