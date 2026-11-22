import type { SalaryDataset } from '../types/salary';
import {
  STORAGE_KEYS,
  loadJsonWithRecovery,
  saveJsonSafe,
  storageService,
} from './storage';

export const EMPTY_SALARY_DATASET: SalaryDataset = {
  sources: [],
  records: [],
  adjustments: [],
};

export function isValidSalaryDataset(val: unknown): val is SalaryDataset {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    Array.isArray(obj.sources) &&
    Array.isArray(obj.records) &&
    Array.isArray(obj.adjustments)
  );
}

export function loadSalaryDatasetWithRecovery(): {
  data: SalaryDataset;
  error?: string;
} {
  const result = loadJsonWithRecovery<SalaryDataset>(
    STORAGE_KEYS.salaries,
    EMPTY_SALARY_DATASET,
    isValidSalaryDataset
  );
  return {
    data: result.data,
    error: result.error,
  };
}

export function saveSalaryDatasetSafely(dataset: SalaryDataset): {
  ok: boolean;
  error?: string;
} {
  return saveJsonSafe(STORAGE_KEYS.salaries, dataset);
}

export function backupSalaryBeforeImport(reason = 'Backup pré-importação Excel Salários') {
  return storageService.backup(STORAGE_KEYS.salaries, reason);
}
