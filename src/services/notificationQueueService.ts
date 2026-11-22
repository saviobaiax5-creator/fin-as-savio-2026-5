import type { CategoryRule, Transaction } from '../types';
import { generateEntityId } from '../domain/common/id';
import { db } from './indexedDb';
import { STORAGE_KEYS, loadJsonWithRecovery, saveJsonSafe } from './storage';
import {
  decryptNotificationPayload,
  destroyNotificationQueueKey,
  encryptNotificationPayload,
  minimizeAndMaskNotificationText,
} from '../core/security/notificationCrypto';
import {
  DEFAULT_AUTHORIZED_PACKAGES,
  isValidAndroidPackageId,
} from '../domain/notifications/bankRegistry';
import { parseBankNotification } from '../domain/notifications/notification.parser';
import { classifyBankNotification } from '../domain/notifications/notification.classifier';
import { evaluateNotificationDuplication } from '../domain/notifications/notification.deduplicator';
import type {
  BankNotificationSensitivePayload,
  BankNotificationStatus,
  BankNotificationViewItem,
  NotificationCaptureSettings,
  RawNotificationEvent,
  StoredBankNotificationRecord,
} from '../domain/notifications/notification.types';
import { financeNotificationBridge } from '../capacitor/financeNotificationPlugin';

const MS_PER_DAY = 86_400_000;
const MAX_QUEUE_SIZE = 500;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationCaptureSettings = {
  consentGranted: false,
  consentUpdatedAt: null,
  authorizedPackages: [...DEFAULT_AUTHORIZED_PACKAGES],
  retentionDays: 30,
  maskSensitivePreview: true,
  autoSyncOnResume: true,
};

export function loadNotificationSettings(): NotificationCaptureSettings {
  const res = loadJsonWithRecovery<NotificationCaptureSettings>(
    STORAGE_KEYS.notificationSettings,
    DEFAULT_NOTIFICATION_SETTINGS,
    (val) => Boolean(val && typeof val === 'object')
  );
  const data = res.data;
  const retentionDays =
    data.retentionDays === 7 ||
    data.retentionDays === 30 ||
    data.retentionDays === 60 ||
    data.retentionDays === 90
      ? data.retentionDays
      : 30;
  const authorizedPackages = Array.isArray(data.authorizedPackages)
    ? data.authorizedPackages.filter((p) => typeof p === 'string' && isValidAndroidPackageId(p))
    : [...DEFAULT_AUTHORIZED_PACKAGES];

  return {
    consentGranted: Boolean(data.consentGranted),
    consentUpdatedAt: typeof data.consentUpdatedAt === 'string' ? data.consentUpdatedAt : null,
    authorizedPackages,
    retentionDays,
    maskSensitivePreview: data.maskSensitivePreview !== false,
    autoSyncOnResume: data.autoSyncOnResume !== false,
  };
}

export async function saveNotificationSettings(
  next: NotificationCaptureSettings
): Promise<NotificationCaptureSettings> {
  const cleanPackages = Array.from(
    new Set(next.authorizedPackages.map((p) => p.trim()).filter(isValidAndroidPackageId))
  );
  const normalized: NotificationCaptureSettings = {
    ...next,
    authorizedPackages: cleanPackages,
  };
  saveJsonSafe(STORAGE_KEYS.notificationSettings, normalized);

  await financeNotificationBridge.syncNativeConsentAndPackages({
    consentGranted: normalized.consentGranted,
    authorizedPackages: normalized.authorizedPackages,
  });

  return normalized;
}

export async function listNotificationInboxItems(): Promise<BankNotificationViewItem[]> {
  if (!db) return [];
  try {
    const records = await db.bankNotificationEvents.orderBy('receivedAt').reverse().toArray();
    const items: BankNotificationViewItem[] = [];

    for (const rec of records) {
      const payload = await decryptNotificationPayload({
        ivB64: rec.encryptedIvB64,
        cipherB64: rec.encryptedCipherB64,
        mode: rec.encryptionMode,
      });

      if (!payload) continue;

      items.push({
        id: rec.id,
        sourceEventKey: rec.sourceEventKey,
        idempotencyKey: rec.idempotencyKey,
        fingerprintHash: rec.fingerprintHash,
        packageName: rec.packageName,
        receivedAt: rec.receivedAt,
        status: rec.status,
        retentionExpiresAt: rec.retentionExpiresAt,
        confirmedTransactionId: rec.confirmedTransactionId,
        confirmedCreditCardId: rec.confirmedCreditCardId,
        confirmedAt: rec.confirmedAt,
        discardedAt: rec.discardedAt,
        discardReason: rec.discardReason,
        payload,
      });
    }

    return items;
  } catch {
    return [];
  }
}

