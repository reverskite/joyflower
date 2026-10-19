// Access may redirect an expired API session to an HTML login page.
// Never show the provider response body or treat it as authenticated data.
export async function readAdminResponse<T>(response: Response): Promise<T> {
  if (response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 ||
      response.status >= 300 && response.status < 400 ||
      response.headers.get('content-type')?.includes('text/html'))
    throw new Error('인증이 만료되었거나 접근 권한이 없습니다. 관리자 로그인에서 다시 확인해주세요.');
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
  let data: T & { error?: string };
  try { data = await response.json(); }
  catch { throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : '작업에 실패했습니다. 다시 시도해주세요.');
  return data;
}
