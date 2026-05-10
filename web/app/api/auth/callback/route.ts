import { handleCallback } from '@auth0/nextjs-auth0';
export async function GET(req: Request): Promise<Response> { return handleCallback(req as any) as any; }
export const dynamic = 'force-dynamic';