export interface IngestBatchResult {
  addedCount: number;
  skippedDuplicateCount: number;
  skippedUnauthorizedCount: number;
  acknowledgedNativeIds: string[];
}

/**
 * Ingests raw notification events through deterministic parser, classifier, deduplicator,
 * and stores encrypted payloads in Dexie as PENDING for human review.
 * Never creates financial transactions automatically without confirmation.
 */
export async function ingestRawNotificationEvents(params: {
  events: RawNotificationEvent[];
  settings: NotificationCaptureSettings;
  existingTransactions: readonly Transaction[];
  customRules?: CategoryRule[];
}): Promise<IngestBatchResult> {
  const { events, settings, existingTransactions, customRules = [] } = params;

  const activeDb = db;
  if (!activeDb || !settings.consentGranted || events.length === 0) {
    return {
      addedCount: 0,
      skippedDuplicateCount: 0,
      skippedUnauthorizedCount: events.length,
      acknowledgedNativeIds: [],
    };
  }

  const allowedSet = new Set(settings.authorizedPackages.map((p) => p.toLowerCase()));
  const existingRecords = await activeDb.bankNotificationEvents.toArray();
  const existingViewItems = await listNotificationInboxItems();
  const retentionMs = settings.retentionDays * MS_PER_DAY;

  const workingQueue: StoredBankNotificationRecord[] = [...existingRecords];
  const workingViews: BankNotificationViewItem[] = [...existingViewItems];
  const toInsert: StoredBankNotificationRecord[] = [];
  const acknowledgedNativeIds: string[] = [];

  let skippedDuplicateCount = 0;
  let skippedUnauthorizedCount = 0;

  for (const ev of events) {
    // Reject unauthorized package sources strictly
    const pkgLower = (ev.packageName || '').trim().toLowerCase();
    if (!isValidAndroidPackageId(pkgLower) || !allowedSet.has(pkgLower)) {
      skippedUnauthorizedCount += 1;
      acknowledgedNativeIds.push(ev.eventId);
      continue;
    }

    const parsed = parseBankNotification(ev);
    const classified = classifyBankNotification(ev, parsed, customRules);

    const dedup = evaluateNotificationDuplication({
      event: ev,
      parsed,
      classified,
      existingQueue: workingQueue,
      existingViewItems: workingViews,
      existingTransactions,
    });

    if (dedup.isDuplicate) {
      skippedDuplicateCount += 1;
      acknowledgedNativeIds.push(ev.eventId);
      continue;
    }

    const sensitivePayload: BankNotificationSensitivePayload = {
      title: minimizeAndMaskNotificationText(ev.title, 90),
      sanitizedExcerpt: parsed.sanitizedSummary,
      institutionName: parsed.institutionName,
      merchantOrCounterparty: parsed.merchantOrCounterparty,
      cardLast4: parsed.cardLast4,
      referenceCode: parsed.referenceCode,
      installmentLabel: parsed.installmentLabel,
      amountCents: parsed.amountCents,
      occurredDate: parsed.occurredDate,
      dateSource: parsed.dateSource,
      kind: classified.kind,
      direction: classified.direction,
      operationType: classified.operationType,
      suggestedCategory: classified.suggestedCategory,
      isInternalTransfer: classified.isInternalTransfer,
      isDeclined: parsed.isDeclined,
      isHiddenContent: parsed.isHiddenContent,
      parseConfidence: parsed.parseConfidence,
      warnings: parsed.warnings,
      classificationReason: classified.classificationReason,
    };

    const encrypted = await encryptNotificationPayload(sensitivePayload);
    const receivedAt = Number.isFinite(ev.receivedAt) ? ev.receivedAt : Date.now();

    const record: StoredBankNotificationRecord = {
      id: generateEntityId('notif'),
      sourceEventKey: ev.sourceEventKey || ev.eventId,
      idempotencyKey: dedup.idempotencyKey,
      fingerprintHash: dedup.fingerprintHash,
      packageName: pkgLower,
      receivedAt,
      occurredDate: parsed.occurredDate,
      amountCents: parsed.amountCents,
      kind: classified.kind,
      status: 'PENDING',
      retentionExpiresAt: receivedAt + retentionMs,
      encryptedIvB64: encrypted.ivB64,
      encryptedCipherB64: encrypted.cipherB64,
      encryptionMode: encrypted.mode,
    };

    workingQueue.push(record);
    workingViews.push({
      id: record.id,
      sourceEventKey: record.sourceEventKey,
      idempotencyKey: record.idempotencyKey,
      fingerprintHash: record.fingerprintHash,
      packageName: record.packageName,
      receivedAt: record.receivedAt,
      status: record.status,
      retentionExpiresAt: record.retentionExpiresAt,
      payload: sensitivePayload,
    });
    toInsert.push(record);
    acknowledgedNativeIds.push(ev.eventId);
  }

  if (toInsert.length > 0) {
    await activeDb.transaction('rw', activeDb.bankNotificationEvents, async () => {
      await activeDb.bankNotificationEvents.bulkPut(toInsert);

      // Keep queue bounded cleanly under MAX_QUEUE_SIZE by removing oldest DISCARDED/CONFIRMED first
      const totalCount = await activeDb.bankNotificationEvents.count();
      if (totalCount > MAX_QUEUE_SIZE) {
        const overflow = totalCount - MAX_QUEUE_SIZE;
        const removable = await activeDb.bankNotificationEvents
          .where('status')
          .anyOf(['DISCARDED', 'CONFIRMED'])
          .sortBy('receivedAt');
        const deleteIds = removable.slice(0, overflow).map((r) => r.id);
        if (deleteIds.length > 0) {
          await activeDb.bankNotificationEvents.bulkDelete(deleteIds);
        }
      }
    });
  }

  return {
    addedCount: toInsert.length,
    skippedDuplicateCount,
    skippedUnauthorizedCount,
    acknowledgedNativeIds,
  };
}

