import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  storageService,
  STORAGE_KEYS,
  listCorruptBackups,
  readRawKeySafe,
} from '../../services/storage';
import {
  todayLocal,
  currentMonthLocal,
  isValidDate,
  parseLocalDate,
  formatDateBR,
  getMonthKey,
  addDaysLocal,
} from '../dateUtils';
import { canDeleteAccount, toggleAccountArchiveState } from '../../services/accountService';
import {
  buildFullBackup,
  parseAndValidateBackup,
  applyBackupDataset,
  savePreOperationSnapshot,
  validateDatasetIntegrity,
  generateTransactionsCsv,
} from '../../services/backupService';
import { fileStorageService } from '../../services/fileStorage';
import { runSafeStorageMigration } from '../../services/storageMigration';
import {
  appendAuditLog,
  appendReversalRecord,
  loadAuditLogs,
  loadReversalRecords,
} from '../../services/auditStorage';
import { generateEntityId } from '../../domain/common/id';
import { cents } from '../../domain/money/money';
import { Account, Transaction, DocumentItem } from '../../types';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('P0 Safety Suite — Storage, Timezone Dates, Accounts, Backups & File Migration', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const mockStorage = createMemoryStorage();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: mockStorage,
    };
  });

  afterEach(async () => {
    await fileStorageService.clearAllFiles();
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  describe('P0.1 Storage Layer (Corrupt Backup Preservation)', () => {
    it('distinguishes EMPTY, OK, and INVALID states accurately', () => {
      const emptyRes = storageService.getDetailed('missing_key', []);
      expect(emptyRes.status).toBe('EMPTY');
      expect(emptyRes.data).toEqual([]);

      storageService.set('valid_key', [{ id: '1' }]);
      const okRes = storageService.getDetailed('valid_key', [], Array.isArray);
      expect(okRes.status).toBe('OK');
      expect(okRes.data).toEqual([{ id: '1' }]);
    });

    it('creates a RecoveryBackup copy BEFORE returning fallback when JSON is corrupted', () => {
      const corruptRaw = '{ broken json [123';
      window.localStorage.setItem(STORAGE_KEYS.transactions, corruptRaw);

      const res = storageService.getDetailed<Transaction[]>(
        STORAGE_KEYS.transactions,
        [],
        Array.isArray
      );

      expect(res.status).toBe('INVALID');
      expect(res.data).toEqual([]);
      expect(res.corruptBackupKey).toBeDefined();
      expect(res.recovery?.originalValue).toBe(corruptRaw);

      // Verify preserved intact in localStorage
      const preserved = readRawKeySafe(res.corruptBackupKey!);
      expect(preserved).toBe(corruptRaw);
      expect(listCorruptBackups().length).toBe(1);
    });

    it('preserves backup when JSON parses but fails schema validation and supports restore()', () => {
      const wrongShape = JSON.stringify({ unexpected: 'object_instead_of_array' });
      window.localStorage.setItem(STORAGE_KEYS.accounts, wrongShape);

      const res = storageService.getDetailed<Account[]>(STORAGE_KEYS.accounts, [], Array.isArray);
      expect(res.status).toBe('INVALID');
      expect(res.data).toEqual([]);
      expect(res.corruptBackupKey).toBeDefined();

      // Backup manually and test restore of valid JSON backup
      storageService.set('custom_cfg', { step: 1 });
      storageService.backup('custom_cfg', 'manual check');
      window.localStorage.setItem('custom_cfg', '{"step":999}');
      const restored = storageService.restore('custom_cfg');
      expect(restored).toBe(true);
      expect(storageService.get('custom_cfg', { step: 0 })).toEqual({ step: 1 });
    });
  });

  describe('P0.3 Local-Timezone Date Utilities (dateUtils.ts)', () => {
    it('does not shift date near 23h or midnight rollover in local time', () => {
      const lateNight = new Date(2026, 10, 21, 23, 45, 0);
      expect(todayLocal(lateNight)).toBe('2026-11-21');
      expect(currentMonthLocal(lateNight)).toBe('2026-11');

      const earlyMorning = new Date(2026, 10, 22, 0, 5, 0);
      expect(todayLocal(earlyMorning)).toBe('2026-11-22');
    });

    it('handles end-of-month, leap year, and year rollover cleanly', () => {
      expect(addDaysLocal('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDaysLocal('2024-02-28', 1)).toBe('2024-02-29'); // leap year
      expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('validates, parses, and formats Brazilian & ISO dates accurately', () => {
      expect(isValidDate('21/11/2026')).toBe(true);
      expect(isValidDate('2026-11-21')).toBe(true);
      expect(isValidDate('31/02/2026')).toBe(false);
      expect(isValidDate('2026-13-01')).toBe(false);

      const dt = parseLocalDate('21/11/2026');
      expect(dt.getFullYear()).toBe(2026);
      expect(dt.getMonth()).toBe(10);
      expect(dt.getDate()).toBe(21);

      expect(formatDateBR('2026-11-21')).toBe('21/11/2026');
      expect(getMonthKey('21/11/2026')).toBe('2026-11');
      expect(getMonthKey('2026-11-21')).toBe('2026-11');
    });
  });

  describe('P0.5 Account Deletion Blocking & Archiving (accountService.ts)', () => {
    const accounts: Account[] = [
      {
        id: 'acc-linked',
        entityId: 'CPF',
        institutionName: 'Banco Inter',
        accountName: 'Conta Principal',
        accountType: 'checking',
        openingBalance: 1000,
        balance: 900,
      },
      {
        id: 'acc-empty',
        entityId: 'CNPJ',
        institutionName: 'Cora PJ',
        accountName: 'Reserva',
        accountType: 'business',
        openingBalance: 0,
        balance: 0,
      },
    ];

    const txs: Transaction[] = [
      {
        id: 'tx-1',
        entityId: 'CPF',
        accountId: 'acc-linked',
        date: '2026-11-10',
        description: 'Pix Transferência',
        category: 'Transferência',
        account: 'Banco Inter · Conta Principal',
        amount: 100,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'MANUAL',
        isInternalTransfer: true,
      },
    ];

    it('blocks deleting an account that has linked transactions and suggests archiving', () => {
      const check = canDeleteAccount('acc-linked', {
        transactions: txs,
        account: accounts[0],
      });
      expect(check.allowed).toBe(false);
      expect(check.linkedTransactionsCount).toBe(1);
      expect(check.linkedInternalTransfersCount).toBe(1);
      expect(check.suggestArchive).toBe(true);
      expect(check.reason).toContain('Arquive a conta');
    });

    it('allows deleting an account with zero linked transactions and toggles archive state safely', () => {
      const check = canDeleteAccount('acc-empty', {
        transactions: txs,
        account: accounts[1],
      });
      expect(check.allowed).toBe(true);

      const archived = toggleAccountArchiveState(accounts, 'acc-linked');
      expect(archived.find((a) => a.id === 'acc-linked')?.archived).toBe(true);
      const restored = toggleAccountArchiveState(archived, 'acc-linked');
      expect(restored.find((a) => a.id === 'acc-linked')?.archived).toBe(false);
    });
  });

  describe('P0.4 Full Backup, Restore Preview, Integrity & CSV Export (backupService.ts)', () => {
    const baseDataset = {
      accounts: [
        {
          id: 'acc-1',
          entityId: 'CPF' as const,
          institutionName: 'Nubank',
          accountName: 'Conta',
          accountType: 'checking' as const,
          openingBalance: 500,
          balance: 500,
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          entityId: 'CPF' as const,
          accountId: 'acc-1',
          date: '2026-11-01',
          description: 'Supermercado Central',
          category: 'Alimentação',
          account: 'Nubank · Conta',
          amount: 120,
          direction: 'EXPENSE' as const,
          status: 'CONFIRMED' as const,
          origin: 'MANUAL' as const,
        },
      ],
      creditCards: [],
      boletos: [],
      debts: [],
      assets: [],
      documents: [],
      settings: { theme: 'dark' as const, density: 'standard' as const, zoom: '100%' },
    };

    it('builds full backup without secrets, previews counts/periodRange/duplicates, and validates integrity', () => {
      const payload = buildFullBackup(baseDataset);
      const rawJson = JSON.stringify(payload);
      expect(rawJson).not.toContain('GEMINI_API_KEY');
      expect(rawJson).not.toContain('ACCESS_TOKEN');

      const preview = parseAndValidateBackup(rawJson, baseDataset);
      expect(preview.valid).toBe(true);
      expect(preview.counts?.accounts).toBe(1);
      expect(preview.counts?.transactions).toBe(1);
      expect(preview.periodRange).toEqual({ start: '2026-11-01', end: '2026-11-01' });
      expect(preview.duplicateTransactionsCount).toBe(1);
      expect(preview.duplicateAccountsCount).toBe(1);

      // Snapshot before reset + integrity validation
      const snap = savePreOperationSnapshot(baseDataset, 'reset');
      expect(snap.ok).toBe(true);
      expect(readRawKeySafe(STORAGE_KEYS.preResetSnapshot)).not.toBeNull();

      const merged = applyBackupDataset(baseDataset, payload.data, 'merge');
      expect(merged.addedTotal).toBe(0);
      expect(validateDatasetIntegrity(merged.next).ok).toBe(true);

      // Integrity failure check catches corrupted NaN amounts
      const corrupted = {
        ...baseDataset,
        transactions: [{ ...baseDataset.transactions[0], amount: NaN }],
      };
      expect(validateDatasetIntegrity(corrupted).ok).toBe(false);
    });

    it('exports UTF-8 CSV with semicolon delimiter and protects against formula injection', () => {
      const csv = generateTransactionsCsv([
        ...baseDataset.transactions,
        {
          ...baseDataset.transactions[0],
          id: 'tx-2',
          description: '=SUM(A1:A5)',
        },
      ]);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain("'=SUM(A1:A5)");
      expect(csv).toContain('120,00');
    });
  });

  describe('P0.2 File Storage & Safe Migration (fileStorage.ts + storageMigration.ts)', () => {
    it('stores PDF payloads uncompressed without altering bytes', async () => {
      const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });

      const meta = await fileStorageService.saveDocumentFile(
        'doc-pdf-test',
        pdfBlob,
        'extrato.pdf',
        'application/pdf'
      );

      expect(meta.mimeType).toBe('application/pdf');
      expect(meta.sizeBytes).toBe(pdfBytes.length);

      const stored = await fileStorageService.getFile('doc-pdf-test');
      expect(stored?.sizeBytes).toBe(pdfBytes.length);
      expect(stored?.mimeType).toBe('application/pdf');
    });

    it('migrates legacy data: URLs safely without invoking localStorage.clear() or dropping unrelated keys', async () => {
      window.localStorage.setItem('unrelated_user_note', 'keep-me-intact');

      const base64Sample = btoa('hello-receipt');
      const legacyDoc: DocumentItem = {
        id: 'doc-legacy-1',
        name: 'comprovante.txt',
        type: 'PDF',
        date: '21/11/2026',
        size: '1 KB',
        status: 'PENDING',
        mimeType: 'application/pdf',
        previewUrl: `data:application/pdf;base64,${base64Sample}`,
      };

      const res = await runSafeStorageMigration({
        dataset: {
          accounts: [],
          transactions: [],
          creditCards: [],
          boletos: [],
          debts: [],
          assets: [],
          documents: [legacyDoc],
        },
        settings: { theme: 'light', density: 'standard', zoom: '100%' },
      });

      expect(res.ok).toBe(true);
      expect(res.migratedLegacyDocsCount).toBe(1);
      expect(res.cleanedDocuments?.[0].hasBlob).toBe(true);
      expect(res.cleanedDocuments?.[0].fileId).toBe('file-doc-legacy-1');
      expect(res.cleanedDocuments?.[0].previewUrl).toBeUndefined();

      // Pre-migration snapshot preserved & unrelated localStorage key never wiped
      expect(window.localStorage.getItem('unrelated_user_note')).toBe('keep-me-intact');
      expect(window.localStorage.getItem(STORAGE_KEYS.preResetSnapshot)).not.toBeNull();
      const storedFile = await fileStorageService.getFile('doc-legacy-1');
      expect(storedFile).not.toBeNull();
    });

    it('backfills amountCents and openingBalanceCents non-destructively from legacy data', async () => {
      const legacyTx: Transaction = {
        id: 'tx-legacy-cents',
        entityId: 'CPF',
        accountId: 'acc-legacy-1',
        date: '2026-11-18',
        description: 'Café histórico',
        category: 'Alimentação',
        account: 'Inter',
        amount: 19.99,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'MANUAL',
      };
      const legacyAcc: Account = {
        id: 'acc-legacy-1',
        entityId: 'CPF',
        institutionName: 'Inter',
        accountName: 'Conta',
        accountType: 'checking',
        openingBalance: 100.15,
        balance: 80.16,
      };

      const res = await runSafeStorageMigration({
        dataset: {
          accounts: [legacyAcc],
          transactions: [legacyTx],
          creditCards: [],
          boletos: [],
          debts: [],
          assets: [],
          documents: [],
        },
      });

      expect(res.ok).toBe(true);
      expect(res.migratedCentsCount).toBe(2);

      const persistedTxs = storageService.get<Transaction[]>(STORAGE_KEYS.transactions, []);
      expect(persistedTxs[0].amountCents).toBe(1999);
      expect(persistedTxs[0].amount).toBe(19.99);

      const persistedAccs = storageService.get<Account[]>(STORAGE_KEYS.accounts, []);
      expect(persistedAccs[0].openingBalanceCents).toBe(10015);
      expect(persistedAccs[0].openingBalance).toBe(100.15);
    });
  });

  describe('P0.6 Collision-Free IDs & Audit Log Storage', () => {
    it('generates 1,000 collision-free entity IDs synchronously in a tight loop', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i += 1) {
        ids.add(generateEntityId('tx'));
      }
      expect(ids.size).toBe(1000);
    });

    it('persists and recovers audit logs and reversal records safely', () => {
      appendAuditLog({
        id: generateEntityId('audit'),
        action: 'TRANSACTION_REVERSED',
        entityType: 'TRANSACTION',
        entityId: 'tx-1',
        relatedEntityId: 'tr-rev-1',
        actor: 'Tester',
        timestamp: '2026-11-21T12:00:00.000Z',
        reason: 'Estorno teste',
        amountCents: cents(5000),
        previousState: { status: 'CONFIRMED' },
        nextState: { reversalTransactionId: 'tr-rev-1' },
      });

      appendReversalRecord({
        id: generateEntityId('rev'),
        originalTransactionId: 'tx-1',
        reversalTransactionId: 'tr-rev-1',
        actor: 'Tester',
        timestamp: '2026-11-21T12:00:00.000Z',
        reason: 'Estorno teste',
        amountCents: cents(5000),
      });

      const logs = loadAuditLogs();
      const revs = loadReversalRecords();
      expect(logs).toHaveLength(1);
      expect(logs[0].amountCents).toBe(5000);
      expect(revs).toHaveLength(1);
      expect(revs[0].originalTransactionId).toBe('tx-1');
    });
  });
});

