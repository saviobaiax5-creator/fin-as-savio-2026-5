import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  Account,
  Asset,
  Boleto,
  CategoryBudget,
  CategoryRule,
  CreditCard,
  Debt,
  DocumentItem,
  Transaction,
} from '../types';
import type { SalaryDataset } from '../types/salary';
import {
  AppDataset,
  AppSettingsSnapshot,
  BackupSummaryCounts,
  applyBackupDataset,
  computeDatasetChecksum,
  getBackupCounts,
  sanitizeDocumentsForMetadata,
} from './backupService';
import {
  captureAndValidateExistingLocalBackup,
  countDatasetRecords,
  hasNonEmptyDataset,
} from './dataProtectionService';
import { OperationType, firestoreDb, handleFirestoreError } from './firebaseClient';
import { db, type CloudSyncQueueRecord } from './indexedDb';
import { readRawKeySafe, removeRawKeySafe, writeStringSafe } from './storage';
import type { AuthUserSummary } from './authService';

export type SyncStatus =
  | 'IDLE'
  | 'SYNCING'
  | 'SYNCED'
  | 'PENDING_OFFLINE'
  | 'CONFLICT'
  | 'UNVERIFIED_EMAIL'
  | 'ERROR';

export type ConflictResolutionStrategy = 'KEEP_LOCAL' | 'USE_CLOUD' | 'MERGE_BOTH';

export interface SyncConflictState {
  uid: string;
  previousOwnerUid?: string | null;
  detectedAt: string;
  localDataset: AppDataset;
  cloudDataset: AppDataset;
  localCounts: BackupSummaryCounts;
  cloudCounts: BackupSummaryCounts;
  localHash: string;
  cloudHash: string;
}

export interface CloudReconciliationResult {
  outcome:
    | 'EMPTY_BOTH'
    | 'PULLED_CLOUD'
    | 'MIGRATED_LOCAL'
    | 'SYNCED_MATCH'
    | 'CONFLICT'
    | 'QUEUED_OFFLINE'
    | 'UNVERIFIED_EMAIL'
    | 'ABORTED_BACKUP_VALIDATION';
  status: SyncStatus;
  statusMessage: string;
  dataset?: AppDataset;
  conflict?: SyncConflictState;
  lastSyncedAt?: string;
  error?: string;
}

const SYNC_QUEUE_FALLBACK_KEY = 'finance_ia_cloud_sync_queue_fallback';
const SYNC_META_FALLBACK_PREFIX = 'finance_ia_sync_meta_';
const MAX_BATCH_OPERATIONS = 350;

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const s = typeof val === 'string' ? val.trim() : fallback;
  const effective = s || fallback;
  return effective.slice(0, maxLen);
}

function clampNum(val: unknown, min: number, max: number, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

async function getSyncMeta(key: string): Promise<string | null> {
  if (db) {
    try {
      const rec = await db.syncMetadata.get(key);
      if (rec) return rec.value;
    } catch {
      // fall back to localStorage
    }
  }
  return readRawKeySafe(`${SYNC_META_FALLBACK_PREFIX}${key}`);
}

async function setSyncMeta(key: string, value: string): Promise<void> {
  const nowIso = new Date().toISOString();
  writeStringSafe(`${SYNC_META_FALLBACK_PREFIX}${key}`, value);
  if (db) {
    try {
      await db.syncMetadata.put({ key, value, updatedAt: nowIso });
    } catch {
      // ignore IndexedDB mirror error
    }
  }
}

export async function clearActiveOwnerMeta(): Promise<void> {
  removeRawKeySafe(`${SYNC_META_FALLBACK_PREFIX}activeOwnerUid`);
  if (db) {
    try {
      await db.syncMetadata.delete('activeOwnerUid');
    } catch {
      // ignore IndexedDB delete error
    }
  }
}

export async function getLastSyncInfo(uid: string): Promise<{
  lastSyncedAt: string | null;
  lastSyncedHash: string | null;
}> {
  const [lastSyncedAt, lastSyncedHash] = await Promise.all([
    getSyncMeta(`lastSyncedAt:${uid}`),
    getSyncMeta(`lastSyncedHash:${uid}`),
  ]);
  return { lastSyncedAt, lastSyncedHash };
}

function readQueueFallback(): CloudSyncQueueRecord[] {
  const raw = readRawKeySafe(SYNC_QUEUE_FALLBACK_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CloudSyncQueueRecord[]) : [];
  } catch {
    return [];
  }
}

