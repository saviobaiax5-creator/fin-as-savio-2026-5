import { db } from './indexedDb';
import { STORAGE_KEYS, loadJsonWithRecovery, saveJsonSafe } from './storage';
import type {
  AccountExtensionMeta,
  ConsolidationPreferences,
  ExtractionBatch,
  ExtractionRule,
  InstitutionProfile,
} from '../types/extractions';

export const DEFAULT_CONSOLIDATION_PREFS: ConsolidationPreferences = {
  mode: 'CONSOLIDATED',
  targetCurrency: 'BRL',
  usdToBrlRate: 5.5,
  eurToBrlRate: 6.0,
  selectedAccountIds: [],
  selectedCardIds: [],
  selectedAssetIds: [],
  selectedCategories: [],
  includeClosedAccounts: false,
  defaultPeriod: 'ALL',
};

export function loadExtractionBatches(): ExtractionBatch[] {
  return loadJsonWithRecovery<ExtractionBatch[]>(
    STORAGE_KEYS.extractionBatches,
    [],
    (v) => Array.isArray(v)
  ).data;
}

export function saveExtractionBatches(batches: ExtractionBatch[]): void {
  const capped = batches.slice(0, 60);
  saveJsonSafe(STORAGE_KEYS.extractionBatches, capped);
  if (db) {
    void db.extractionBatches
      .clear()
      .then(() => db!.extractionBatches.bulkPut(capped))
      .catch(() => {});
  }
}

export function loadRegisteredInstitutions(): InstitutionProfile[] {
  return loadJsonWithRecovery<InstitutionProfile[]>(
    STORAGE_KEYS.institutions,
    [],
    (v) => Array.isArray(v)
  ).data;
}

export function saveRegisteredInstitutions(institutions: InstitutionProfile[]): void {
  saveJsonSafe(STORAGE_KEYS.institutions, institutions);
  if (db) {
    void db.institutions
      .clear()
      .then(() => db!.institutions.bulkPut(institutions))
      .catch(() => {});
  }
}

export function loadAccountExtensions(): AccountExtensionMeta[] {
  return loadJsonWithRecovery<AccountExtensionMeta[]>(
    STORAGE_KEYS.accountExtensions,
    [],
    (v) => Array.isArray(v)
  ).data;
}

export function saveAccountExtensions(items: AccountExtensionMeta[]): void {
  saveJsonSafe(STORAGE_KEYS.accountExtensions, items);
  if (db) {
    void db.accountExtensions
      .clear()
      .then(() => db!.accountExtensions.bulkPut(items))
      .catch(() => {});
  }
}

export function loadExtractionRules(): ExtractionRule[] {
  return loadJsonWithRecovery<ExtractionRule[]>(
    STORAGE_KEYS.extractionRules,
    [],
    (v) => Array.isArray(v)
  ).data;
}

export function saveExtractionRules(rules: ExtractionRule[]): void {
  saveJsonSafe(STORAGE_KEYS.extractionRules, rules);
  if (db) {
    void db.extractionRules
      .clear()
      .then(() => db!.extractionRules.bulkPut(rules))
      .catch(() => {});
  }
}

export function loadConsolidationPreferences(): ConsolidationPreferences {
  return loadJsonWithRecovery<ConsolidationPreferences>(
    STORAGE_KEYS.consolidationPrefs,
    DEFAULT_CONSOLIDATION_PREFS,
    (v) => Boolean(v && typeof v === 'object')
  ).data;
}

export function saveConsolidationPreferences(prefs: ConsolidationPreferences): void {
  saveJsonSafe(STORAGE_KEYS.consolidationPrefs, prefs);
}
