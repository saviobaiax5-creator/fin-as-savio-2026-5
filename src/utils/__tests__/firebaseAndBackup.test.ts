import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildWhatsAppShareUrl, resolveMobileShareInfo } from '../../utils/mobileShare';
import { isOriginAllowedForAi } from '../../server/aiGuard';
import {
  EMPTY_APP_DATASET,
  LEGACY_DEMO_FINGERPRINT_IDS,
  initialAccounts,
  initialAssets,
  initialBoletos,
  initialCreditCards,
  initialDebts,
  initialDocuments,
  initialTransactions,
} from '../../data/initialData';
import {
  applyBackupDataset,
  buildFullBackup,
  computeDatasetChecksum,
  parseAndValidateBackup,
  type AppDataset,
} from '../../services/backupService';
import {
  captureAndValidateExistingLocalBackup,
  countDatasetRecords,
  hasNonEmptyDataset,
  inspectExistingLocalStorageData,
  validateBackupWithDryRun,
} from '../../services/dataProtectionService';
import { translateFirebaseAuthError } from '../../services/authService';
import {
  clearCloudSyncQueueForUser,
  enqueueCloudDatasetSync,
  getPendingCloudSyncCount,
  reconcileCloudAndLocalOnLogin,
} from '../../services/cloudSyncService';
import { validateAndPrepareCloudRestore, type CloudBackupSnapshotMeta } from '../../services/cloudBackupService';
import { STORAGE_KEYS, loadJsonWithRecovery, readRawKeySafe } from '../../services/storage';
import { cents } from '../../domain/money/money';

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

const SAMPLE_DATASET: AppDataset = {
  accounts: [
    {
      id: 'acc-real-1',
      entityId: 'CPF',
      institutionName: 'Nubank',
      accountName: 'Conta Principal',
      accountType: 'checking',
      openingBalance: 1200,
      openingBalanceCents: cents(120000),
      balance: 1050,
      balanceCents: cents(105000),
    },
  ],
  transactions: [
    {
      id: 'tx-real-1',
      entityId: 'CPF',
      accountId: 'acc-real-1',
      date: '2026-11-20',
      description: 'Mercado Bairro',
      category: 'Alimentação',
      account: 'Nubank · Conta Principal',
      amount: 150,
      amountCents: cents(15000),
      direction: 'EXPENSE',
      status: 'CONFIRMED',
      origin: 'MANUAL',
    },
  ],
  creditCards: [],
  boletos: [],
  debts: [],
  assets: [],
  documents: [],
  salaries: { sources: [], records: [], adjustments: [] },
  budgets: [],
  categoryRules: [],
  settings: { theme: 'light', density: 'standard', zoom: '100%' },
};

