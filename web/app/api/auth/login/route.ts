import { handleLogin } from '@auth0/nextjs-auth0';
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const screenHint = searchParams.get('screen_hint');
  return handleLogin(req as any, {
    authorizationParams: {
      audience: process.env.AUTH0_AUDIENCE,
      scope: 'openid profile email offline_access',
      prompt: 'login',
      ...(screenHint === 'signup' && { screen_hint: 'signup' }),
    },
  } as any) as any;
}
export const dynamic = 'force-dynamic';
