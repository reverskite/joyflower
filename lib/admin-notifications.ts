import { authenticateAdmin, adminReply, sameOrigin, discardAdminBody } from './admin-auth';
import { notificationMockChannels, processNotificationBatch } from './inquiry-notifications';

export async function handleAdminNotifications(request: Request, env: Cloudflare.Env) {
  try {
    if (!await authenticateAdmin(request, env)) return adminReply(401, { error: '관리자 인증이 필요합니다.' });
    if (!env.DB) return adminReply(503, { error: '알림 저장소를 준비 중입니다.' });
    const hostname = new URL(request.url).hostname;
    if (request.method === 'GET') {
      const jobs = await env.DB.prepare(`SELECT receipt_id,channel,status,attempts,created_at,next_attempt_at,
        completed_at,last_error FROM inquiry_notifications ORDER BY created_at DESC,receipt_id DESC,channel LIMIT 100`).all();
      const mockChannels = notificationMockChannels(env, hostname);
      return adminReply(200, { mockEnabled: mockChannels.length > 0, mockChannels, items: jobs.results });
    }
    if (request.method === 'POST') {
      if (!sameOrigin(request)) return adminReply(403, { error: '요청 출처를 확인해주세요.' });
      if (!notificationMockChannels(env, hostname).length) return adminReply(403, { error: '알림 발송이 비활성화되어 있습니다.' });
      // Bounded batch; no arbitrary recipients, URLs, secrets or retry overrides accepted.
      if (new URL(request.url).search) return adminReply(400, { error: '허용되지 않은 요청입니다.' });
      return adminReply(200, await processNotificationBatch(env, hostname));
    }
    return adminReply(405, { error: '허용되지 않은 요청입니다.' }, { Allow: 'GET, POST' });
  } catch { return adminReply(503, { error: '알림 작업을 완료하지 못했습니다.' }); }
  finally { await discardAdminBody(request); }
}
