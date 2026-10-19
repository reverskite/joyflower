import { env } from 'cloudflare:workers';
import { handleAdminInquiries } from '../../../../../lib/admin-inquiries';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handleAdminInquiries(request, env, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handleAdminInquiries(request, env, (await context.params).id); }
