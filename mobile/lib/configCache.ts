import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const CACHE_PREFIX = 'azul-config-cache:';

export type ConfigBlob = {
  version: number;
  name: string;
  zones: {
    number: number;
    name: string;
    color: string | null;
    enabled: boolean;
  }[];
  schedules: {
    uuid: string;
    name: string;
    active: boolean;
    start_date: string;
    end_date: string | null;
    runs: {
      zone_id: number;
      day_mask: number;
      hour: number;
      minute: number;
      duration_seconds: number;
      interval_days?: number;
    }[];
  }[];
  settings: Record<string, unknown>;
};

async function authFetch(path: string): Promise<any> {
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) throw new Error('Not authenticated');
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const configCache = {
  async fetch(mac: string): Promise<ConfigBlob | null> {
    try {
      const config = await authFetch(`/devices/${mac}/config`);
      await AsyncStorage.setItem(CACHE_PREFIX + mac, JSON.stringify(config));
      return config as ConfigBlob;
    } catch {
      return null;
    }
  },

  async get(mac: string): Promise<ConfigBlob | null> {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + mac);
    if (!raw) return null;
    return JSON.parse(raw) as ConfigBlob;
  },

  async set(mac: string, config: ConfigBlob): Promise<void> {
    await AsyncStorage.setItem(CACHE_PREFIX + mac, JSON.stringify(config));
  },

  async getVersion(mac: string): Promise<number> {
    const config = await this.get(mac);
    return config?.version ?? 0;
  },

  async syncAll(macs: string[]): Promise<void> {
    await Promise.allSettled(macs.map(mac => this.fetch(mac)));
  },
};
