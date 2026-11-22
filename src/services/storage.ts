import { db, RecoveryBackupRecord } from './indexedDb';

export const STORAGE_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  schemaVersion: 'finance_ia_schema_version',
  migrationVersion: 'finance_ia_migration_version',
  transactions: 'finance_ia_transactions',
  accounts: 'finance_ia_accounts',
  cards: 'finance_ia_cards',
  boletos: 'finance_ia_boletos',
  debts: 'finance_ia_debts',
  assets: 'finance_ia_assets',
  docs: 'finance_ia_docs',
  theme: 'finance_ia_theme',
  density: 'finance_ia_density',
  zoom: 'finance_ia_zoom',
  salaries: 'finance_ia_salaries',
  budgets: 'finance_ia_budgets',
  categoryRules: 'finance_ia_category_rules',
  auditLogs: 'finance_ia_audit_logs',
  reversals: 'finance_ia_reversals',
  preResetSnapshot: 'finance_ia_pre_reset_snapshot',
  recoveryIndex: 'finance_ia_recovery_backups',
  notificationSettings: 'finance_ia_notification_settings',
  extractionBatches: 'finance_ia_extraction_batches',
  institutions: 'finance_ia_institutions',
  accountExtensions: 'finance_ia_account_extensions',
  extractionRules: 'finance_ia_extraction_rules',
  consolidationPrefs: 'finance_ia_consolidation_prefs',
} as const;

export interface RecoveryBackup {
  key: string;
  originalValue: string | null;
  createdAt: string;
  reason: string;
  schemaVersion: number;
}

export type StorageReadStatus = 'EMPTY' | 'OK' | 'INVALID' | 'ERROR';

export interface StorageLoadResult<T> {
  status: StorageReadStatus;
  data: T;
  corruptBackupKey?: string;
  recovery?: RecoveryBackup;
  error?: string;
}

export interface StorageSaveResult {
  ok: boolean;
  error?: string;
}

export interface StorageService {
  get<T>(key: string, fallback: T, validate?: (val: unknown) => boolean): T;
  getDetailed<T>(
    key: string,
    fallback: T,
    validate?: (val: unknown) => boolean
  ): StorageLoadResult<T>;
  set<T>(key: string, value: T): StorageSaveResult;
  remove(key: string): void;
  backup(key: string, reason?: string): RecoveryBackup | null;
  restore(key: string): boolean;
}

export interface CorruptBackupInfo {
  key: string;
  sourceKey: string;
  timestamp: number;
  sizeBytes: number;
  createdAt?: string;
  reason?: string;
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function recordRecoveryMetadata(backup: RecoveryBackup, backupKey: string): void {
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      const rawIdx = storage.getItem(STORAGE_KEYS.recoveryIndex);
      const list: Array<RecoveryBackup & { backupKey: string }> = rawIdx
        ? JSON.parse(rawIdx)
        : [];
      list.unshift({
        key: backup.key,
        originalValue: null, // Full originalValue already saved under backupKey
        createdAt: backup.createdAt,
        reason: backup.reason,
        schemaVersion: backup.schemaVersion,
        backupKey,
      });
      storage.setItem(STORAGE_KEYS.recoveryIndex, JSON.stringify(list.slice(0, 25)));
    } catch {
      // ignore metadata index failure
    }
  }

  if (db) {
    const rec: RecoveryBackupRecord = {
      id: backupKey,
      key: backup.key,
      originalValue: backup.originalValue,
      createdAt: backup.createdAt,
      reason: backup.reason,
      schemaVersion: backup.schemaVersion,
    };
    void db.recovery.put(rec).catch(() => {
      // non-fatal async mirror
    });
  }
}

function preserveCorruptedPayload(
  storage: Storage,
  key: string,
  raw: string | null,
  reason: string
): { backupKey?: string; recovery: RecoveryBackup } {
  const nowIso = new Date().toISOString();
  const recovery: RecoveryBackup = {
    key,
    originalValue: raw,
    createdAt: nowIso,
    reason,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  };

  if (raw === null) {
    return { recovery };
  }

  const backupKey = `${key}__corrupt_${Date.now()}`;
  try {
    storage.setItem(backupKey, raw);
    recordRecoveryMetadata(recovery, backupKey);
    return { backupKey, recovery };
  } catch {
    try {
      storage.setItem(backupKey, raw.slice(0, 65536));
      recordRecoveryMetadata(recovery, backupKey);
      return { backupKey, recovery };
    } catch {
      return { recovery };
    }
  }
}

