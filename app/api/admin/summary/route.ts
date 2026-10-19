import { env } from 'cloudflare:workers';
import { handleAdminInquiries } from '../../../../lib/admin-inquiries';
export function GET(request: Request) { return handleAdminInquiries(request, env, undefined, true); }
