import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
import { authenticateAdmin } from '../../../../lib/admin-auth';
import { adminPageRequest } from '../../../../lib/admin-page-request';
import TurnstileDiagnostic from './turnstile-diagnostic';

export default async function TurnstileDiagnosticPage() {
  if (!await authenticateAdmin(await adminPageRequest(), env)) redirect('/admin/login');
  return <><h1>Turnstile 진단</h1><p>견적 저장과 알림 발송 없이 자동 접수 방지 검증만 수행합니다.</p>
    <TurnstileDiagnostic siteKey={env.TURNSTILE_SITE_KEY || ''}/></>;
}
