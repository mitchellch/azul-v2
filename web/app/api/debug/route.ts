import { getAccessToken, getSession } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ session: null });

    let tokenResult: any = null;
    let tokenError: string | null = null;
    try {
      tokenResult = await getAccessToken();
    } catch (e: any) {
      tokenError = e.message;
    }

    return NextResponse.json({
      user: session.user?.email,
      sessionHasAccessToken: !!session.accessToken,
      sessionAccessTokenPreview: session.accessToken?.slice(0, 60),
      getAccessTokenResult: tokenResult?.accessToken?.slice(0, 60) ?? null,
      getAccessTokenError: tokenError,
      tokenType: session.tokenType,
      scopes: session.scope,
      hasRefreshToken: !!session.refreshToken,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
