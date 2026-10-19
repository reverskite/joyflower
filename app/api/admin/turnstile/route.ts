import { env } from 'cloudflare:workers';
import { handleAdminTurnstile } from '../../../../lib/admin-turnstile';
export function POST(request: Request) { return handleAdminTurnstile(request, env); }
export function GET(request: Request) { return handleAdminTurnstile(request, env); }
