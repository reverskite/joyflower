/// <reference types="vite/client" />
import { env } from 'cloudflare:workers';
import { accessConfig } from '../../../lib/admin-auth';
import { adminPageRequest } from '../../../lib/admin-page-request';
import { AdminLogin } from '../admin-ui';
export default async function LoginPage() {
  const request = await adminPageRequest();
  const local = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname) &&
    env.ADMIN_LOCAL_ENABLED === 'true' && (env.ADMIN_LOCAL_SECRET?.length || 0) >= 32;
  return <main className="admin-main admin-login"><p className="admin-eyebrow">AUTHORIZED STAFF ONLY</p><h1>관리자 인증</h1><AdminLogin local={local} accessReady={!!accessConfig(env)}/></main>;
}
