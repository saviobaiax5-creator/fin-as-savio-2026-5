import { db } from '../services/indexedDb';
import { STORAGE_KEYS, readRawKeySafe, saveJsonSafe } from '../services/storage';
import type {
  Account,
  Asset,
  AuditLogEntry,
  Boleto,
  CreditCard,
  Debt,
  Transaction,
  TransactionReversalRecord,
} from '../types';
import type { SalaryDataset } from '../types/salary';
import { saveSalaryDatasetSafely } from '../services/salaryStorage';

export interface AtomicMutationBatch {
  transactions?: Transaction[];
  boletos?: Boleto[];
  creditCards?: CreditCard[];
  debts?: Debt[];
  accounts?: Account[];
  assets?: Asset[];
  salaryData?: SalaryDataset;
  auditLogs?: AuditLogEntry[];
  reversals?: TransactionReversalRecord[];
}

export interface AtomicCommitResult {
  ok: boolean;
  error?: string;
}

/**
 * Persists multi-entity mutations atomically across IndexedDB (single rw transaction)
 * and synchronizes localStorage snapshots with rollback on write failure.
 */
export async function commitAtomicMutationBatch(
  batch: AtomicMutationBatch
): Promise<AtomicCommitResult> {
  const rollbackSnapshots: Array<{ key: string; raw: string | null }> = [];
  const captureKey = (key: string) => {
    rollbackSnapshots.push({ key, raw: readRawKeySafe(key) });
  };

  try {
    if (batch.transactions) {
      captureKey(STORAGE_KEYS.transactions);
      const res = saveJsonSafe(STORAGE_KEYS.transactions, batch.transactions);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar lançamentos.');
    }
    if (batch.boletos) {
      captureKey(STORAGE_KEYS.boletos);
      const res = saveJsonSafe(STORAGE_KEYS.boletos, batch.boletos);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar boletos.');
    }
    if (batch.creditCards) {
      captureKey(STORAGE_KEYS.cards);
      const res = saveJsonSafe(STORAGE_KEYS.cards, batch.creditCards);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar cartões.');
    }
    if (batch.debts) {
      captureKey(STORAGE_KEYS.debts);
      const res = saveJsonSafe(STORAGE_KEYS.debts, batch.debts);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar dívidas.');
    }
    if (batch.accounts) {
      captureKey(STORAGE_KEYS.accounts);
      const res = saveJsonSafe(STORAGE_KEYS.accounts, batch.accounts);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar contas.');
    }
    if (batch.assets) {
      captureKey(STORAGE_KEYS.assets);
      const res = saveJsonSafe(STORAGE_KEYS.assets, batch.assets);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar ativos.');
    }
    if (batch.salaryData) {
      captureKey(STORAGE_KEYS.salaries);
      const res = saveSalaryDatasetSafely(batch.salaryData);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar salários.');
    }
    if (batch.auditLogs) {
      captureKey(STORAGE_KEYS.auditLogs);
      const res = saveJsonSafe(STORAGE_KEYS.auditLogs, batch.auditLogs);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar trilha de auditoria.');
    }
    if (batch.reversals) {
      captureKey(STORAGE_KEYS.reversals);
      const res = saveJsonSafe(STORAGE_KEYS.reversals, batch.reversals);
      if (!res.ok) throw new Error(res.error || 'Falha ao salvar registro de estorno.');
    }
  } catch (err) {
    // Rollback any already-written localStorage keys
    if (typeof window !== 'undefined' && window.localStorage) {
      for (const snap of rollbackSnapshots.reverse()) {
        try {
          if (snap.raw === null) {
            window.localStorage.removeItem(snap.key);
          } else {
            window.localStorage.setItem(snap.key, snap.raw);
          }
        } catch {
          // best effort rollback
        }
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha na gravação atômica local.',
    };
  }

  const database = db;
  if (database) {
    try {
      const tables = [
        database.transactions,
        database.boletos,
        database.creditCards,
        database.debts,
        database.accounts,
        database.assets,
        database.auditLogs,
        database.reversals,
      ];
      await database.transaction('rw', tables, async () => {
        if (batch.transactions) {
          await database.transactions.clear();
          if (batch.transactions.length > 0) await database.transactions.bulkPut(batch.transactions);
        }
        if (batch.boletos) {
          await database.boletos.clear();
          if (batch.boletos.length > 0) await database.boletos.bulkPut(batch.boletos);
        }
        if (batch.creditCards) {
          await database.creditCards.clear();
          if (batch.creditCards.length > 0) await database.creditCards.bulkPut(batch.creditCards);
        }
        if (batch.debts) {
          await database.debts.clear();
          if (batch.debts.length > 0) await database.debts.bulkPut(batch.debts);
        }
        if (batch.accounts) {
          await database.accounts.clear();
          if (batch.accounts.length > 0) await database.accounts.bulkPut(batch.accounts);
        }
        if (batch.assets) {
          await database.assets.clear();
          if (batch.assets.length > 0) await database.assets.bulkPut(batch.assets);
        }
        if (batch.auditLogs) {
          await database.auditLogs.clear();
          if (batch.auditLogs.length > 0) await database.auditLogs.bulkPut(batch.auditLogs);
        }
        if (batch.reversals) {
          await database.reversals.clear();
          if (batch.reversals.length > 0) await database.reversals.bulkPut(batch.reversals);
        }
      });
    } catch {
      // IndexedDB mirror transaction error is non-fatal when localStorage commit succeeded
    }
  }

  return { ok: true };
}
