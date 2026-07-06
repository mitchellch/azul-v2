import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/store/auth';
import { AppState } from 'react-native';

const QUEUE_KEY = 'azul-pending-queue';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

export type PendingItem = {
  id: string;
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: object;
  createdAt: number;
};

async function loadQueue(): Promise<PendingItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

async function saveQueue(queue: PendingItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const pendingQueue = {
  async enqueue(item: Omit<PendingItem, 'id' | 'createdAt'>): Promise<void> {
    const queue = await loadQueue();
    queue.push({ ...item, id: uuid(), createdAt: Date.now() });
    await saveQueue(queue);
    this.flush();
  },

  async flush(): Promise<void> {
    const { accessToken } = useAuthStore.getState();
    if (!accessToken) return;

    const queue = await loadQueue();
    if (queue.length === 0) return;

    const remaining: PendingItem[] = [];

    for (const item of queue) {
      try {
        const res = await fetch(`${API_URL}${item.path}`, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: item.body ? JSON.stringify(item.body) : undefined,
        });
        if (res.status === 401) {
          remaining.push(item);
          break;
        }
        // 4xx (except 401) = don't retry, discard
        // 5xx = retry later
        if (res.status >= 500) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
        break;
      }
    }

    await saveQueue(remaining);
  },

  async count(): Promise<number> {
    const queue = await loadQueue();
    return queue.length;
  },
};

// Flush whenever app comes to foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    pendingQueue.flush();
  }
});
