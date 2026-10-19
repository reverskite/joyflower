import { env } from 'cloudflare:workers';
import { localSessionRoute, authenticateAdmin, adminReply } from '../../../../lib/admin-auth';
export async function GET(request: Request) {
  const identity = await authenticateAdmin(request, env);
  return identity ? adminReply(200, { mode: identity.mode }) : adminReply(401, { error: '관리자 인증이 필요합니다.' });
}
export function POST(request: Request) { return localSessionRoute(request, env); }
export function DELETE(request: Request) { return localSessionRoute(request, env); }
