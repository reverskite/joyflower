import { env } from 'cloudflare:workers';
import { handleInquiry } from '../../../lib/inquiry-handler';

export async function POST(request: Request) {
  return handleInquiry(request, env);
}

export function GET() {
  return Response.json({ error: '접수 내역은 공개하지 않습니다.' }, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
