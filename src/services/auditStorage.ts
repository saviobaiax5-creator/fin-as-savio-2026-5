import { AuditLogEntry, TransactionReversalRecord } from '../types';
import { db } from './indexedDb';
import { STORAGE_KEYS, loadJsonWithRecovery, saveJsonSafe } from './storage';

export function loadAuditLogs(): AuditLogEntry[] {
  return loadJsonWithRecovery<AuditLogEntry[]>(
    STORAGE_KEYS.auditLogs,
    [],
    Array.isArray
  ).data;
}

export function loadReversalRecords(): TransactionReversalRecord[] {
  return loadJsonWithRecovery<TransactionReversalRecord[]>(
    STORAGE_KEYS.reversals,
    [],
    Array.isArray
  ).data;
}

export function appendAuditLog(entry: AuditLogEntry): AuditLogEntry[] {
  const existing = loadAuditLogs();
  const next = [entry, ...existing].slice(0, 1000);
  saveJsonSafe(STORAGE_KEYS.auditLogs, next);
  if (db) {
    void db.auditLogs.put(entry).catch(() => {
      // non-fatal async mirror
    });
  }
  return next;
}

export function appendReversalRecord(
  record: TransactionReversalRecord
): TransactionReversalRecord[] {
  const existing = loadReversalRecords();
  const next = [record, ...existing].slice(0, 1000);
  saveJsonSafe(STORAGE_KEYS.reversals, next);
  if (db) {
    void db.reversals.put(record).catch(() => {
      // non-fatal async mirror
    });
  }
  return next;
}