function writeQueueFallback(items: CloudSyncQueueRecord[]): void {
  if (items.length === 0) {
    removeRawKeySafe(SYNC_QUEUE_FALLBACK_KEY);
  } else {
    writeStringSafe(SYNC_QUEUE_FALLBACK_KEY, JSON.stringify(items));
  }
}

export async function getPendingCloudSyncCount(uid: string): Promise<number> {
  if (db) {
    try {
      const rows = await db.syncQueue.where('uid').equals(uid).toArray();
      return rows.length;
    } catch {
      // fallback
    }
  }
  return readQueueFallback().filter((r) => r.uid === uid).length;
}

export async function enqueueCloudDatasetSync(
  uid: string,
  dataset: AppDataset,
  reasonError?: string
): Promise<number> {
  const nowIso = new Date().toISOString();
  const record: CloudSyncQueueRecord = {
    id: `full-sync-${uid}`,
    uid,
    collectionName: 'FULL_DATASET',
    entityId: uid,
    operation: 'FULL_DATASET_SYNC',
    payloadJson: JSON.stringify(dataset),
    status: 'PENDING',
    attempts: 1,
    ...(reasonError ? { lastError: reasonError.slice(0, 240) } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (db) {
    try {
      await db.syncQueue.put(record);
    } catch {
      // fall through to localStorage fallback
    }
  }

  const currentFallback = readQueueFallback().filter((item) => item.id !== record.id);
  currentFallback.push(record);
  writeQueueFallback(currentFallback);

  return getPendingCloudSyncCount(uid);
}

export async function clearCloudSyncQueueForUser(uid: string): Promise<void> {
  if (db) {
    try {
      const keys = await db.syncQueue.where('uid').equals(uid).primaryKeys();
      if (keys.length > 0) {
        await db.syncQueue.bulkDelete(keys);
      }
    } catch {
      // ignore
    }
  }
  const remaining = readQueueFallback().filter((item) => item.uid !== uid);
  writeQueueFallback(remaining);
}

function serializeAccountDoc(
  uid: string,
  acc: Account,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: acc.id,
    ownerUid: uid,
    entityId: acc.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    institutionName: clampStr(acc.institutionName, 120, 'Instituição'),
    accountName: clampStr(acc.accountName, 120, 'Conta'),
    accountType: acc.accountType || 'checking',
    ...(typeof acc.openingBalanceCents === 'number' && Number.isSafeInteger(acc.openingBalanceCents)
      ? { openingBalanceCents: clampNum(acc.openingBalanceCents, -100000000000, 100000000000) }
      : {}),
    ...(typeof acc.balanceCents === 'number' && Number.isSafeInteger(acc.balanceCents)
      ? { balanceCents: clampNum(acc.balanceCents, -100000000000, 100000000000) }
      : {}),
    ...(typeof acc.projectedBalanceCents === 'number' && Number.isSafeInteger(acc.projectedBalanceCents)
      ? { projectedBalanceCents: clampNum(acc.projectedBalanceCents, -100000000000, 100000000000) }
      : {}),
    ...(typeof acc.projectedBalance === 'number' && Number.isFinite(acc.projectedBalance)
      ? { projectedBalance: clampNum(acc.projectedBalance, -1000000000, 1000000000) }
      : {}),
    balance: clampNum(acc.balance, -1000000000, 1000000000, 0),
    openingBalance: clampNum(acc.openingBalance, -1000000000, 1000000000, 0),
    ...(typeof acc.archived === 'boolean' ? { archived: acc.archived } : {}),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeTransactionDoc(
  uid: string,
  tx: Transaction,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: tx.id,
    ownerUid: uid,
    entityId: tx.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    accountId: clampStr(tx.accountId, 128, 'acc-default'),
    ...(tx.creditCardId ? { creditCardId: clampStr(tx.creditCardId, 128) } : {}),
    date: clampStr(tx.date, 32, nowIso.slice(0, 10)),
    description: clampStr(tx.description, 300, 'Lançamento'),
    category: clampStr(tx.category, 120, 'Outros'),
    account: clampStr(tx.account, 200, ''),
    ...(typeof tx.amountCents === 'number' && Number.isSafeInteger(tx.amountCents)
      ? { amountCents: clampNum(tx.amountCents, 0, 100000000000) }
      : {}),
    amount: clampNum(tx.amount, 0, 1000000000, 0),
    direction: tx.direction === 'INCOME' ? 'INCOME' : 'EXPENSE',
    status: tx.status || 'PENDING',
    origin: tx.origin || 'MANUAL',
    ...(typeof tx.isInternalTransfer === 'boolean'
      ? { isInternalTransfer: tx.isInternalTransfer }
      : {}),
    ...(tx.operationType ? { operationType: clampStr(tx.operationType, 40) } : {}),
    ...(tx.counterparty ? { counterparty: clampStr(tx.counterparty, 200) } : {}),
    ...(tx.externalId ? { externalId: clampStr(tx.externalId, 200) } : {}),
    ...(tx.salaryRecordId ? { salaryRecordId: clampStr(tx.salaryRecordId, 128) } : {}),
    ...(tx.transferId ? { transferId: clampStr(tx.transferId, 128) } : {}),
    ...(tx.idempotencyKey ? { idempotencyKey: clampStr(tx.idempotencyKey, 160) } : {}),
    ...(tx.reversedTransactionId
      ? { reversedTransactionId: clampStr(tx.reversedTransactionId, 128) }
      : {}),
    ...(tx.reversalTransactionId
      ? { reversalTransactionId: clampStr(tx.reversalTransactionId, 128) }
      : {}),
    ...(tx.cancelledAt ? { cancelledAt: clampStr(tx.cancelledAt, 64) } : {}),
    ...(tx.cancellationReason
      ? { cancellationReason: clampStr(tx.cancellationReason, 300) }
      : {}),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeCreditCardDoc(
  uid: string,
  card: CreditCard,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: card.id,
    ownerUid: uid,
    entityId: card.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    institutionName: clampStr(card.institutionName, 120, 'Banco'),
    cardName: clampStr(card.cardName, 120, 'Cartão'),
    last4: clampStr(card.last4, 8, '0000'),
    limit: clampNum(card.limit, 0, 100000000, 0),
    closingDay: clampNum(card.closingDay, 1, 31, 10),
    dueDay: clampNum(card.dueDay, 1, 31, 17),
    currentInvoiceAmount: clampNum(card.currentInvoiceAmount, 0, 100000000, 0),
    status: card.status || 'OPEN',
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeBoletoDoc(
  uid: string,
  b: Boleto,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: b.id,
    ownerUid: uid,
    beneficiario: clampStr(b.beneficiario, 160, 'Beneficiário'),
    pagador: clampStr(b.pagador, 160, 'Pagador'),
    instituicao: clampStr(b.instituicao, 120, 'Instituição'),
    linhaDigitavel: clampStr(b.linhaDigitavel, 120, ''),
    vencimento: clampStr(b.vencimento, 32, nowIso.slice(0, 10)),
    valorOriginal: clampNum(b.valorOriginal, 0, 100000000, 0),
    descricao: clampStr(b.descricao, 300, ''),
    status: b.status === 'PAID' ? 'PAID' : 'PENDING',
    entityId: b.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    category: clampStr(b.category, 120, 'Outros'),
    ...(b.paidAt ? { paidAt: clampStr(b.paidAt, 64) } : {}),
    ...(typeof b.paidAmount === 'number' && Number.isFinite(b.paidAmount)
      ? { paidAmount: clampNum(b.paidAmount, 0, 100000000) }
      : {}),
    ...(b.paidAccountId ? { paidAccountId: clampStr(b.paidAccountId, 128) } : {}),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeDebtDoc(
  uid: string,
  d: Debt,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: d.id,
    ownerUid: uid,
    entityId: d.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    creditorName: clampStr(d.creditorName, 160, 'Credor'),
    description: clampStr(d.description, 300, ''),
    originalAmount: clampNum(d.originalAmount, 0, 1000000000, 0),
    outstandingAmount: clampNum(d.outstandingAmount, 0, 1000000000, 0),
    ...(typeof d.installmentAmount === 'number' && Number.isFinite(d.installmentAmount)
      ? { installmentAmount: clampNum(d.installmentAmount, 0, 100000000) }
      : {}),
    dueDay: clampNum(d.dueDay, 1, 31, 10),
    status: d.status || 'ACTIVE',
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeAssetDoc(
  uid: string,
  a: Asset,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: a.id,
    ownerUid: uid,
    entityId: a.entityId === 'CNPJ' ? 'CNPJ' : 'CPF',
    assetType: a.assetType || 'Outros',
    institutionName: clampStr(a.institutionName, 120, 'Instituição'),
    description: clampStr(a.description, 300, 'Ativo'),
    currentValue: clampNum(a.currentValue, 0, 1000000000, 0),
    valuationDate: clampStr(a.valuationDate, 32, nowIso.slice(0, 10)),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeDocumentMetaDoc(
  uid: string,
  d: DocumentItem,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: d.id,
    ownerUid: uid,
    name: clampStr(d.name, 200, 'Documento'),
    type: d.type || 'PDF',
    date: clampStr(d.date, 32, nowIso.slice(0, 10)),
    size: clampStr(d.size, 40, '0 KB'),
    status: d.status === 'PROCESSED' ? 'PROCESSED' : 'PENDING',
    hasBlob: Boolean(d.hasBlob),
    ...(d.fileId ? { fileId: clampStr(d.fileId, 160) } : {}),
    ...(d.mimeType ? { mimeType: clampStr(d.mimeType, 120) } : {}),
    ...(d.textContent ? { textContent: clampStr(d.textContent, 12000) } : {}),
    ...(Array.isArray(d.extractedTransactions)
      ? { extractedTransactionsCount: Math.min(10000, d.extractedTransactions.length) }
      : {}),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: nowIso,
  };
}

function serializeBudgetDoc(
  uid: string,
  b: CategoryBudget,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: b.id,
    ownerUid: uid,
    entityScope: b.entityScope || 'CONSOLIDATED',
    category: clampStr(b.category, 120, 'Outros'),
    limitCents: clampNum(b.limitCents, 0, 100000000000, 0),
    limitAmount: clampNum(b.limitAmount, 0, 1000000000, 0),
    createdAt: existingCreatedAt || nowIso,
    updatedAt: b.updatedAt || nowIso,
  };
}

function serializeCategoryRuleDoc(
  uid: string,
  r: CategoryRule,
  nowIso: string,
  existingCreatedAt?: string
): Record<string, unknown> {
  return {
    id: r.id,
    ownerUid: uid,
    keyword: clampStr(r.keyword, 120, 'regra'),
    category: clampStr(r.category, 120, 'Outros'),
    ...(r.direction ? { direction: r.direction } : {}),
    createdAt: existingCreatedAt || r.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

function stripCloudMeta<T extends Record<string, unknown>>(docData: T): T {
  const { ownerUid: _o, createdAt: _c, updatedAt: _u, ...rest } = docData;
  return rest as T;
}

function userOwnedSubcollectionQuery(uid: string, colName: string) {
  return query(collection(firestoreDb, 'users', uid, colName), where('ownerUid', '==', uid));
}

export async function fetchUserCloudDataset(uid: string): Promise<{
  dataset: AppDataset;
  hasAnyCloudData: boolean;
}> {
  const [
    accSnap,
    txSnap,
    cardSnap,
    bolSnap,
    debtSnap,
    assetSnap,
    docSnap,
    salarySnap,
    budgetSnap,
    ruleSnap,
    settingsSnap,
  ] = await Promise.all([
    getDocs(userOwnedSubcollectionQuery(uid, 'accounts')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/accounts`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'transactions')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/transactions`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'creditCards')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/creditCards`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'boletos')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/boletos`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'debts')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/debts`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'assets')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/assets`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'documents')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/documents`)
    ),
    getDoc(doc(firestoreDb, 'users', uid, 'salaries', 'main')).catch((e) =>
      handleFirestoreError(e, OperationType.GET, `users/${uid}/salaries/main`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'budgets')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/budgets`)
    ),
    getDocs(userOwnedSubcollectionQuery(uid, 'categoryRules')).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, `users/${uid}/categoryRules`)
    ),
    getDoc(doc(firestoreDb, 'users', uid, 'settings', 'preferences')).catch((e) =>
      handleFirestoreError(e, OperationType.GET, `users/${uid}/settings/preferences`)
    ),
  ]);

  const accounts = accSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as Account);
  const transactions = txSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as Transaction);
  const creditCards = cardSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as CreditCard);
  const boletos = bolSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as Boleto);
  const debts = debtSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as Debt);
  const assets = assetSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as Asset);
  const documents = sanitizeDocumentsForMetadata(
    docSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as DocumentItem)
  );
  const budgets = budgetSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as CategoryBudget);
  const categoryRules = ruleSnap.docs.map((d) => stripCloudMeta(d.data()) as unknown as CategoryRule);

  let salaries: SalaryDataset = { sources: [], records: [], adjustments: [] };
  if (salarySnap.exists()) {
    const rawSal = salarySnap.data();
    salaries = {
      sources: Array.isArray(rawSal.sources) ? rawSal.sources : [],
      records: Array.isArray(rawSal.records) ? rawSal.records : [],
      adjustments: Array.isArray(rawSal.adjustments) ? rawSal.adjustments : [],
    };
  }

  let settings: AppSettingsSnapshot | undefined;
  if (settingsSnap.exists()) {
    const rawSet = settingsSnap.data();
    settings = {
      theme: rawSet.theme === 'dark' ? 'dark' : 'light',
      density:
        rawSet.density === 'compact' || rawSet.density === 'enlarged'
          ? rawSet.density
          : 'standard',
      zoom: typeof rawSet.zoom === 'string' ? rawSet.zoom : '100%',
    };
  }

  const dataset: AppDataset = {
    accounts,
    transactions,
    creditCards,
    boletos,
    debts,
    assets,
    documents,
    salaries,
    budgets,
    categoryRules,
    ...(settings ? { settings } : {}),
  };

  return {
    dataset,
    hasAnyCloudData: hasNonEmptyDataset(dataset),
  };
}

