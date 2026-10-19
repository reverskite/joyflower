import { headers } from 'next/headers';
export async function adminPageRequest() {
  const values = await headers();
  const host = values.get('host') || 'unconfigured.invalid';
  return new Request('http://' + host + '/admin', { headers: values });
}
