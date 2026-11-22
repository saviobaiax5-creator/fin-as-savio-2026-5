import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  AppDataset,
  BackupSummaryCounts,
  FullBackupPayload,
  applyBackupDataset,
  buildFullBackupWithFileRefs,
  parseAndValidateBackup,
} from './backupService';
import {
  captureAndValidateExistingLocalBackup,
  validateBackupWithDryRun,
} from './dataProtectionService';
import { OperationType, firestoreDb, handleFirestoreError } from './firebaseClient';
import { db } from './indexedDb';
import { generateEntityId } from '../domain/common/id';
import type { AuthUserSummary } from './authService';

export const CLOUD_BACKUP_MAX_RETENTION = 5;
const MAX_FIRESTORE_BACKUP_PAYLOAD_BYTES = 820_000;

export interface CloudBackupSnapshotMeta {
  id: string;
  ownerUid: string;
  app: 'FINANCE_IA';
  backupVersion: number;
  schemaVersion: number;
  createdAt: string;
  reason: string;
  deviceLabel: string;
  integrityHash: string;
  counts: BackupSummaryCounts;
  payloadJson: string;
  byteSize: number;
}

export interface CreateCloudBackupResult {
  ok: boolean;
  backup?: CloudBackupSnapshotMeta;
  prunedCount?: number;
  error?: string;
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'Android / WebView';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS Safari';
  return 'Navegador Web';
}

export async function listCloudBackups(uid: string): Promise<CloudBackupSnapshotMeta[]> {
  try {
    const q = query(
      collection(firestoreDb, 'users', uid, 'backups'),
      where('ownerUid', '==', uid)
    );
    const snap = await getDocs(q);
    const items = snap.docs
      .map((d) => d.data() as CloudBackupSnapshotMeta)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    if (db) {
      try {
        await db.cloudBackups.where('uid').equals(uid).delete();
        if (items.length > 0) {
          await db.cloudBackups.bulkPut(
            items.map((b) => ({
              id: b.id,
              uid: b.ownerUid,
              createdAt: b.createdAt,
              reason: b.reason || 'manual',
              integrityHash: b.integrityHash,
              countsJson: JSON.stringify(b.counts),
              byteSize: b.byteSize || b.payloadJson.length,
            }))
          );
        }
      } catch {
        // non-fatal local cache mirror
      }
    }

    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/backups`);
  }
}

export async function pruneExcessCloudBackups(
  uid: string,
  maxKeep = CLOUD_BACKUP_MAX_RETENTION
): Promise<number> {
  const backups = await listCloudBackups(uid);
  if (backups.length <= maxKeep) return 0;
  const toDelete = backups.slice(maxKeep);
  let deletedCount = 0;
  for (const oldItem of toDelete) {
    try {
      await deleteDoc(doc(firestoreDb, 'users', uid, 'backups', oldItem.id));
      deletedCount += 1;
    } catch {
      // Stop pruning if any delete fails so newer retention invariant stays safe
    }
  }
  return deletedCount;
}

export async function createCloudBackupSnapshot(params: {
  user: AuthUserSummary;
  dataset: AppDataset;
  reason?: string;
}): Promise<CreateCloudBackupResult> {
  const { user, dataset, reason = 'manual' } = params;
  if (!user.emailVerified) {
    return {
      ok: false,
      error: 'Confirme seu e-mail antes de gravar snapshots de backup na nuvem.',
    };
  }

  const payload = await buildFullBackupWithFileRefs(dataset, user.uid);
  const dryRun = validateBackupWithDryRun(payload);
  if (!dryRun.valid) {
    return {
      ok: false,
      error: dryRun.error || 'Não foi possível validar o backup antes do envio à nuvem.',
    };
  }

  const payloadJson = JSON.stringify(payload);
  const byteSize = payloadJson.length;
  if (byteSize > MAX_FIRESTORE_BACKUP_PAYLOAD_BYTES) {
    return {
      ok: false,
      error:
        'O snapshot excedeu o limite seguro por documento na nuvem (820 KB). Exporte o backup completo em JSON neste dispositivo.',
    };
  }

  const nowIso = new Date().toISOString();
  const backupId = generateEntityId('cbkp');
  const docBody: CloudBackupSnapshotMeta = {
    id: backupId,
    ownerUid: user.uid,
    app: 'FINANCE_IA',
    backupVersion: payload.backupVersion,
    schemaVersion: payload.schemaVersion,
    createdAt: nowIso,
    reason,
    deviceLabel: getDeviceLabel(),
    integrityHash: dryRun.integrityHash,
    counts: dryRun.counts,
    payloadJson,
    byteSize,
  };

  try {
    await setDoc(doc(firestoreDb, 'users', user.uid, 'backups', backupId), docBody);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/backups/${backupId}`);
  }

  const prunedCount = await pruneExcessCloudBackups(user.uid, CLOUD_BACKUP_MAX_RETENTION).catch(
    () => 0
  );

  return {
    ok: true,
    backup: docBody,
    prunedCount,
  };
}

export function validateAndPrepareCloudRestore(params: {
  backup: CloudBackupSnapshotMeta;
  currentDataset: AppDataset;
  mode?: 'replace' | 'merge';
}): {
  ok: boolean;
  restoredDataset?: AppDataset;
  payload?: FullBackupPayload;
  error?: string;
} {
  const { backup, currentDataset, mode = 'replace' } = params;

  const parsed = parseAndValidateBackup(backup.payloadJson, currentDataset);
  if (!parsed.valid || !parsed.payload) {
    return {
      ok: false,
      error: parsed.error || 'Não foi possível validar o backup da nuvem. Seus dados originais foram preservados.',
    };
  }

  if (parsed.payload.integrityHash && parsed.payload.integrityHash !== backup.integrityHash) {
    return {
      ok: false,
      error: 'Hash de integridade divergente no backup selecionado. Restauração cancelada.',
    };
  }

  const dryRun = validateBackupWithDryRun(parsed.payload);
  if (!dryRun.valid) {
    return {
      ok: false,
      error: dryRun.error || 'Falha no teste de restauração do backup da nuvem.',
    };
  }

  // Always preserve current local state before applying restore
  const safety = captureAndValidateExistingLocalBackup(
    currentDataset,
    mode === 'replace' ? 'replace_import' : 'manual',
    backup.ownerUid
  );
  if (!safety.ok) {
    return {
      ok: false,
      error: safety.error || 'Falha ao salvar cópia de segurança local antes da restauração.',
    };
  }

  const applied = applyBackupDataset(currentDataset, parsed.payload.data, mode);
  return {
    ok: true,
    restoredDataset: applied.next,
    payload: parsed.payload,
  };
}
