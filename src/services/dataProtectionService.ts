import { EMPTY_APP_DATASET } from '../data/initialData';
import {
  AppDataset,
  BackupSummaryCounts,
  FullBackupPayload,
  PreResetSnapshot,
  applyBackupDataset,
  buildFullBackup,
  computeDatasetChecksum,
  getBackupCounts,
  parseAndValidateBackup,
  savePreOperationSnapshot,
  validateDatasetIntegrity,
} from './backupService';
import { STORAGE_KEYS, readRawKeySafe } from './storage';

export interface BackupDryRunResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  integrityHash: string;
  counts: BackupSummaryCounts;
  dryRunRestoredCounts?: BackupSummaryCounts;
}

export interface LocalStorageInspectionSummary {
  hasAnyData: boolean;
  totalRecords: number;
  counts: BackupSummaryCounts;
}

export function hasNonEmptyDataset(dataset: Partial<AppDataset>): boolean {
  return Boolean(
    (dataset.accounts && dataset.accounts.length > 0) ||
      (dataset.transactions && dataset.transactions.length > 0) ||
      (dataset.creditCards && dataset.creditCards.length > 0) ||
      (dataset.boletos && dataset.boletos.length > 0) ||
      (dataset.debts && dataset.debts.length > 0) ||
      (dataset.assets && dataset.assets.length > 0) ||
      (dataset.documents && dataset.documents.length > 0) ||
      (dataset.budgets && dataset.budgets.length > 0) ||
      (dataset.categoryRules && dataset.categoryRules.length > 0) ||
      (dataset.salaries &&
        (dataset.salaries.sources.length > 0 ||
          dataset.salaries.records.length > 0 ||
          dataset.salaries.adjustments.length > 0))
  );
}

export function countDatasetRecords(dataset: AppDataset): number {
  return (
    dataset.accounts.length +
    dataset.transactions.length +
    dataset.creditCards.length +
    dataset.boletos.length +
    dataset.debts.length +
    dataset.assets.length +
    dataset.documents.length +
    (dataset.budgets?.length ?? 0) +
    (dataset.categoryRules?.length ?? 0) +
    (dataset.salaries?.sources.length ?? 0) +
    (dataset.salaries?.records.length ?? 0) +
    (dataset.salaries?.adjustments.length ?? 0)
  );
}

/**
 * Inspects localStorage read-only to report pre-existing data without modifying or overwriting any key.
 */
