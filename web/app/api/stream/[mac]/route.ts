import { getAccessToken } from '@auth0/nextjs-auth0';
import { NextRequest } from 'next/server';

const BACKEND = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export async function GET(req: NextRequest, { params }: { params: { mac: string } }) {
  try {
    const { accessToken } = await getAccessToken();
    const upstream = await fetch(`${BACKEND}/devices/${params.mac}/stream`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'text/event-stream' },
    });
    return new Response(upstream.body, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(`data: ${JSON.stringify({ error: err.message })}\n\n`, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
export const dynamic = 'force-dynamic';
