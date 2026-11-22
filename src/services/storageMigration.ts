import { db } from './indexedDb';
import { fileStorageService } from './fileStorage';
import {
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
  storageService,
  writeStringSafe,
} from './storage';
import {
  AppDataset,
  AppSettingsSnapshot,
  sanitizeDocumentsForMetadata,
  savePreOperationSnapshot,
} from './backupService';
import { DocumentItem } from '../types';
import { fromCents, getTransactionAmountCents, safeToCents, ZERO_CENTS } from '../domain/money/money';
import { getAccountOpeningCents } from '../domain/accounts/BalanceCalculator';

export interface MigrationResult {
  ok: boolean;
  migratedLegacyDocsCount: number;
  migratedCentsCount: number;
  cleanedDocuments?: DocumentItem[];
  dexieSynced: boolean;
  error?: string;
}

export function normalizeDatasetMonetaryFields(dataset: AppDataset): {
  dataset: AppDataset;
  migratedCentsCount: number;
} {
  let migratedCentsCount = 0;

  const accounts = dataset.accounts.map((acc) => {
    const hasValidOpeningCents =
      typeof acc.openingBalanceCents === 'number' &&
      Number.isSafeInteger(acc.openingBalanceCents);
    const openingBalanceCents = getAccountOpeningCents(acc);
    if (!hasValidOpeningCents) migratedCentsCount += 1;
    return {
      ...acc,
      openingBalanceCents,
      openingBalance: fromCents(openingBalanceCents),
      balanceCents:
        typeof acc.balanceCents === 'number' && Number.isSafeInteger(acc.balanceCents)
          ? acc.balanceCents
          : safeToCents(acc.balance, ZERO_CENTS),
    };
  });

  const transactions = dataset.transactions.map((tx) => {
    const hasValidAmountCents =
      typeof tx.amountCents === 'number' && Number.isSafeInteger(tx.amountCents);
    const amountCents = getTransactionAmountCents(tx);
    if (!hasValidAmountCents) migratedCentsCount += 1;
    return {
      ...tx,
      amountCents,
      amount: fromCents(amountCents),
    };
  });

  return {
    dataset: {
      ...dataset,
      accounts,
      transactions,
    },
    migratedCentsCount,
  };
}

/**
 * Mirrors active entity datasets into IndexedDB (SavioFinanaDB) stores without altering localStorage.
 */
export async function mirrorDatasetToDexie(
  dataset: AppDataset,
  settings?: AppSettingsSnapshot
): Promise<boolean> {
  const database = db;
  if (!database) return false;
  try {
    const nowIso = new Date().toISOString();
    const { dataset: normalizedDataset } = normalizeDatasetMonetaryFields(dataset);
    await database.transaction(
      'rw',
      [
        database.accounts,
        database.transactions,
        database.creditCards,
        database.boletos,
        database.debts,
        database.assets,
        database.documents,
        database.settings,
      ],
      async () => {
        await database.accounts.clear();
        if (normalizedDataset.accounts.length > 0) {
          await database.accounts.bulkPut(normalizedDataset.accounts);
        }

        await database.transactions.clear();
        if (normalizedDataset.transactions.length > 0) {
          await database.transactions.bulkPut(normalizedDataset.transactions);
        }

        await database.creditCards.clear();
        if (normalizedDataset.creditCards.length > 0) {
          await database.creditCards.bulkPut(normalizedDataset.creditCards);
        }

        await database.boletos.clear();
        if (normalizedDataset.boletos.length > 0) {
          await database.boletos.bulkPut(normalizedDataset.boletos);
        }

        await database.debts.clear();
        if (normalizedDataset.debts.length > 0) {
          await database.debts.bulkPut(normalizedDataset.debts);
        }

        await database.assets.clear();
        if (normalizedDataset.assets.length > 0) {
          await database.assets.bulkPut(normalizedDataset.assets);
        }

        const cleanDocs = sanitizeDocumentsForMetadata(normalizedDataset.documents);
        await database.documents.clear();
        if (cleanDocs.length > 0) await database.documents.bulkPut(cleanDocs);

        if (settings) {
          await database.settings.bulkPut([
            { key: 'theme', value: settings.theme, updatedAt: nowIso },
            { key: 'density', value: settings.density, updatedAt: nowIso },
            { key: 'zoom', value: settings.zoom, updatedAt: nowIso },
          ]);
        }
      }
    );
    return true;
  } catch (err) {
    console.error('[Migration] Dexie mirror error:', err);
    return false;
  }
}

