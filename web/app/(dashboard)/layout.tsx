import { getSession } from '@auth0/nextjs-auth0';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      <header className="bg-[#1a56db] text-white px-6 py-4 flex items-center justify-between shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Azul</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-75">{session.user.email}</span>
          <a href="/api/auth/logout" className="text-sm opacity-75 hover:opacity-100 transition-opacity">
            Sign out
          </a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