interface BatchWriteOp {
  type: 'set' | 'delete';
  path: [string, string, ...string[]];
  data?: Record<string, unknown>;
}

async function commitOperationsInChunks(ops: BatchWriteOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += MAX_BATCH_OPERATIONS) {
    const chunk = ops.slice(i, i + MAX_BATCH_OPERATIONS);
    const batch = writeBatch(firestoreDb);
    for (const op of chunk) {
      const ref = doc(firestoreDb, ...op.path);
      if (op.type === 'set' && op.data) {
        batch.set(ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${chunk[0]?.path[1] || 'unknown'}/batch`);
    }
  }
}

async function collectExistingCreatedAtMap(
  uid: string,
  colName: string
): Promise<Map<string, string>> {
  try {
    const snap = await getDocs(userOwnedSubcollectionQuery(uid, colName));
    const map = new Map<string, string>();
    snap.docs.forEach((d) => {
      const createdAt = d.data()?.createdAt;
      if (typeof createdAt === 'string') {
        map.set(d.id, createdAt);
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

export async function pushDatasetToFirestore(params: {
  user: AuthUserSummary;
  dataset: AppDataset;
}): Promise<{ ok: boolean; syncedAt?: string; error?: string }> {
  const { user, dataset } = params;
  if (!user.emailVerified) {
    return {
      ok: false,
      error: 'Confirme seu e-mail para liberar a gravação sincronizada na nuvem.',
    };
  }

  const uid = user.uid;
  const nowIso = new Date().toISOString();

  const [
    profileSnap,
    accCreated,
    txCreated,
    cardCreated,
    bolCreated,
    debtCreated,
    assetCreated,
    docCreated,
    salSnap,
    budgetCreated,
    ruleCreated,
    settingsSnap,
  ] = await Promise.all([
    getDoc(doc(firestoreDb, 'users', uid)).catch(() => null),
    collectExistingCreatedAtMap(uid, 'accounts'),
    collectExistingCreatedAtMap(uid, 'transactions'),
    collectExistingCreatedAtMap(uid, 'creditCards'),
    collectExistingCreatedAtMap(uid, 'boletos'),
    collectExistingCreatedAtMap(uid, 'debts'),
    collectExistingCreatedAtMap(uid, 'assets'),
    collectExistingCreatedAtMap(uid, 'documents'),
    getDoc(doc(firestoreDb, 'users', uid, 'salaries', 'main')).catch(() => null),
    collectExistingCreatedAtMap(uid, 'budgets'),
    collectExistingCreatedAtMap(uid, 'categoryRules'),
    getDoc(doc(firestoreDb, 'users', uid, 'settings', 'preferences')).catch(() => null),
  ]);

  const ops: BatchWriteOp[] = [];

  const profileCreatedAt =
    profileSnap && profileSnap.exists() && typeof profileSnap.data()?.createdAt === 'string'
      ? profileSnap.data()!.createdAt
      : nowIso;
  ops.push({
    type: 'set',
    path: ['users', uid],
    data: {
      uid,
      email: clampStr(user.email, 254, `${uid}@user.local`),
      ...(user.displayName ? { displayName: clampStr(user.displayName, 120) } : {}),
      ...(user.photoURL ? { photoURL: clampStr(user.photoURL, 500) } : {}),
      lastSyncAt: nowIso,
      createdAt: profileCreatedAt,
      updatedAt: nowIso,
    },
  });

  const enqueueCollectionSync = <T extends { id: string }>(
    colName: string,
    items: T[],
    existingCreated: Map<string, string>,
    serializer: (item: T, createdAt?: string) => Record<string, unknown>
  ) => {
    const activeIds = new Set<string>();
    for (const item of items) {
      if (!item.id) continue;
      activeIds.add(item.id);
      ops.push({
        type: 'set',
        path: ['users', uid, colName, item.id],
        data: serializer(item, existingCreated.get(item.id)),
      });
    }
    for (const existingId of existingCreated.keys()) {
      if (!activeIds.has(existingId)) {
        ops.push({
          type: 'delete',
          path: ['users', uid, colName, existingId],
        });
      }
    }
  };

  enqueueCollectionSync('accounts', dataset.accounts, accCreated, (item, createdAt) =>
    serializeAccountDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('transactions', dataset.transactions, txCreated, (item, createdAt) =>
    serializeTransactionDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('creditCards', dataset.creditCards, cardCreated, (item, createdAt) =>
    serializeCreditCardDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('boletos', dataset.boletos, bolCreated, (item, createdAt) =>
    serializeBoletoDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('debts', dataset.debts, debtCreated, (item, createdAt) =>
    serializeDebtDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('assets', dataset.assets, assetCreated, (item, createdAt) =>
    serializeAssetDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync(
    'documents',
    sanitizeDocumentsForMetadata(dataset.documents),
    docCreated,
    (item, createdAt) => serializeDocumentMetaDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('budgets', dataset.budgets ?? [], budgetCreated, (item, createdAt) =>
    serializeBudgetDoc(uid, item, nowIso, createdAt)
  );
  enqueueCollectionSync('categoryRules', dataset.categoryRules ?? [], ruleCreated, (item, createdAt) =>
    serializeCategoryRuleDoc(uid, item, nowIso, createdAt)
  );

  const sal = dataset.salaries ?? { sources: [], records: [], adjustments: [] };
  const salCreatedAt =
    salSnap && salSnap.exists() && typeof salSnap.data()?.createdAt === 'string'
      ? salSnap.data()!.createdAt
      : nowIso;
  ops.push({
    type: 'set',
    path: ['users', uid, 'salaries', 'main'],
    data: {
      id: 'main',
      ownerUid: uid,
      sources: sal.sources.slice(0, 200),
      records: sal.records.slice(0, 2000),
      adjustments: sal.adjustments.slice(0, 500),
      createdAt: salCreatedAt,
      updatedAt: nowIso,
    },
  });

  if (dataset.settings) {
    const setCreatedAt =
      settingsSnap && settingsSnap.exists() && typeof settingsSnap.data()?.createdAt === 'string'
        ? settingsSnap.data()!.createdAt
        : nowIso;
    ops.push({
      type: 'set',
      path: ['users', uid, 'settings', 'preferences'],
      data: {
        id: 'preferences',
        ownerUid: uid,
        theme: dataset.settings.theme,
        density: dataset.settings.density,
        zoom: clampStr(dataset.settings.zoom, 12, '100%'),
        lastSyncAt: nowIso,
        createdAt: setCreatedAt,
        updatedAt: nowIso,
      },
    });
  }

  await commitOperationsInChunks(ops);
  const hash = computeDatasetChecksum(dataset);
  await Promise.all([
    setSyncMeta(`lastSyncedAt:${uid}`, nowIso),
    setSyncMeta(`lastSyncedHash:${uid}`, hash),
    setSyncMeta('activeOwnerUid', uid),
    clearCloudSyncQueueForUser(uid),
  ]);

  return { ok: true, syncedAt: nowIso };
}

/**
 * Policy on login/startup:
 * 1. Never overwrite cloud data with an empty local database.
 * 2. Never delete/overwrite existing unmigrated local data without validated backup.
 * 3. Detect genuine divergence between local and cloud and surface explicit conflict resolution.
 */
export async function reconcileCloudAndLocalOnLogin(params: {
  user: AuthUserSummary;
  localDataset: AppDataset;
  isOnline: boolean;
}): Promise<CloudReconciliationResult> {
  const { user, localDataset, isOnline } = params;
  const uid = user.uid;
  const localHasData = hasNonEmptyDataset(localDataset);

  if (!isOnline) {
    if (localHasData) {
      await enqueueCloudDatasetSync(uid, localDataset, 'Dispositivo offline durante inicialização');
    }
    return {
      outcome: 'QUEUED_OFFLINE',
      status: 'PENDING_OFFLINE',
      statusMessage: 'Existem alterações aguardando sincronização.',
    };
  }

  let cloudResult: { dataset: AppDataset; hasAnyCloudData: boolean };
  try {
    cloudResult = await fetchUserCloudDataset(uid);
  } catch (err) {
    if (localHasData) {
      await enqueueCloudDatasetSync(
        uid,
        localDataset,
        err instanceof Error ? err.message : 'Falha de leitura na nuvem'
      );
    }
    return {
      outcome: 'QUEUED_OFFLINE',
      status: 'PENDING_OFFLINE',
      statusMessage: 'Existem alterações aguardando sincronização.',
      error: err instanceof Error ? err.message : 'Falha ao consultar dados na nuvem.',
    };
  }

  const { dataset: cloudDataset, hasAnyCloudData: cloudHasData } = cloudResult;

  // Case 1: New empty user + empty cloud
  if (!localHasData && !cloudHasData) {
    const nowIso = new Date().toISOString();
    await setSyncMeta('activeOwnerUid', uid);
    if (user.emailVerified) {
      try {
        await setDoc(doc(firestoreDb, 'users', uid), {
          uid,
          email: clampStr(user.email, 254, `${uid}@user.local`),
          ...(user.displayName ? { displayName: clampStr(user.displayName, 120) } : {}),
          ...(user.photoURL ? { photoURL: clampStr(user.photoURL, 500) } : {}),
          lastSyncAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } catch {
        // non-fatal profile bootstrap failure
      }
    }
    return {
      outcome: 'EMPTY_BOTH',
      status: user.emailVerified ? 'SYNCED' : 'UNVERIFIED_EMAIL',
      statusMessage: user.emailVerified
        ? 'Sincronização com a nuvem concluída.'
        : 'Confirme seu e-mail para sincronizar alterações na nuvem.',
      lastSyncedAt: nowIso,
    };
  }

  // Case 2: Empty local device + existing cloud data -> pull safely from cloud
  if (!localHasData && cloudHasData) {
    const nowIso = new Date().toISOString();
    const cloudHash = computeDatasetChecksum(cloudDataset);
    await Promise.all([
      setSyncMeta(`lastSyncedAt:${uid}`, nowIso),
      setSyncMeta(`lastSyncedHash:${uid}`, cloudHash),
      setSyncMeta('activeOwnerUid', uid),
    ]);
    return {
      outcome: 'PULLED_CLOUD',
      status: 'SYNCED',
      statusMessage: 'Sincronização com a nuvem concluída.',
      dataset: cloudDataset,
      lastSyncedAt: nowIso,
    };
  }

  // Case 3: Local device has data + cloud is empty
  if (localHasData && !cloudHasData) {
    const previousOwnerUid = await getSyncMeta('activeOwnerUid');
    if (previousOwnerUid && previousOwnerUid !== uid) {
      return {
        outcome: 'CONFLICT',
        status: 'CONFLICT',
        statusMessage:
          'Esta conta está vazia na nuvem, mas há dados locais da conta anterior. Escolha começar do zero ou importar.',
        conflict: {
          uid,
          previousOwnerUid,
          detectedAt: new Date().toISOString(),
          localDataset,
          cloudDataset,
          localCounts: getBackupCounts(localDataset),
          cloudCounts: getBackupCounts(cloudDataset),
          localHash: computeDatasetChecksum(localDataset),
          cloudHash: computeDatasetChecksum(cloudDataset),
        },
      };
    }

    const backupCheck = captureAndValidateExistingLocalBackup(localDataset, 'pre_migration', uid);
    if (!backupCheck.ok) {
      return {
        outcome: 'ABORTED_BACKUP_VALIDATION',
        status: 'ERROR',
        statusMessage: 'Não foi possível validar o backup. Seus dados originais foram preservados.',
        error: backupCheck.error,
      };
    }

    if (!user.emailVerified) {
      await enqueueCloudDatasetSync(uid, localDataset, 'Aguardando confirmação de e-mail');
      return {
        outcome: 'UNVERIFIED_EMAIL',
        status: 'UNVERIFIED_EMAIL',
        statusMessage: 'Seus dados estão salvos neste dispositivo. Confirme o e-mail para enviar à nuvem.',
      };
    }

    const pushRes = await pushDatasetToFirestore({ user, dataset: localDataset });
    if (!pushRes.ok) {
      await enqueueCloudDatasetSync(uid, localDataset, pushRes.error);
      return {
        outcome: 'QUEUED_OFFLINE',
        status: 'PENDING_OFFLINE',
        statusMessage: 'Existem alterações aguardando sincronização.',
        error: pushRes.error,
      };
    }

    return {
      outcome: 'MIGRATED_LOCAL',
      status: 'SYNCED',
      statusMessage: 'Sincronização com a nuvem concluída.',
      lastSyncedAt: pushRes.syncedAt,
    };
  }

  // Case 4: Both local and cloud have data
  const localHash = computeDatasetChecksum(localDataset);
  const cloudHash = computeDatasetChecksum(cloudDataset);
  const { lastSyncedHash } = await getLastSyncInfo(uid);

  if (localHash === cloudHash) {
    const nowIso = new Date().toISOString();
    await Promise.all([
      setSyncMeta(`lastSyncedAt:${uid}`, nowIso),
      setSyncMeta(`lastSyncedHash:${uid}`, cloudHash),
      setSyncMeta('activeOwnerUid', uid),
    ]);
    return {
      outcome: 'SYNCED_MATCH',
      status: 'SYNCED',
      statusMessage: 'Sincronização com a nuvem concluída.',
      lastSyncedAt: nowIso,
    };
  }

  // If local hasn't changed since last sync and cloud has newer data, adopt cloud cleanly
  if (lastSyncedHash && localHash === lastSyncedHash) {
    const nowIso = new Date().toISOString();
    await Promise.all([
      setSyncMeta(`lastSyncedAt:${uid}`, nowIso),
      setSyncMeta(`lastSyncedHash:${uid}`, cloudHash),
      setSyncMeta('activeOwnerUid', uid),
    ]);
    return {
      outcome: 'PULLED_CLOUD',
      status: 'SYNCED',
      statusMessage: 'Sincronização com a nuvem concluída.',
      dataset: cloudDataset,
      lastSyncedAt: nowIso,
    };
  }

  // Genuine divergence or unmigrated local data alongside existing cloud data -> surface explicit conflict
  return {
    outcome: 'CONFLICT',
    status: 'CONFLICT',
    statusMessage: 'Conflito detectado entre este dispositivo e a nuvem. Escolha qual versão preservar.',
    conflict: {
      uid,
      detectedAt: new Date().toISOString(),
      localDataset,
      cloudDataset,
      localCounts: getBackupCounts(localDataset),
      cloudCounts: getBackupCounts(cloudDataset),
      localHash,
      cloudHash,
    },
  };
}

export async function resolveSyncConflict(params: {
  user: AuthUserSummary;
  conflict: SyncConflictState;
  strategy: ConflictResolutionStrategy;
}): Promise<{
  ok: boolean;
  dataset?: AppDataset;
  syncedAt?: string;
  error?: string;
}> {
  const { user, conflict, strategy } = params;

  // Always protect local data with a validated backup before any conflict resolution
  const backupCheck = captureAndValidateExistingLocalBackup(
    conflict.localDataset,
    'pre_migration',
    user.uid
  );
  if (!backupCheck.ok) {
    return {
      ok: false,
      error: backupCheck.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.',
    };
  }

  if (strategy === 'USE_CLOUD') {
    const nowIso = new Date().toISOString();
    await Promise.all([
      setSyncMeta(`lastSyncedAt:${user.uid}`, nowIso),
      setSyncMeta(`lastSyncedHash:${user.uid}`, conflict.cloudHash),
      setSyncMeta('activeOwnerUid', user.uid),
      clearCloudSyncQueueForUser(user.uid),
    ]);
    return {
      ok: true,
      dataset: conflict.cloudDataset,
      syncedAt: nowIso,
    };
  }

  const targetDataset =
    strategy === 'KEEP_LOCAL'
      ? conflict.localDataset
      : applyBackupDataset(conflict.cloudDataset, conflict.localDataset, 'merge').next;

  if (!user.emailVerified) {
    await enqueueCloudDatasetSync(user.uid, targetDataset, 'Aguardando verificação de e-mail');
    return {
      ok: true,
      dataset: targetDataset,
    };
  }

  const pushRes = await pushDatasetToFirestore({ user, dataset: targetDataset });
  if (!pushRes.ok) {
    await enqueueCloudDatasetSync(user.uid, targetDataset, pushRes.error);
    return {
      ok: false,
      dataset: targetDataset,
      error: pushRes.error,
    };
  }

  return {
    ok: true,
    dataset: targetDataset,
    syncedAt: pushRes.syncedAt,
  };
}

export function subscribeUserCloudTransactions(
  uid: string,
  onRemoteUpdate: () => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const txQuery = userOwnedSubcollectionQuery(uid, 'transactions');
  return onSnapshot(
    txQuery,
    () => {
      onRemoteUpdate();
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/transactions`);
      }
    }
  );
}

export async function purgeUserCloudData(uid: string): Promise<void> {
  const subcollections = [
    'accounts',
    'transactions',
    'creditCards',
    'boletos',
    'debts',
    'assets',
    'documents',
    'salaries',
    'budgets',
    'categoryRules',
    'settings',
    'backups',
  ];

  const ops: BatchWriteOp[] = [];
  for (const colName of subcollections) {
    const snap = await getDocs(userOwnedSubcollectionQuery(uid, colName));
    snap.docs.forEach((d) => {
      ops.push({ type: 'delete', path: ['users', uid, colName, d.id] });
    });
  }
  await commitOperationsInChunks(ops);
  try {
    await deleteDoc(doc(firestoreDb, 'users', uid));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
  }
  await clearCloudSyncQueueForUser(uid);
}

export { countDatasetRecords };
