import { getSession } from '@auth0/nextjs-auth0';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ session: null });
    return NextResponse.json({
      hasSession: true,
      hasAccessToken: !!session.accessToken,
      tokenPreview: session.accessToken?.slice(0, 40),
      user: session.user?.email,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message });
  }
}