describe('Inicialização Vazia, Proteção de Dados, Auth, Sync & Backup Duplo', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const mockStorage = createMemoryStorage();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: mockStorage,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('inicia estritamente vazio para novas instalações sem nenhum saldo ou movimento fictício', () => {
    expect(initialAccounts).toEqual([]);
    expect(initialTransactions).toEqual([]);
    expect(initialCreditCards).toEqual([]);
    expect(initialBoletos).toEqual([]);
    expect(initialDebts).toEqual([]);
    expect(initialAssets).toEqual([]);
    expect(initialDocuments).toEqual([]);
    expect(hasNonEmptyDataset(EMPTY_APP_DATASET)).toBe(false);
    expect(countDatasetRecords(EMPTY_APP_DATASET)).toBe(0);
    expect(LEGACY_DEMO_FINGERPRINT_IDS.accounts.length).toBeGreaterThan(0);
  });

  it('preserva dados locais pré-existentes sem sobrescrever ou apagar na inicialização', () => {
    window.localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(SAMPLE_DATASET.accounts));
    window.localStorage.setItem(
      STORAGE_KEYS.transactions,
      JSON.stringify(SAMPLE_DATASET.transactions)
    );

    const inspection = inspectExistingLocalStorageData();
    expect(inspection.hasAnyData).toBe(true);
    expect(inspection.counts.accounts).toBe(1);
    expect(inspection.counts.transactions).toBe(1);
    expect(inspection.totalRecords).toBe(2);

    const loadedAccounts = loadJsonWithRecovery(STORAGE_KEYS.accounts, [], Array.isArray);
    expect(loadedAccounts.status).toBe('OK');
    expect(loadedAccounts.data).toHaveLength(1);
    expect(loadedAccounts.data[0]).toMatchObject({
      id: 'acc-real-1',
      institutionName: 'Nubank',
    });
  });

  it('calcula integrityHash determinístico e rejeita backup adulterado sem alterar dados ativos', () => {
    const payload = buildFullBackup(SAMPLE_DATASET, undefined, '2026-11-22T10:00:00.000Z', 'uid-1');
    expect(payload.integrityHash).toBe(computeDatasetChecksum(payload.data));

    const validDryRun = validateBackupWithDryRun(payload);
    expect(validDryRun.valid).toBe(true);
    expect(validDryRun.dryRunRestoredCounts?.accounts).toBe(1);
    expect(validDryRun.dryRunRestoredCounts?.transactions).toBe(1);

    // Adulteração silenciosa no valor de uma transação mantendo o hash antigo
    const tampered = JSON.parse(JSON.stringify(payload));
    tampered.data.transactions[0].amount = 999999;
    tampered.data.transactions[0].amountCents = 99999900;

    const parsedTampered = parseAndValidateBackup(JSON.stringify(tampered));
    expect(parsedTampered.valid).toBe(false);
    expect(parsedTampered.integrityVerified).toBe(false);
    expect(parsedTampered.error).toContain('Hash de integridade divergente');

    const failedDryRun = validateBackupWithDryRun(JSON.stringify(tampered));
    expect(failedDryRun.valid).toBe(false);
  });

  it('grava e valida snapshot pré-operação antes de reinicialização e garante estado final 100% vazio (zero demo)', () => {
    window.localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(SAMPLE_DATASET.accounts));

    const capture = captureAndValidateExistingLocalBackup(SAMPLE_DATASET, 'reset', 'uid-teste');
    expect(capture.ok).toBe(true);
    expect(capture.snapshot?.backup.integrityHash).toBeDefined();
    expect(readRawKeySafe(STORAGE_KEYS.preResetSnapshot)).not.toBeNull();

    const resetResult = applyBackupDataset(SAMPLE_DATASET, EMPTY_APP_DATASET, 'replace');
    expect(hasNonEmptyDataset(resetResult.next)).toBe(false);
    expect(resetResult.next.accounts).toEqual([]);
    expect(resetResult.next.transactions).toEqual([]);
  });

  it('traduz erros do Firebase Auth para mensagens claras em português', () => {
    expect(translateFirebaseAuthError({ code: 'auth/invalid-credential' }).message).toContain(
      'E-mail ou senha incorretos'
    );
    const notAllowed = translateFirebaseAuthError({ code: 'auth/operation-not-allowed' });
    expect(notAllowed.providerNotEnabled).toBe(true);
    expect(notAllowed.message).toContain('simulado localmente');

    const recentLogin = translateFirebaseAuthError({ code: 'auth/requires-recent-login' });
    expect(recentLogin.requiresRecentLogin).toBe(true);
    expect(translateFirebaseAuthError({ code: 'auth/network-request-failed' }).message).toContain(
      'Sem conexão'
    );
  });

  it('enfileira alterações localmente quando offline durante login sem perder registros', async () => {
    const uid = 'uid-offline-test';
    const res = await reconcileCloudAndLocalOnLogin({
      user: {
        uid,
        email: 'teste@financeia.app',
        displayName: 'Usuário Teste',
        emailVerified: true,
        providerIds: ['password'],
      },
      localDataset: SAMPLE_DATASET,
      isOnline: false,
    });

    expect(res.outcome).toBe('QUEUED_OFFLINE');
    expect(res.status).toBe('PENDING_OFFLINE');
    expect(await getPendingCloudSyncCount(uid)).toBe(1);

    await enqueueCloudDatasetSync(uid, SAMPLE_DATASET, 'Retry offline');
    expect(await getPendingCloudSyncCount(uid)).toBe(1);

    await clearCloudSyncQueueForUser(uid);
    expect(await getPendingCloudSyncCount(uid)).toBe(0);
  });

  it('valida restauração de backup da nuvem, protege dados locais e bloqueia hash divergente', () => {
    const payload = buildFullBackup(SAMPLE_DATASET, undefined, '2026-11-22T10:00:00.000Z', 'uid-1');
    const cloudSnap: CloudBackupSnapshotMeta = {
      id: 'cbkp-1',
      ownerUid: 'uid-1',
      app: 'FINANCE_IA',
      backupVersion: payload.backupVersion,
      schemaVersion: payload.schemaVersion,
      createdAt: '2026-11-22T10:00:00.000Z',
      reason: 'manual',
      deviceLabel: 'Navegador Web',
      integrityHash: payload.integrityHash!,
      counts: {
        accounts: 1,
        transactions: 1,
        creditCards: 0,
        boletos: 0,
        debts: 0,
        assets: 0,
        documents: 0,
      },
      payloadJson: JSON.stringify(payload),
      byteSize: JSON.stringify(payload).length,
    };

    const validRestore = validateAndPrepareCloudRestore({
      backup: cloudSnap,
      currentDataset: EMPTY_APP_DATASET,
      mode: 'replace',
    });
    expect(validRestore.ok).toBe(true);
    expect(validRestore.restoredDataset?.accounts).toHaveLength(1);
    expect(readRawKeySafe(STORAGE_KEYS.preResetSnapshot)).not.toBeNull();

    const invalidHashSnap: CloudBackupSnapshotMeta = {
      ...cloudSnap,
      integrityHash: 'fnv1a64-deadbeef00000000-10',
    };
    const rejectedRestore = validateAndPrepareCloudRestore({
      backup: invalidHashSnap,
      currentDataset: SAMPLE_DATASET,
      mode: 'replace',
    });
    expect(rejectedRestore.ok).toBe(false);
    expect(rejectedRestore.error).toContain('Hash de integridade divergente');
  });

  it('gera link compatível com celular convertendo ais-dev para ais-pre e monta link do WhatsApp', () => {
    const devResolved = resolveMobileShareInfo(
      'https://ais-dev-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app'
    );
    expect(devResolved.isPreviewDevUrl).toBe(true);
    expect(devResolved.isShareReadyUrl).toBe(true);
    expect(devResolved.shareUrl).toBe(
      'https://ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app'
    );

    const preResolved = resolveMobileShareInfo(
      'https://ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app'
    );
    expect(preResolved.isPreviewDevUrl).toBe(false);
    expect(preResolved.shareUrl).toBe(
      'https://ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app'
    );

    const waUrl = buildWhatsAppShareUrl(preResolved.shareUrl);
    expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(waUrl).toContain(encodeURIComponent(preResolved.shareUrl));
  });

  it('valida origem por Referer em navegadores móveis e garante where(ownerUid) nas queries do Firestore', () => {
    expect(
      isOriginAllowedForAi({
        referer: 'https://ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app/dashboard',
        host: 'ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app',
        nodeEnv: 'production',
      })
    ).toBe(true);

    expect(
      isOriginAllowedForAi({
        origin: 'https://evil-site.example.com',
        host: 'ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app',
        nodeEnv: 'production',
      })
    ).toBe(false);

    const syncSrc = fs.readFileSync(
      path.resolve(__dirname, '../../services/cloudSyncService.ts'),
      'utf-8'
    );
    const backupSrc = fs.readFileSync(
      path.resolve(__dirname, '../../services/cloudBackupService.ts'),
      'utf-8'
    );
    expect(syncSrc).toContain("where('ownerUid', '==', uid)");
    expect(backupSrc).toContain("where('ownerUid', '==', uid)");
  });

  it('usa estritamente as credenciais válidas de firebase-applet-config.json sem sobrescrita por placeholders', async () => {
    const [{ resolvedFirebaseConfig }, rawConfig] = await Promise.all([
      import('../../services/firebaseClient'),
      Promise.resolve(
        JSON.parse(
          fs.readFileSync(path.resolve(__dirname, '../../../firebase-applet-config.json'), 'utf-8')
        )
      ),
    ]);

    expect(resolvedFirebaseConfig.apiKey).toBe(rawConfig.apiKey);
    expect(resolvedFirebaseConfig.apiKey).toMatch(/^AIza[0-9A-Za-z_-]{20,}$/);
    expect(resolvedFirebaseConfig.apiKey).not.toBe('123456');
    expect(resolvedFirebaseConfig.projectId).toBe(rawConfig.projectId);
    expect(resolvedFirebaseConfig.authDomain).toBe(rawConfig.authDomain);
    expect(resolvedFirebaseConfig.appId).toBe(rawConfig.appId);
    expect(resolvedFirebaseConfig.firestoreDatabaseId).toBe(rawConfig.firestoreDatabaseId);
  });

  it('isola cache local de outra conta (activeOwnerUid) antes de migrar para conta vazia', async () => {
    const { clearActiveOwnerMeta } = await import('../../services/cloudSyncService');
    window.localStorage.setItem('finance_ia_sync_meta_activeOwnerUid', 'uid-conta-antiga');
    await clearActiveOwnerMeta();
    expect(window.localStorage.getItem('finance_ia_sync_meta_activeOwnerUid')).toBeNull();

    const syncSrc = fs.readFileSync(
      path.resolve(__dirname, '../../services/cloudSyncService.ts'),
      'utf-8'
    );
    expect(syncSrc).toContain("const previousOwnerUid = await getSyncMeta('activeOwnerUid')");
    expect(syncSrc).toContain('if (previousOwnerUid && previousOwnerUid !== uid)');
  });
});
