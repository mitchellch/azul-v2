import { handleProfile } from '@auth0/nextjs-auth0';
export async function GET(req: Request): Promise<Response> { return handleProfile(req as any) as any; }
export const dynamic = 'force-dynamic';
