import { getAccessToken, getSession } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function handler(req: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    // Try getAccessToken first; fall back to session.accessToken if it fails
    let accessToken: string | undefined;
    try {
      const result = await getAccessToken();
      accessToken = result.accessToken;
    } catch (tokenErr: any) {
      console.error('[proxy] getAccessToken failed:', tokenErr.message);
      const session = await getSession();
      accessToken = session?.accessToken;
    }
    if (!accessToken) {
      console.error('[proxy] No access token available');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const url  = `${BACKEND}/${params.path.join('/')}${req.nextUrl.search}`;
    const init: RequestInit = {
      method:  req.method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') init.body = await req.text();
    const res  = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status:  res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (err: any) {
    console.error('[proxy] FATAL:', err.message, err.code, err.status);
    return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
