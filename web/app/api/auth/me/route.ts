import { handleProfile } from '@auth0/nextjs-auth0';
export async function GET(req: Request) { return handleProfile(req as any); }
