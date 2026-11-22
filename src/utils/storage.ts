export {
  STORAGE_SCHEMA_VERSION,
  STORAGE_KEYS,
  storageService,
  loadJsonWithRecovery,
  saveJsonSafe,
  readStringSafe,
  writeStringSafe,
  clearEntityStoragePreservingBackups,
  listCorruptBackups,
  readRawKeySafe,
  removeRawKeySafe,
} from '../services/storage';
export type {
  StorageService,
  RecoveryBackup,
  StorageReadStatus,
  StorageLoadResult,
  StorageSaveResult,
  CorruptBackupInfo,
} from '../services/storage';
