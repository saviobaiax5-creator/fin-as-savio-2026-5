const DRAFT_PREFIX = 'finance_ia_draft_v1::';

function getDraftStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveDraft<T>(draftKey: string, value: T): boolean {
  const storage = getDraftStorage();
  if (!storage) return false;
  try {
    storage.setItem(
      `${DRAFT_PREFIX}${draftKey}`,
      JSON.stringify({
        savedAt: Date.now(),
        value,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T>(draftKey: string, maxAgeMs = 12 * 60 * 60 * 1000): T | null {
  const storage = getDraftStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${DRAFT_PREFIX}${draftKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; value?: T };
    if (
      typeof parsed?.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > maxAgeMs ||
      parsed.value === undefined
    ) {
      storage.removeItem(`${DRAFT_PREFIX}${draftKey}`);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function clearDraft(draftKey: string): void {
  const storage = getDraftStorage();
  if (!storage) return;
  try {
    storage.removeItem(`${DRAFT_PREFIX}${draftKey}`);
  } catch {
    // ignore
  }
}
