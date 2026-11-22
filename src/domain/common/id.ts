let fallbackSeq = 0;

export function generateEntityId(prefix: string): string {
  const cleanPrefix = prefix.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'id';

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return `${cleanPrefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackSeq = (fallbackSeq + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${cleanPrefix}-${Date.now().toString(36)}-${fallbackSeq.toString(36)}-${rand}`;
}

export function generateIdempotencyKey(scope = 'op'): string {
  return generateEntityId(`idem-${scope}`);
}
