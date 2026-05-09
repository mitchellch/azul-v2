import { redirect } from 'next/navigation';
import { getSession } from '@auth0/nextjs-auth0';

export default async function Home() {
  const session = await getSession();
  if (session) redirect('/dashboard');
  redirect('/login');
}
