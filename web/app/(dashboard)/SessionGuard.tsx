'use client';

import { useEffect } from 'react';

const INTERVAL_MS = 30_000;

export function SessionGuard() {
  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.status === 401 && active) {
          window.location.href = '/login';
        }
      } catch {}
    }

    check();
    const id = setInterval(check, INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return null;
}