class LocalStorageService implements StorageService {
  getDetailed<T>(
    key: string,
    fallback: T,
    validate?: (parsed: unknown) => boolean
  ): StorageLoadResult<T> {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return {
        status: 'ERROR',
        data: fallback,
        error: 'Armazenamento local indisponível neste navegador.',
      };
    }

    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha de leitura no armazenamento local.';
      console.error(`[Storage] Read error on key "${key}": ${msg}`);
      return { status: 'ERROR', data: fallback, error: msg };
    }

    if (raw === null || raw === '') {
      return { status: 'EMPTY', data: fallback };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (validate && !validate(parsed)) {
        const reason = `Estrutura incompatível na chave "${key}"`;
        const preserved = preserveCorruptedPayload(storage, key, raw, reason);
        console.error(`[Storage] Invalid schema for "${key}". Backup saved: ${preserved.backupKey || 'memory'}`);
        return {
          status: 'INVALID',
          data: fallback,
          corruptBackupKey: preserved.backupKey,
          recovery: preserved.recovery,
          error: `Estrutura inválida detectada em "${key}". Cópia de segurança preservada antes do fallback.`,
        };
      }
      return { status: 'OK', data: parsed as T };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'JSON corrompido';
      const preserved = preserveCorruptedPayload(storage, key, raw, msg);
      console.error(`[Storage] Corrupt JSON in "${key}". Backup saved: ${preserved.backupKey || 'memory'}`);
      return {
        status: 'INVALID',
        data: fallback,
        corruptBackupKey: preserved.backupKey,
        recovery: preserved.recovery,
        error: `Dados corrompidos detectados em "${key}" (${msg}). Cópia original preservada para recuperação.`,
      };
    }
  }

  get<T>(key: string, fallback: T, validate?: (parsed: unknown) => boolean): T {
    return this.getDetailed(key, fallback, validate).data;
  }

  set<T>(key: string, value: T): StorageSaveResult {
    const storage = getSafeLocalStorage();
    if (!storage) {
      return { ok: false, error: 'Armazenamento local indisponível neste navegador.' };
    }

    try {
      const serialized = JSON.stringify(value);
      storage.setItem(key, serialized);
      return { ok: true };
    } catch (err) {
      const isQuota =
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      const errorMsg = isQuota
        ? 'Limite de espaço do navegador atingido. Exporte um backup ou remova documentos antigos.'
        : err instanceof Error
        ? err.message
        : 'Erro ao gravar dados no armazenamento local.';
      console.error(`[Storage] Write failed for "${key}": ${errorMsg}`);
      return { ok: false, error: errorMsg };
    }
  }

  remove(key: string): void {
    const storage = getSafeLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch {
      // ignore removal failure
    }
  }

  backup(key: string, reason = 'Backup manual pré-operação'): RecoveryBackup | null {
    const storage = getSafeLocalStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      const { recovery } = preserveCorruptedPayload(storage, key, raw, reason);
      return recovery;
    } catch {
      return null;
    }
  }

  restore(key: string): boolean {
    const storage = getSafeLocalStorage();
    if (!storage) return false;
    try {
      const backups = listCorruptBackups().filter((b) => b.sourceKey === key);
      if (backups.length === 0) return false;
      const latest = backups[0];
      const raw = storage.getItem(latest.key);
      if (raw === null) return false;
      JSON.parse(raw); // Verify restorable payload parses cleanly
      storage.setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageService = new LocalStorageService();

// Functional helpers wrapping storageService
export function loadJsonWithRecovery<T>(
  key: string,
  fallback: T,
  validate?: (parsed: unknown) => boolean
): StorageLoadResult<T> {
  return storageService.getDetailed(key, fallback, validate);
}

export function saveJsonSafe(key: string, value: unknown): StorageSaveResult {
  return storageService.set(key, value);
}

export function readStringSafe(key: string, fallback = ''): string {
  const storage = getSafeLocalStorage();
  if (!storage) return fallback;
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStringSafe(key: string, value: string): StorageSaveResult {
  const storage = getSafeLocalStorage();
  if (!storage) return { ok: false, error: 'Armazenamento local indisponível.' };
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao gravar preferência.',
    };
  }
}

export function clearEntityStoragePreservingBackups(): void {
  const entityKeys = [
    STORAGE_KEYS.transactions,
    STORAGE_KEYS.accounts,
    STORAGE_KEYS.cards,
    STORAGE_KEYS.boletos,
    STORAGE_KEYS.debts,
    STORAGE_KEYS.assets,
    STORAGE_KEYS.docs,
    STORAGE_KEYS.salaries,
    STORAGE_KEYS.budgets,
    STORAGE_KEYS.categoryRules,
    STORAGE_KEYS.extractionBatches,
    STORAGE_KEYS.institutions,
    STORAGE_KEYS.accountExtensions,
    STORAGE_KEYS.extractionRules,
    STORAGE_KEYS.consolidationPrefs,
  ];
  for (const k of entityKeys) {
    storageService.remove(k);
  }
}

export function listCorruptBackups(): CorruptBackupInfo[] {
  const storage = getSafeLocalStorage();
  if (!storage) return [];
  const results: CorruptBackupInfo[] = [];

  let metaMap = new Map<string, { createdAt?: string; reason?: string }>();
  try {
    const rawIdx = storage.getItem(STORAGE_KEYS.recoveryIndex);
    if (rawIdx) {
      const idxList = JSON.parse(rawIdx) as Array<{
        backupKey: string;
        createdAt?: string;
        reason?: string;
      }>;
      metaMap = new Map(idxList.map((m) => [m.backupKey, { createdAt: m.createdAt, reason: m.reason }]));
    }
  } catch {
    // ignore metadata parse error
  }

  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.includes('__corrupt_')) continue;
      const [sourceKey, tsPart] = k.split('__corrupt_');
      const val = storage.getItem(k) || '';
      const meta = metaMap.get(k);
      results.push({
        key: k,
        sourceKey,
        timestamp: Number(tsPart) || 0,
        sizeBytes: val.length,
        createdAt: meta?.createdAt,
        reason: meta?.reason,
      });
    }
  } catch {
    return [];
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}

export function readRawKeySafe(key: string): string | null {
  const storage = getSafeLocalStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function removeRawKeySafe(key: string): void {
  storageService.remove(key);
}
