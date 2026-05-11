'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type Device = {
  id: string; mac: string; name: string;
  firmware: string | null; online: boolean; lastSeenAt: string | null;
};

type ConnectionGrade = 'good' | 'degraded' | 'poor' | 'offline';

type ConnectionStatus = {
  grade: ConnectionGrade;
  lastSeen: number | null;
  reason: string;
};

type DeviceWithStatus = Device & { connectionStatus?: ConnectionStatus };

const GRADE_STYLES: Record<ConnectionGrade, { dot: string; label: string; text: string }> = {
  good:     { dot: 'bg-green-500',  label: 'Good',     text: 'text-green-600' },
  degraded: { dot: 'bg-yellow-400', label: 'Degraded', text: 'text-yellow-600' },
  poor:     { dot: 'bg-orange-500', label: 'Poor',     text: 'text-orange-600' },
  offline:  { dot: 'bg-gray-300',   label: 'Offline',  text: 'text-gray-400' },
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
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/devices');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const devs: Device[] = await res.json();

      const statuses = await Promise.allSettled(
        devs.map(d => fetch(`/api/proxy/devices/${d.mac}/connection-status`).then(r => r.json()))
      );

      setDevices(devs.map((d, i) => ({
        ...d,
        connectionStatus: statuses[i].status === 'fulfilled' ? statuses[i].value : undefined,
      })));
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30_000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

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
          {devices.map(d => {
            const grade = d.connectionStatus?.grade ?? (d.online ? 'good' : 'offline');
            const style = GRADE_STYLES[grade];
            return (
              <Link key={d.mac} href={`/controllers/${d.mac}`}>
                <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${style.dot}`} />
                    <div>
                      <p className="font-semibold text-gray-900">{d.name}</p>
                      <p className="text-sm text-gray-400">{d.mac} · {formatLastSeen(d.lastSeenAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {d.firmware && <p className="text-xs text-gray-400 mb-0.5">{d.firmware}</p>}
                    <span className={`text-xs font-semibold ${style.text}`}>
                      {style.label}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
