import { env } from 'cloudflare:workers';
import { handleAdminNotifications } from '../../../../lib/admin-notifications';

export function GET(request: Request) { return handleAdminNotifications(request, env); }
export function POST(request: Request) { return handleAdminNotifications(request, env); }
