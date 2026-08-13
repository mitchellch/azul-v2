'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

type Release = {
  id: string;
  version: string;
  target: string;
  sha256: string;
  size: number;
  releaseNotes: string | null;
  filePath: string;
  createdAt: string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function humanDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year:   'numeric', month: 'short', day:    'numeric',
    hour:   '2-digit', minute: '2-digit',
  });
}

export default function FirmwarePage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState('');

  // Upload form state
  const [file,    setFile]    = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [target,  setTarget]  = useState('main-controller');
  const [notes,   setNotes]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const fetchReleases = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/admin/firmware');
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReleases(await res.json());
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReleases(); }, [fetchReleases]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError('');
    if (!file) { setUploadError('Choose a .bin file'); return; }
    if (!/^\d+\.\d+\.\d+/.test(version)) { setUploadError('Version must be semver (e.g. 0.2.3)'); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('version', version);
      fd.append('target', target);
      if (notes.trim()) fd.append('releaseNotes', notes.trim());

      const res  = await fetch('/api/proxy/admin/firmware', { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status})`);

      setFile(null); setVersion(''); setNotes('');
      const input = document.getElementById('firmware-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await fetchReleases();
    } catch (err: any) {
      setUploadError(err.message ?? String(err));
    } finally {
      setUploading(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Firmware</h2>
        <Link href="/dashboard" className="text-sm text-[#1a56db] hover:underline">← Controllers</Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Upload form */}
      <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Upload a new release</h3>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Version (semver)</span>
              <input
                type="text"
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="0.2.3"
                className="mt-1 block w-full rounded-md border-gray-300 border px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-500">Target</span>
              <input
                type="text"
                value={target}
                onChange={e => setTarget(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Firmware .bin</span>
            <input
              id="firmware-file"
              type="file"
              accept=".bin,application/octet-stream"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-[#1a56db] file:text-white hover:file:bg-[#1e40af]"
            />
            {file && <p className="mt-1 text-xs text-gray-400">{file.name} · {humanSize(file.size)}</p>}
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">Release notes (optional)</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 border px-3 py-2 text-sm"
            />
          </label>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
          <button
            type="submit"
            disabled={uploading || !file || !version}
            className="px-4 py-2 rounded-md bg-[#1a56db] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#1e40af]"
          >
            {uploading ? 'Uploading…' : 'Upload release'}
          </button>
        </form>
      </div>

      {/* Releases table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Releases</h3>
        </div>
        {releases.length === 0 ? (
          <p className="text-gray-500 text-sm px-5 py-8 text-center">No releases yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {releases.map(r => (
              <div key={r.id} className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 items-baseline">
                <span className="font-mono text-sm font-semibold text-gray-900">{r.version}</span>
                <span className="text-xs text-gray-400">{r.target}</span>
                <span className="text-xs text-gray-400">{humanSize(r.size)}</span>
                <span className="text-xs text-gray-400 font-mono truncate max-w-[240px]" title={r.sha256}>
                  {r.sha256.slice(0, 12)}…
                </span>
                <span className="text-xs text-gray-400 ml-auto">{humanDate(r.createdAt)}</span>
                {r.releaseNotes && (
                  <p className="text-xs text-gray-500 basis-full">{r.releaseNotes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
