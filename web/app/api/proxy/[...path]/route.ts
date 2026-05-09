import { getAccessToken } from '@auth0/nextjs-auth0';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { accessToken } = await getAccessToken();
    const { path } = await params;
    const url = `${BACKEND}/${path.join('/')}${req.nextUrl.search}`;

    const init: RequestInit = {
      method:  req.method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = await req.text();
    }

    const res  = await fetch(url, init);
    const body = await res.text();
    return new NextResponse(body, {
      status:  res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const GET    = handler;
export const POST   = handler;
export const PUT    = handler;
export const PATCH  = handler;
export const DELETE = handler;