export function inspectExistingLocalStorageData(): LocalStorageInspectionSummary {
  const safeParseArrayLen = (key: string): number => {
    const raw = readRawKeySafe(key);
    if (!raw) return 0;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  let salarySources = 0;
  let salaryRecords = 0;
  const rawSal = readRawKeySafe(STORAGE_KEYS.salaries);
  if (rawSal) {
    try {
      const parsed = JSON.parse(rawSal) as { sources?: unknown[]; records?: unknown[] };
      salarySources = Array.isArray(parsed?.sources) ? parsed.sources.length : 0;
      salaryRecords = Array.isArray(parsed?.records) ? parsed.records.length : 0;
    } catch {
      salarySources = 0;
      salaryRecords = 0;
    }
  }

  const counts: BackupSummaryCounts = {
    accounts: safeParseArrayLen(STORAGE_KEYS.accounts),
    transactions: safeParseArrayLen(STORAGE_KEYS.transactions),
    creditCards: safeParseArrayLen(STORAGE_KEYS.cards),
    boletos: safeParseArrayLen(STORAGE_KEYS.boletos),
    debts: safeParseArrayLen(STORAGE_KEYS.debts),
    assets: safeParseArrayLen(STORAGE_KEYS.assets),
    documents: safeParseArrayLen(STORAGE_KEYS.docs),
    budgets: safeParseArrayLen(STORAGE_KEYS.budgets),
    categoryRules: safeParseArrayLen(STORAGE_KEYS.categoryRules),
    salarySources,
    salaryRecords,
  };

  const totalRecords =
    counts.accounts +
    counts.transactions +
    counts.creditCards +
    counts.boletos +
    counts.debts +
    counts.assets +
    counts.documents +
    (counts.budgets ?? 0) +
    (counts.categoryRules ?? 0) +
    salarySources +
    salaryRecords;

  return {
    hasAnyData: totalRecords > 0,
    totalRecords,
    counts,
  };
}

/**
 * Validates a backup payload and runs an isolated in-memory dry-run restoration test
 * without touching live state, localStorage, IndexedDB, or Firestore.
 */
export function validateBackupWithDryRun(
  payloadOrRaw: FullBackupPayload | string
): BackupDryRunResult {
  let rawJson: string;
  try {
    rawJson = typeof payloadOrRaw === 'string' ? payloadOrRaw : JSON.stringify(payloadOrRaw);
  } catch {
    return {
      valid: false,
      warnings: [],
      integrityHash: '',
      counts: getBackupCounts(EMPTY_APP_DATASET),
      error: 'Não foi possível validar o backup. Seus dados originais foram preservados.',
    };
  }

  const parsed = parseAndValidateBackup(rawJson);
  if (!parsed.valid || !parsed.payload || !parsed.counts) {
    return {
      valid: false,
      warnings: parsed.warnings,
      integrityHash: '',
      counts: getBackupCounts(EMPTY_APP_DATASET),
      error: parsed.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.',
    };
  }

  // Isolated in-memory dry-run restoration into a fresh empty dataset
  try {
    const emptyClone: AppDataset = {
      accounts: [],
      transactions: [],
      creditCards: [],
      boletos: [],
      debts: [],
      assets: [],
      documents: [],
      salaries: { sources: [], records: [], adjustments: [] },
      budgets: [],
      categoryRules: [],
    };
    const dryRun = applyBackupDataset(emptyClone, parsed.payload.data, 'replace');
    const integrity = validateDatasetIntegrity(dryRun.next);
    if (!integrity.ok) {
      return {
        valid: false,
        warnings: parsed.warnings,
        integrityHash: parsed.payload.integrityHash || '',
        counts: parsed.counts,
        error: integrity.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.',
      };
    }

    const dryCounts = getBackupCounts(dryRun.next);
    const countsMatch =
      dryCounts.accounts === parsed.counts.accounts &&
      dryCounts.transactions === parsed.counts.transactions &&
      dryCounts.creditCards === parsed.counts.creditCards &&
      dryCounts.boletos === parsed.counts.boletos &&
      dryCounts.debts === parsed.counts.debts &&
      dryCounts.assets === parsed.counts.assets;

    if (!countsMatch) {
      return {
        valid: false,
        warnings: parsed.warnings,
        integrityHash: parsed.payload.integrityHash || '',
        counts: parsed.counts,
        error: 'Divergência de contagem no teste de restauração do backup. Seus dados originais foram preservados.',
      };
    }

    return {
      valid: true,
      warnings: parsed.warnings,
      integrityHash:
        parsed.payload.integrityHash || computeDatasetChecksum(dryRun.next),
      counts: parsed.counts,
      dryRunRestoredCounts: dryCounts,
    };
  } catch {
    return {
      valid: false,
      warnings: parsed.warnings,
      integrityHash: '',
      counts: parsed.counts,
      error: 'Não foi possível validar o backup. Seus dados originais foram preservados.',
    };
  }
}

/**
 * Generates and validates a pre-operation backup before any reset, replacement, or migration.
 * Never deletes or mutates live data if validation fails.
 */
export function captureAndValidateExistingLocalBackup(
  dataset: AppDataset,
  reason: PreResetSnapshot['reason'],
  ownerUid?: string
): {
  ok: boolean;
  snapshot?: PreResetSnapshot;
  dryRun?: BackupDryRunResult;
  error?: string;
} {
  const candidatePayload = buildFullBackup(dataset, undefined, new Date().toISOString(), ownerUid);
  const dryRun = validateBackupWithDryRun(candidatePayload);

  if (!dryRun.valid) {
    return {
      ok: false,
      dryRun,
      error: dryRun.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.',
    };
  }

  const saved = savePreOperationSnapshot(dataset, reason, ownerUid);
  if (!saved.ok) {
    return {
      ok: false,
      dryRun,
      error: saved.error || 'Falha ao gravar snapshot local antes da operação. Seus dados originais foram preservados.',
    };
  }

  return {
    ok: true,
    snapshot: saved.snapshot,
    dryRun,
  };
}
