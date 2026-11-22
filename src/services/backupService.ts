import {
  Account,
  Transaction,
  CreditCard,
  Boleto,
  Debt,
  Asset,
  DocumentItem,
  CategoryBudget,
  CategoryRule,
} from '../types';
import type { SalaryDataset } from '../types/salary';
import { db } from './indexedDb';
import { fileStorageService, FileReferenceInfo } from './fileStorage';
import { STORAGE_SCHEMA_VERSION, STORAGE_KEYS, saveJsonSafe } from './storage';
import { checkDuplicateTransaction } from '../utils/financeCalculations';
import { sanitizeCellForSheet } from '../utils/sheetGuard';
import { todayLocal } from '../utils/dateUtils';
import { generateEntityId } from '../domain/common/id';
import { cents, fromCents, getTransactionAmountCents, toCents } from '../domain/money/money';

export interface AppSettingsSnapshot {
  theme: 'light' | 'dark';
  density: 'compact' | 'standard' | 'enlarged';
  zoom: string;
}

export interface AppDataset {
  accounts: Account[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  boletos: Boleto[];
  debts: Debt[];
  assets: Asset[];
  documents: DocumentItem[];
  salaries?: SalaryDataset;
  budgets?: CategoryBudget[];
  categoryRules?: CategoryRule[];
  settings?: AppSettingsSnapshot;
}

export interface FullBackupPayload {
  app: 'FINANCE_IA';
  backupVersion: number;
  schemaVersion: number;
  exportedAt: string;
  ownerUid?: string;
  integrityHash?: string;
  fileReferences?: FileReferenceInfo[];
  data: AppDataset;
}

export interface PreResetSnapshot {
  id: string;
  savedAt: string;
  reason: 'reset' | 'replace_import' | 'pre_migration' | 'manual';
  backup: FullBackupPayload;
}

export interface BackupSummaryCounts {
  accounts: number;
  transactions: number;
  creditCards: number;
  boletos: number;
  debts: number;
  assets: number;
  documents: number;
  salarySources?: number;
  salaryRecords?: number;
  budgets?: number;
  categoryRules?: number;
}

export interface ParsedBackupPreview {
  valid: boolean;
  error?: string;
  warnings: string[];
  payload?: FullBackupPayload;
  counts?: BackupSummaryCounts;
  periodRange?: { start: string; end: string } | null;
  duplicateTransactionsCount?: number;
  duplicateAccountsCount?: number;
  integrityVerified?: boolean;
}

export function sanitizeDocumentsForMetadata(docs: DocumentItem[]): DocumentItem[] {
  return docs.map((d) => {
    const clean: DocumentItem = {
      id: d.id,
      name: d.name,
      type: d.type,
      date: d.date,
      size: d.size,
      status: d.status,
      hasBlob: Boolean(d.hasBlob),
      fileId: d.fileId || (d.hasBlob ? `file-${d.id}` : undefined),
      mimeType: d.mimeType,
      extractedTransactions: d.extractedTransactions,
    };
    if (d.textContent) {
      clean.textContent = d.textContent.slice(0, 12000);
    }
    return clean;
  });
}

function stableNormalizeDatasetForHash(dataset: AppDataset): Record<string, unknown> {
  return {
    accounts: dataset.accounts || [],
    transactions: dataset.transactions || [],
    creditCards: dataset.creditCards || [],
    boletos: dataset.boletos || [],
    debts: dataset.debts || [],
    assets: dataset.assets || [],
    documents: sanitizeDocumentsForMetadata(dataset.documents || []),
    salaries: dataset.salaries ?? { sources: [], records: [], adjustments: [] },
    budgets: dataset.budgets ?? [],
    categoryRules: dataset.categoryRules ?? [],
    settings: dataset.settings ?? null,
  };
}

/**
 * Computes a deterministic dual-lane 64-bit hex fingerprint for backup integrity validation.
 * Works synchronously in browsers, Android WebView, Node, and Vitest without native dependencies.
 */
export function computeDatasetChecksum(dataset: AppDataset): string {
  const canonical = JSON.stringify(stableNormalizeDatasetForHash(dataset));
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < canonical.length; i++) {
    const code = canonical.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fnv1a64-${part1}${part2}-${canonical.length}`;
}

export function buildFullBackup(
  dataset: AppDataset,
  fileReferences?: FileReferenceInfo[],
  exportedAt = new Date().toISOString(),
  ownerUid?: string
): FullBackupPayload {
  const normalizedData: AppDataset = {
    accounts: dataset.accounts,
    transactions: dataset.transactions,
    creditCards: dataset.creditCards,
    boletos: dataset.boletos,
    debts: dataset.debts,
    assets: dataset.assets,
    documents: sanitizeDocumentsForMetadata(dataset.documents),
    ...(dataset.salaries ? { salaries: dataset.salaries } : {}),
    ...(Array.isArray(dataset.budgets) ? { budgets: dataset.budgets } : {}),
    ...(Array.isArray(dataset.categoryRules) ? { categoryRules: dataset.categoryRules } : {}),
    // Only visual preferences — zero API keys, tokens, or credentials
    settings: dataset.settings,
  };

  return {
    app: 'FINANCE_IA',
    backupVersion: 2,
    schemaVersion: STORAGE_SCHEMA_VERSION,
    exportedAt,
    ...(ownerUid ? { ownerUid } : {}),
    integrityHash: computeDatasetChecksum(normalizedData),
    fileReferences,
    data: normalizedData,
  };
}

export async function buildFullBackupWithFileRefs(
  dataset: AppDataset,
  ownerUid?: string
): Promise<FullBackupPayload> {
  const fileRefs = await fileStorageService.listFileReferences();
  return buildFullBackup(dataset, fileRefs, new Date().toISOString(), ownerUid);
}

export function getBackupCounts(dataset: AppDataset): BackupSummaryCounts {
  return {
    accounts: dataset.accounts.length,
    transactions: dataset.transactions.length,
    creditCards: dataset.creditCards.length,
    boletos: dataset.boletos.length,
    debts: dataset.debts.length,
    assets: dataset.assets.length,
    documents: dataset.documents.length,
    salarySources: dataset.salaries?.sources.length ?? 0,
    salaryRecords: dataset.salaries?.records.length ?? 0,
    budgets: dataset.budgets?.length ?? 0,
    categoryRules: dataset.categoryRules?.length ?? 0,
  };
}

function asArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

export function parseAndValidateBackup(
  rawJson: string,
  currentDataset?: AppDataset
): ParsedBackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      warnings: [],
      error: 'O arquivo não contém um JSON válido.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      warnings: [],
      error: 'Formato de backup inválido: objeto raiz esperado.',
    };
  }

  const obj = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  const rawData =
    obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : obj;

  if (!obj.data) {
    warnings.push('Backup em formato legado detectado; módulos ausentes permanecerão vazios.');
  }

  const hasAnyKnownArray = [
    'accounts',
    'transactions',
    'creditCards',
    'boletos',
    'debts',
    'assets',
    'documents',
  ].some((k) => Array.isArray(rawData[k]));

  if (!hasAnyKnownArray) {
    return {
      valid: false,
      warnings: [],
      error: 'Nenhum conjunto de dados financeiros válido foi encontrado neste arquivo.',
    };
  }

  const rawAccounts = asArray<Account>(rawData.accounts).map((a) => {
    const opening = typeof a.openingBalance === 'number' ? a.openingBalance : a.balance ?? 0;
    const openingBalanceCents =
      typeof a.openingBalanceCents === 'number' && Number.isSafeInteger(a.openingBalanceCents)
        ? a.openingBalanceCents
        : toCents(opening);
    return {
      ...a,
      openingBalance: fromCents(openingBalanceCents),
      openingBalanceCents,
    };
  });

  const rawTransactions = asArray<Transaction>(rawData.transactions)
    .filter(
      (t) =>
        t &&
        typeof t.id === 'string' &&
        (typeof t.amountCents === 'number' || typeof t.amount === 'number') &&
        typeof t.date === 'string'
    )
    .map((t) => {
      const amountCents = getTransactionAmountCents(t);
      return {
        ...t,
        amountCents,
        amount: typeof t.amount === 'number' && Number.isFinite(t.amount) ? t.amount : fromCents(amountCents),
      };
    });
  if (rawTransactions.length !== asArray(rawData.transactions).length) {
    warnings.push('Alguns lançamentos com campos obrigatórios ausentes foram ignorados na leitura.');
  }

  const normalizedSettings =
    rawData.settings && typeof rawData.settings === 'object'
      ? (rawData.settings as AppSettingsSnapshot)
      : undefined;

  const rawSalaries =
    rawData.salaries && typeof rawData.salaries === 'object'
      ? (rawData.salaries as SalaryDataset)
      : undefined;

  const rawBudgets = Array.isArray(rawData.budgets)
    ? (rawData.budgets as CategoryBudget[])
        .filter((b) => b && typeof b.id === 'string' && typeof b.category === 'string')
        .map((b) => {
          const limitCents =
            typeof b.limitCents === 'number' && Number.isSafeInteger(b.limitCents)
              ? cents(b.limitCents)
              : toCents(typeof b.limitAmount === 'number' ? b.limitAmount : 0);
          return {
            ...b,
            limitCents,
            limitAmount: fromCents(limitCents),
          };
        })
    : undefined;

  const rawCategoryRules = Array.isArray(rawData.categoryRules)
    ? (rawData.categoryRules as CategoryRule[]).filter(
        (r) => r && typeof r.id === 'string' && typeof r.keyword === 'string' && typeof r.category === 'string'
      )
    : undefined;

  const normalizedData: AppDataset = {
    accounts: rawAccounts,
    transactions: rawTransactions,
    creditCards: asArray<CreditCard>(rawData.creditCards),
    boletos: asArray<Boleto>(rawData.boletos),
    debts: asArray<Debt>(rawData.debts),
    assets: asArray<Asset>(rawData.assets),
    documents: sanitizeDocumentsForMetadata(asArray<DocumentItem>(rawData.documents)),
    ...(rawSalaries && Array.isArray(rawSalaries.sources) && Array.isArray(rawSalaries.records)
      ? {
          salaries: {
            sources: rawSalaries.sources,
            records: rawSalaries.records,
            adjustments: Array.isArray(rawSalaries.adjustments) ? rawSalaries.adjustments : [],
          },
        }
      : {}),
    ...(rawBudgets ? { budgets: rawBudgets } : {}),
    ...(rawCategoryRules ? { categoryRules: rawCategoryRules } : {}),
    settings: normalizedSettings,
  };

  let integrityVerified = false;
  if (typeof obj.integrityHash === 'string' && obj.integrityHash.trim()) {
    const rawDatasetForHash: AppDataset = {
      accounts: asArray<Account>(rawData.accounts),
      transactions: asArray<Transaction>(rawData.transactions),
      creditCards: asArray<CreditCard>(rawData.creditCards),
      boletos: asArray<Boleto>(rawData.boletos),
      debts: asArray<Debt>(rawData.debts),
      assets: asArray<Asset>(rawData.assets),
      documents: sanitizeDocumentsForMetadata(asArray<DocumentItem>(rawData.documents)),
      ...(rawSalaries ? { salaries: rawSalaries } : {}),
      ...(Array.isArray(rawData.budgets) ? { budgets: rawData.budgets as CategoryBudget[] } : {}),
      ...(Array.isArray(rawData.categoryRules) ? { categoryRules: rawData.categoryRules as CategoryRule[] } : {}),
      settings: normalizedSettings,
    };
    const expectedFromRaw = computeDatasetChecksum(rawDatasetForHash);
    const expectedFromNorm = computeDatasetChecksum(normalizedData);
    if (obj.integrityHash !== expectedFromRaw && obj.integrityHash !== expectedFromNorm) {
      return {
        valid: false,
        warnings,
        integrityVerified: false,
        error:
          'Hash de integridade divergente: o backup pode ter sido alterado ou corrompido. Restauração cancelada para proteger seus dados.',
      };
    }
    integrityVerified = true;
  } else {
    warnings.push('Backup sem hash de integridade (versão v1); validação estrutural concluída.');
  }

  // Compute covered date range
  const dates = rawTransactions
    .map((t) => t.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const periodRange =
    dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : null;

  // Duplicate detection against existing ledger
  let duplicateTransactionsCount = 0;
  let duplicateAccountsCount = 0;
  if (currentDataset) {
    const existingAccountIds = new Set(currentDataset.accounts.map((a) => a.id));
    duplicateAccountsCount = rawAccounts.filter((a) => existingAccountIds.has(a.id)).length;

    const existingTxIds = new Set(currentDataset.transactions.map((t) => t.id));
    duplicateTransactionsCount = rawTransactions.filter(
      (t) => existingTxIds.has(t.id) || checkDuplicateTransaction(currentDataset.transactions, t)
    ).length;
  }

  const payload: FullBackupPayload = {
    app: 'FINANCE_IA',
    backupVersion: typeof obj.backupVersion === 'number' ? obj.backupVersion : 1,
    schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    ...(typeof obj.ownerUid === 'string' ? { ownerUid: obj.ownerUid } : {}),
    integrityHash:
      typeof obj.integrityHash === 'string'
        ? obj.integrityHash
        : computeDatasetChecksum(normalizedData),
    fileReferences: Array.isArray(obj.fileReferences)
      ? (obj.fileReferences as FileReferenceInfo[])
      : undefined,
    data: normalizedData,
  };

  return {
    valid: true,
    warnings,
    payload,
    counts: getBackupCounts(normalizedData),
    periodRange,
    duplicateTransactionsCount,
    duplicateAccountsCount,
    integrityVerified,
  };
}

function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[]
): { merged: T[]; addedCount: number } {
  const existingIds = new Set(existing.map((item) => item.id));
  const newOnes = incoming.filter((item) => item.id && !existingIds.has(item.id));
  return {
    merged: [...existing, ...newOnes],
    addedCount: newOnes.length,
  };
}

export function applyBackupDataset(
  current: AppDataset,
  incoming: AppDataset,
  mode: 'replace' | 'merge'
): { next: AppDataset; addedTotal: number } {
  if (mode === 'replace') {
    const total =
      incoming.accounts.length +
      incoming.transactions.length +
      incoming.creditCards.length +
      incoming.boletos.length +
      incoming.debts.length +
      incoming.assets.length +
      incoming.documents.length +
      (incoming.budgets?.length ?? 0) +
      (incoming.categoryRules?.length ?? 0) +
      (incoming.salaries?.records.length ?? 0);

    return {
      next: {
        accounts: incoming.accounts,
        transactions: incoming.transactions,
        creditCards: incoming.creditCards,
        boletos: incoming.boletos,
        debts: incoming.debts,
        assets: incoming.assets,
        documents: sanitizeDocumentsForMetadata(incoming.documents),
        salaries: incoming.salaries ?? { sources: [], records: [], adjustments: [] },
        budgets: incoming.budgets ?? [],
        categoryRules: incoming.categoryRules ?? [],
        settings: incoming.settings || current.settings,
      },
      addedTotal: total,
    };
  }

  const accRes = mergeById(current.accounts, incoming.accounts);
  const txRes = mergeById(current.transactions, incoming.transactions);
  const cardRes = mergeById(current.creditCards, incoming.creditCards);
  const bolRes = mergeById(current.boletos, incoming.boletos);
  const debtRes = mergeById(current.debts, incoming.debts);
  const assetRes = mergeById(current.assets, incoming.assets);
  const docRes = mergeById(current.documents, sanitizeDocumentsForMetadata(incoming.documents));
  const budgetRes = mergeById(current.budgets ?? [], incoming.budgets ?? []);
  const ruleRes = mergeById(current.categoryRules ?? [], incoming.categoryRules ?? []);

  const curSal = current.salaries ?? { sources: [], records: [], adjustments: [] };
  const incSal = incoming.salaries ?? { sources: [], records: [], adjustments: [] };
  const salSourceRes = mergeById(curSal.sources, incSal.sources);
  const salRecordRes = mergeById(curSal.records, incSal.records);
  const salAdjRes = mergeById(curSal.adjustments, incSal.adjustments);

  return {
    next: {
      accounts: accRes.merged,
      transactions: txRes.merged,
      creditCards: cardRes.merged,
      boletos: bolRes.merged,
      debts: debtRes.merged,
      assets: assetRes.merged,
      documents: docRes.merged,
      salaries: {
        sources: salSourceRes.merged,
        records: salRecordRes.merged,
        adjustments: salAdjRes.merged,
      },
      budgets: budgetRes.merged,
      categoryRules: ruleRes.merged,
      settings: current.settings,
    },
    addedTotal:
      accRes.addedCount +
      txRes.addedCount +
      cardRes.addedCount +
      bolRes.addedCount +
      debtRes.addedCount +
      assetRes.addedCount +
      docRes.addedCount +
      budgetRes.addedCount +
      ruleRes.addedCount +
      salSourceRes.addedCount +
      salRecordRes.addedCount +
      salAdjRes.addedCount,
  };
}

export function savePreOperationSnapshot(
  dataset: AppDataset,
  reason: PreResetSnapshot['reason'],
  ownerUid?: string
): { snapshot: PreResetSnapshot; ok: boolean; error?: string } {
  const snapshot: PreResetSnapshot = {
    id: generateEntityId('snap'),
    savedAt: new Date().toISOString(),
    reason,
    backup: buildFullBackup(dataset, undefined, new Date().toISOString(), ownerUid),
  };

  const res = saveJsonSafe(STORAGE_KEYS.preResetSnapshot, snapshot);

  if (db) {
    void db.backups
      .put({
        id: snapshot.id,
        reason,
        createdAt: snapshot.savedAt,
        schemaVersion: STORAGE_SCHEMA_VERSION,
        payloadJson: JSON.stringify(snapshot.backup),
      })
      .catch(() => {
        // non-fatal IndexedDB backup mirror
      });
  }

  return { snapshot, ok: res.ok, error: res.error };
}

export function validateDatasetIntegrity(dataset: AppDataset): { ok: boolean; error?: string } {
  if (!Array.isArray(dataset.accounts) || !Array.isArray(dataset.transactions)) {
    return { ok: false, error: 'Estrutura de contas ou lançamentos inválida após restauração.' };
  }
  const hasCorruptAmounts = dataset.transactions.some((t) => {
    const invalidLegacy = typeof t.amount !== 'number' || !Number.isFinite(t.amount);
    const invalidCents =
      t.amountCents !== undefined &&
      (typeof t.amountCents !== 'number' || !Number.isSafeInteger(t.amountCents));
    return invalidLegacy || invalidCents;
  });
  if (hasCorruptAmounts) {
    return { ok: false, error: 'Valores inválidos encontrados nos lançamentos restaurados.' };
  }
  const hasInvalidAccounts = dataset.accounts.some(
    (a) =>
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      typeof a.institutionName !== 'string' ||
      typeof a.accountName !== 'string'
  );
  if (hasInvalidAccounts) {
    return { ok: false, error: 'Contas com identificador ou nome inválido encontradas na restauração.' };
  }
  return { ok: true };
}

function escapeCsvField(val: string | number): string {
  const safe = sanitizeCellForSheet(val);
  const str = String(safe ?? '');
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateTransactionsCsv(transactions: Transaction[]): string {
  const header = [
    'ID',
    'Data',
    'Descrição',
    'Categoria',
    'Operação',
    'Vínculo',
    'Conta',
    'Direção',
    'Valor (R$)',
    'Transferência Própria',
    'Pagador/Recebedor',
    'ID Externo/E2E',
    'Status',
  ];

  const rows = transactions.map((t) => {
    const amtCents = getTransactionAmountCents(t);
    return [
      t.id,
      t.date,
      t.description,
      t.category,
      t.operationType || 'OUTRO',
      t.entityId,
      t.account,
      t.direction === 'INCOME' ? 'Receita' : 'Despesa',
      fromCents(amtCents).toFixed(2).replace('.', ','),
      t.isInternalTransfer ? 'Sim' : 'Não',
      t.counterparty || '',
      t.externalId || '',
      t.status,
    ];
  });

  const lines = [header, ...rows].map((row) => row.map(escapeCsvField).join(';'));
  // UTF-8 BOM for clean Excel compatibility in Portuguese
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadTransactionsCsv(transactions: Transaction[]): void {
  const csv = generateTransactionsCsv(transactions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Savio_Financas_Lancamentos_${todayLocal()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
