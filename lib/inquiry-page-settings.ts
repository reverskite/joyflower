import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { inquirySettings } from './inquiry-settings';

export async function inquiryPageSettings() {
  const host = (await headers()).get('host') || '';
  let hostname = '';
  try { hostname = new URL(`http://${host}`).hostname; } catch { /* Not a loopback host. */ }
  return inquirySettings(env, hostname);
}