export async function syncPendingEventsFromAndroid(params: {
  settings: NotificationCaptureSettings;
  existingTransactions: readonly Transaction[];
  customRules?: CategoryRule[];
}): Promise<IngestBatchResult> {
  if (!params.settings.consentGranted) {
    return {
      addedCount: 0,
      skippedDuplicateCount: 0,
      skippedUnauthorizedCount: 0,
      acknowledgedNativeIds: [],
    };
  }

  const rawEvents = await financeNotificationBridge.getPendingEvents();
  if (rawEvents.length === 0) {
    return {
      addedCount: 0,
      skippedDuplicateCount: 0,
      skippedUnauthorizedCount: 0,
      acknowledgedNativeIds: [],
    };
  }

  const res = await ingestRawNotificationEvents({
    events: rawEvents,
    settings: params.settings,
    existingTransactions: params.existingTransactions,
    customRules: params.customRules,
  });

  if (res.acknowledgedNativeIds.length > 0) {
    await financeNotificationBridge.acknowledgeEvents(res.acknowledgedNativeIds);
  }

  return res;
}

export async function updateNotificationStatus(params: {
  id: string;
  status: BankNotificationStatus;
  confirmedTransactionId?: string;
  confirmedCreditCardId?: string;
  discardReason?: string;
}): Promise<void> {
  if (!db) return;
  const nowIso = new Date().toISOString();
  await db.bankNotificationEvents.update(params.id, {
    status: params.status,
    ...(params.status === 'CONFIRMED'
      ? {
          confirmedAt: nowIso,
          confirmedTransactionId: params.confirmedTransactionId,
          confirmedCreditCardId: params.confirmedCreditCardId,
        }
      : {}),
    ...(params.status === 'DISCARDED'
      ? {
          discardedAt: nowIso,
          discardReason: params.discardReason || 'Descartada pelo usuário na revisão',
        }
      : {}),
  });
}

export async function purgeExpiredNotifications(nowMs = Date.now()): Promise<number> {
  if (!db) return 0;
  try {
    const expired = await db.bankNotificationEvents
      .where('retentionExpiresAt')
      .below(nowMs)
      .toArray();
    if (expired.length === 0) return 0;
    await db.bankNotificationEvents.bulkDelete(expired.map((e) => e.id));
    return expired.length;
  } catch {
    return 0;
  }
}

export async function purgeDiscardedNotifications(): Promise<number> {
  if (!db) return 0;
  try {
    const discarded = await db.bankNotificationEvents
      .where('status')
      .equals('DISCARDED')
      .toArray();
    if (discarded.length === 0) return 0;
    await db.bankNotificationEvents.bulkDelete(discarded.map((e) => e.id));
    return discarded.length;
  } catch {
    return 0;
  }
}

/**
 * Revokes authorization, clears native Android queue, wipes Dexie encrypted queue,
 * and destroys the dedicated AES-GCM notification key.
 */
export async function revokeConsentAndPurgeAllNotifications(): Promise<NotificationCaptureSettings> {
  const revoked: NotificationCaptureSettings = {
    ...loadNotificationSettings(),
    consentGranted: false,
    consentUpdatedAt: new Date().toISOString(),
  };

  saveJsonSafe(STORAGE_KEYS.notificationSettings, revoked);

  await financeNotificationBridge.syncNativeConsentAndPackages({
    consentGranted: false,
    authorizedPackages: [],
  });
  await financeNotificationBridge.clearNativeQueue();

  if (db) {
    try {
      await db.bankNotificationEvents.clear();
    } catch {
      // ignore clear failure
    }
  }
  await destroyNotificationQueueKey();

  return revoked;
}
