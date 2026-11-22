import { generateEntityId } from '../../domain/common/id';

const OFFLINE_QUEUE_KEY = 'finance_ia_offline_queue_v1';

export type OfflineTaskKind = 'CDI_REFRESH' | 'AI_PARSE_PENDING' | 'WORKSPACE_SYNC';

export interface OfflineQueueItem {
  id: string;
  idempotencyKey: string;
  kind: OfflineTaskKind;
  label: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadOfflineQueue(): OfflineQueueItem[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineQueueItem[]) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(items: OfflineQueueItem[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('finance-ia-offline-queue-changed'));
    }
  } catch {
    // ignore storage quota errors on queue metadata
  }
}

export function enqueueOfflineTask(params: {
  idempotencyKey: string;
  kind: OfflineTaskKind;
  label: string;
  payload?: Record<string, unknown>;
  lastError?: string;
}): OfflineQueueItem {
  const existing = loadOfflineQueue();
  const already = existing.find((item) => item.idempotencyKey === params.idempotencyKey);
  if (already) {
    return already;
  }

  const item: OfflineQueueItem = {
    id: generateEntityId('oq'),
    idempotencyKey: params.idempotencyKey,
    kind: params.kind,
    label: params.label,
    payload: params.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: params.lastError,
  };

  saveOfflineQueue([...existing, item]);
  return item;
}

export function removeOfflineTask(id: string): void {
  const next = loadOfflineQueue().filter((item) => item.id !== id);
  saveOfflineQueue(next);
}

export async function flushOfflineQueue(
  executor: (item: OfflineQueueItem) => Promise<boolean>
): Promise<{ processed: number; succeeded: number; remaining: number }> {
  const queue = loadOfflineQueue();
  if (queue.length === 0) {
    return { processed: 0, succeeded: 0, remaining: 0 };
  }

  let succeeded = 0;
  const remaining: OfflineQueueItem[] = [];

  for (const item of queue) {
    try {
      const ok = await executor(item);
      if (ok) {
        succeeded += 1;
      } else {
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    } catch (err) {
      remaining.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: err instanceof Error ? err.message : 'Falha ao reenviar.',
      });
    }
  }

  saveOfflineQueue(remaining);
  return { processed: queue.length, succeeded, remaining: remaining.length };
}
