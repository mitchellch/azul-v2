import { getAccessToken } from '@auth0/nextjs-auth0';

// Returns the access token for use by the browser to connect directly
// to the backend SSE endpoint. The browser can't call /api/sse-token and
// use EventSource simultaneously, so this endpoint is used by zoneStream.ts
// to fetch the token before opening a fetch()-based SSE connection.
export async function GET() {
  try {
    const { accessToken } = await getAccessToken();
    return Response.json({ token: accessToken });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export const dynamic = 'force-dynamic';
