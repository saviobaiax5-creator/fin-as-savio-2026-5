import Dexie, { type Table } from 'dexie';
import {
  Transaction,
  Account,
  CreditCard,
  Boleto,
  Debt,
  Asset,
  DocumentItem,
  AuditLogEntry,
  TransactionReversalRecord,
} from '../types';
import type { StoredBankNotificationRecord } from '../domain/notifications/notification.types';
import type {
  AccountExtensionMeta,
  ExtractionBatch,
  ExtractionRule,
  InstitutionProfile,
} from '../types/extractions';

export interface StoredFileRecord {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  createdAt: string;
}

export interface StoredSettingRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface StoredBackupRecord {
  id: string;
  reason: 'manual' | 'reset' | 'replace_import' | 'pre_migration';
  createdAt: string;
  schemaVersion: number;
  payloadJson: string;
}

export interface RecoveryBackupRecord {
  id: string;
  key: string;
  originalValue: string | null;
  createdAt: string;
  reason: string;
  schemaVersion: number;
}

export interface StoredCryptoKeyRecord {
  id: string;
  key: CryptoKey;
  createdAt: string;
}

export interface CloudSyncQueueRecord {
  id: string;
  uid: string;
  collectionName: string;
  entityId: string;
  operation: 'UPSERT' | 'DELETE' | 'FULL_DATASET_SYNC';
  payloadJson: string;
  status: 'PENDING' | 'FAILED';
  attempts: number;
  lastError?: string;
  updatedAt: string;
  createdAt: string;
}

export interface SyncMetadataRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface CloudBackupCacheRecord {
  id: string;
  uid: string;
  createdAt: string;
  reason: string;
  integrityHash: string;
  countsJson: string;
  byteSize: number;
}

export class SavioFinanaDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  accounts!: Table<Account, string>;
  creditCards!: Table<CreditCard, string>;
  boletos!: Table<Boleto, string>;
  debts!: Table<Debt, string>;
  assets!: Table<Asset, string>;
  documents!: Table<DocumentItem, string>;
  files!: Table<StoredFileRecord, string>;
  settings!: Table<StoredSettingRecord, string>;
  backups!: Table<StoredBackupRecord, string>;
  recovery!: Table<RecoveryBackupRecord, string>;
  auditLogs!: Table<AuditLogEntry, string>;
  reversals!: Table<TransactionReversalRecord, string>;
  bankNotificationEvents!: Table<StoredBankNotificationRecord, string>;
  cryptoKeys!: Table<StoredCryptoKeyRecord, string>;
  syncQueue!: Table<CloudSyncQueueRecord, string>;
  syncMetadata!: Table<SyncMetadataRecord, string>;
  cloudBackups!: Table<CloudBackupCacheRecord, string>;
  extractionBatches!: Table<ExtractionBatch, string>;
  institutions!: Table<InstitutionProfile, string>;
  accountExtensions!: Table<AccountExtensionMeta, string>;
  extractionRules!: Table<ExtractionRule, string>;

  constructor() {
    super('SavioFinanaDB');
    this.version(1).stores({
      transactions: 'id, entityId, accountId, date, category, status, externalId',
      accounts: 'id, entityId, archived',
      creditCards: 'id, entityId, status',
      boletos: 'id, entityId, status, vencimento',
      debts: 'id, entityId, status',
      assets: 'id, entityId, assetType',
      documents: 'id, type, status, fileId',
      files: 'id, documentId, mimeType, createdAt',
      settings: 'key',
      backups: 'id, reason, createdAt',
      recovery: 'id, key, createdAt',
    });

    this.version(2).stores({
      transactions: 'id, entityId, accountId, date, category, status, externalId, transferId',
      accounts: 'id, entityId, archived',
      creditCards: 'id, entityId, status',
      boletos: 'id, entityId, status, vencimento',
      debts: 'id, entityId, status',
      assets: 'id, entityId, assetType',
      documents: 'id, type, status, fileId',
      files: 'id, documentId, mimeType, createdAt',
      settings: 'key',
      backups: 'id, reason, createdAt',
      recovery: 'id, key, createdAt',
      auditLogs: 'id, action, entityType, entityId, timestamp',
      reversals: 'id, originalTransactionId, reversalTransactionId, timestamp',
    });

    this.version(3).stores({
      transactions: 'id, entityId, accountId, date, category, status, externalId, transferId',
      accounts: 'id, entityId, archived',
      creditCards: 'id, entityId, status',
      boletos: 'id, entityId, status, vencimento',
      debts: 'id, entityId, status',
      assets: 'id, entityId, assetType',
      documents: 'id, type, status, fileId',
      files: 'id, documentId, mimeType, createdAt',
      settings: 'key',
      backups: 'id, reason, createdAt',
      recovery: 'id, key, createdAt',
      auditLogs: 'id, action, entityType, entityId, timestamp',
      reversals: 'id, originalTransactionId, reversalTransactionId, timestamp',
      bankNotificationEvents:
        'id, status, sourceEventKey, fingerprintHash, packageName, receivedAt, retentionExpiresAt',
      cryptoKeys: 'id',
    });

    this.version(4).stores({
      transactions: 'id, entityId, accountId, date, category, status, externalId, transferId',
      accounts: 'id, entityId, archived',
      creditCards: 'id, entityId, status',
      boletos: 'id, entityId, status, vencimento',
      debts: 'id, entityId, status',
      assets: 'id, entityId, assetType',
      documents: 'id, type, status, fileId',
      files: 'id, documentId, mimeType, createdAt',
      settings: 'key',
      backups: 'id, reason, createdAt',
      recovery: 'id, key, createdAt',
      auditLogs: 'id, action, entityType, entityId, timestamp',
      reversals: 'id, originalTransactionId, reversalTransactionId, timestamp',
      bankNotificationEvents:
        'id, status, sourceEventKey, fingerprintHash, packageName, receivedAt, retentionExpiresAt',
      cryptoKeys: 'id',
      syncQueue: 'id, uid, collectionName, entityId, status, updatedAt',
      syncMetadata: 'key',
      cloudBackups: 'id, uid, createdAt',
    });

    this.version(5).stores({
      transactions: 'id, entityId, accountId, date, category, status, externalId, transferId',
      accounts: 'id, entityId, archived',
      creditCards: 'id, entityId, status',
      boletos: 'id, entityId, status, vencimento',
      debts: 'id, entityId, status',
      assets: 'id, entityId, assetType',
      documents: 'id, type, status, fileId',
      files: 'id, documentId, mimeType, createdAt',
      settings: 'key',
      backups: 'id, reason, createdAt',
      recovery: 'id, key, createdAt',
      auditLogs: 'id, action, entityType, entityId, timestamp',
      reversals: 'id, originalTransactionId, reversalTransactionId, timestamp',
      bankNotificationEvents:
        'id, status, sourceEventKey, fingerprintHash, packageName, receivedAt, retentionExpiresAt',
      cryptoKeys: 'id',
      syncQueue: 'id, uid, collectionName, entityId, status, updatedAt',
      syncMetadata: 'key',
      cloudBackups: 'id, uid, createdAt',
      extractionBatches: 'id, status, format, importedAt, confirmedAccountId, contentFingerprint',
      institutions: 'id, category, status, code',
      accountExtensions: 'id, institutionId, institutionCategory, holderEntity, status',
      extractionRules: 'id, institutionId, entityId, category',
    });
  }
}

export function hasIndexedDbSupport(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export const db: SavioFinanaDatabase | null = hasIndexedDbSupport()
  ? new SavioFinanaDatabase()
  : null;