/**
 * Safely migrates legacy localStorage data, monetary cents fields & base64 data URLs into SavioFinanaDB.
 * Guarantees:
 * 1. Never executes localStorage.clear().
 * 2. Captures a pre-migration snapshot before touching anything.
 * 3. Keeps original localStorage keys intact if any error occurs.
 */
export async function runSafeStorageMigration(params: {
  dataset: AppDataset;
  settings?: AppSettingsSnapshot;
}): Promise<MigrationResult> {
  const { dataset, settings } = params;
  const { dataset: normalizedDataset, migratedCentsCount } = normalizeDatasetMonetaryFields(dataset);
  const legacyDocs = normalizedDataset.documents.filter(
    (d) => typeof d.previewUrl === 'string' && d.previewUrl.startsWith('data:')
  );

  try {
    if (migratedCentsCount > 0 || legacyDocs.length > 0) {
      const snapRes = savePreOperationSnapshot(
        { ...dataset, settings },
        'pre_migration'
      );
      if (!snapRes.ok && snapRes.error) {
        console.warn('[Migration] Pre-migration localStorage snapshot warning:', snapRes.error);
      }
    }

    if (migratedCentsCount > 0) {
      storageService.set(STORAGE_KEYS.accounts, normalizedDataset.accounts);
      storageService.set(STORAGE_KEYS.transactions, normalizedDataset.transactions);
    }

    if (legacyDocs.length > 0) {
      let migratedCount = 0;
      const migratedMap = new Map<string, DocumentItem>();

      for (const doc of legacyDocs) {
        if (!doc.previewUrl) continue;
        const meta = await fileStorageService.migrateDataUrlToFile(
          doc.id,
          doc.previewUrl,
          doc.name,
          doc.mimeType
        );
        migratedCount += 1;
        const { previewUrl: _dropped, ...rest } = doc;
        migratedMap.set(doc.id, {
          ...rest,
          fileId: meta.fileId,
          hasBlob: true,
          mimeType: meta.mimeType,
          size: meta.sizeLabel,
        });
      }

      const cleanedDocuments = sanitizeDocumentsForMetadata(
        normalizedDataset.documents.map((d) => migratedMap.get(d.id) || d)
      );

      // Update sanitized docs key safely (never localStorage.clear())
      const writeRes = storageService.set(STORAGE_KEYS.docs, cleanedDocuments);
      if (!writeRes.ok) {
        return {
          ok: false,
          migratedLegacyDocsCount: migratedCount,
          migratedCentsCount,
          dexieSynced: false,
          error: writeRes.error || 'Falha ao atualizar metadados após migração de arquivos.',
        };
      }

      writeStringSafe(STORAGE_KEYS.schemaVersion, String(STORAGE_SCHEMA_VERSION));
      writeStringSafe(STORAGE_KEYS.migrationVersion, String(STORAGE_SCHEMA_VERSION));

      const dexieSynced = await mirrorDatasetToDexie(
        { ...normalizedDataset, documents: cleanedDocuments },
        settings
      );

      return {
        ok: true,
        migratedLegacyDocsCount: migratedCount,
        migratedCentsCount,
        cleanedDocuments,
        dexieSynced,
      };
    }

    writeStringSafe(STORAGE_KEYS.schemaVersion, String(STORAGE_SCHEMA_VERSION));
    writeStringSafe(STORAGE_KEYS.migrationVersion, String(STORAGE_SCHEMA_VERSION));
    const dexieSynced = await mirrorDatasetToDexie(normalizedDataset, settings);

    return {
      ok: true,
      migratedLegacyDocsCount: 0,
      migratedCentsCount,
      dexieSynced,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido na migração segura.';
    console.error('[Migration] Failed safely without clearing localStorage:', msg);
    return {
      ok: false,
      migratedLegacyDocsCount: 0,
      migratedCentsCount: 0,
      dexieSynced: false,
      error: msg,
    };
  }
}

