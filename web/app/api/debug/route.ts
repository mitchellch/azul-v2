import { getSession } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ session: null });
    return NextResponse.json({
      user: session.user?.email,
      hasAccessToken: !!session.accessToken,
      accessTokenPreview: session.accessToken?.slice(0, 50),
      tokenType: session.tokenType,
      scopes: session.scope,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
