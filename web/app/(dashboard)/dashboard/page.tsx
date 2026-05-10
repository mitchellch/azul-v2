'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Device = {
  id: string; mac: string; name: string;
  firmware: string | null; online: boolean; lastSeenAt: string | null;
};

function formatLastSeen(ts: string | null): string {
  if (!ts) return 'Never connected';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000)    return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    fetch('/api/proxy/devices')
      .then(r => r.ok ? r.json() : Promise.reject(`Error ${r.status}`))
      .then(setDevices)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return <div className="text-red-500 text-center py-10">{error}</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Controllers</h2>
      {devices.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500 font-medium text-lg">No controllers yet.</p>
          <p className="text-gray-400 text-sm mt-2">Register one from the Azul mobile app → Settings → Register with Cloud.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {devices.map(d => (
            <Link key={d.mac} href={`/controllers/${d.mac}`}>
              <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${d.online ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-semibold text-gray-900">{d.name}</p>
                    <p className="text-sm text-gray-400">{d.mac} · {formatLastSeen(d.lastSeenAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  {d.firmware && <p className="text-xs text-gray-400 mb-0.5">{d.firmware}</p>}
                  <span className={`text-xs font-semibold ${d.online ? 'text-green-600' : 'text-gray-400'}`}>
                    {d.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
