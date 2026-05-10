import { handleLogin } from '@auth0/nextjs-auth0';
export async function GET(req: Request): Promise<Response> {
  return handleLogin(req as any, { authorizationParams: { audience: process.env.AUTH0_AUDIENCE, scope: 'openid profile email offline_access' } } as any) as any;
}
export const dynamic = 'force-dynamic';
