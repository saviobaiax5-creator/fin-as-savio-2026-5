import type { Transaction } from '../../types';
import { getTransactionAmountCents } from '../money/money';
import { normalizeDescription } from '../../utils/financeCalculations';
import type {
  BankNotificationViewItem,
  ClassifiedNotificationData,
  NotificationKind,
  ParsedNotificationData,
  RawNotificationEvent,
  StoredBankNotificationRecord,
} from './notification.types';

const CONTEXTUAL_DUPLICATE_WINDOW_MS = 90_000; // 90s re-broadcast / notification update window

export interface DeduplicationResult {
  isDuplicate: boolean;
  reason?: string;
  matchedRecordId?: string;
  matchedTransactionId?: string;
  idempotencyKey: string;
  fingerprintHash: string;
}

function stableShortHash(input: string): string {
  // Deterministic FNV-1a 32-bit hash in hex (safe, non-crypto fingerprint for deduplication)
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildNotificationFingerprint(params: {
  packageName: string;
  kind: NotificationKind;
  amountCents: number | null;
  occurredDate: string;
  merchantOrCounterparty: string | null;
  referenceCode: string | null;
}): string {
  if (params.referenceCode) {
    return `ref:${stableShortHash(`${params.packageName.toLowerCase()}|${params.referenceCode.toLowerCase()}`)}`;
  }
  const merchantNorm = normalizeDescription(params.merchantOrCounterparty || '');
  const raw = [
    params.packageName.toLowerCase(),
    params.kind,
    params.amountCents ?? 'none',
    params.occurredDate,
    merchantNorm,
  ].join('|');
  return `fp:${stableShortHash(raw)}`;
}

export function buildNotificationIdempotencyKey(params: {
  sourceEventKey: string;
  packageName: string;
  receivedAt: number;
  fingerprintHash: string;
}): string {
  // Bucket timestamp in 60s slots only when sourceEventKey is missing; prefer sourceEventKey
  const cleanSource = params.sourceEventKey.trim();
  if (cleanSource) {
    return `notif:${stableShortHash(`${params.packageName}|${cleanSource}`)}`;
  }
  const minuteBucket = Math.floor(params.receivedAt / 60_000);
  return `notif:${params.fingerprintHash}:${minuteBucket}`;
}

/**
 * Multi-layer notification deduplicator:
 * 1. Exact origin event key (`sourceEventKey`) or idempotency key match.
 * 2. Contextual match against queued notifications ONLY within tight 90s rebroadcast window
 *    with same package, kind, amount, and counterparty (or matching referenceCode).
 *    NEVER discards legitimate purchases of the same amount occurring at different times!
 * 3. Checks existing confirmed ledger transactions when referenceCode matches externalId.
 */
export function evaluateNotificationDuplication(params: {
  event: RawNotificationEvent;
  parsed: ParsedNotificationData;
  classified: ClassifiedNotificationData;
  existingQueue: readonly Pick<
    StoredBankNotificationRecord,
    'id' | 'sourceEventKey' | 'idempotencyKey' | 'fingerprintHash' | 'packageName' | 'receivedAt' | 'amountCents' | 'kind' | 'status'
  >[];
  existingViewItems?: readonly BankNotificationViewItem[];
  existingTransactions: readonly Transaction[];
}): DeduplicationResult {
  const { event, parsed, classified, existingQueue, existingViewItems = [], existingTransactions } = params;

  const fingerprintHash = buildNotificationFingerprint({
    packageName: event.packageName,
    kind: classified.kind,
    amountCents: parsed.amountCents,
    occurredDate: parsed.occurredDate,
    merchantOrCounterparty: parsed.merchantOrCounterparty,
    referenceCode: parsed.referenceCode,
  });

  const idempotencyKey = buildNotificationIdempotencyKey({
    sourceEventKey: event.sourceEventKey,
    packageName: event.packageName,
    receivedAt: event.receivedAt,
    fingerprintHash,
  });

  // Layer 1: Exact origin sourceEventKey or idempotencyKey in queue
  const exactQueueMatch = existingQueue.find(
    (q) =>
      (event.sourceEventKey && q.sourceEventKey === event.sourceEventKey) ||
      q.idempotencyKey === idempotencyKey
  );
  if (exactQueueMatch) {
    return {
      isDuplicate: true,
      reason: 'Notificação com o mesmo identificador de origem já registrada na fila.',
      matchedRecordId: exactQueueMatch.id,
      idempotencyKey,
      fingerprintHash,
    };
  }

  // Layer 2: Explicit reference code (Pix E2E / NSU) already confirmed in ledger or queue
  if (parsed.referenceCode) {
    const refLower = parsed.referenceCode.trim().toLowerCase();
    const txRefMatch = existingTransactions.find(
      (t) =>
        t.status !== 'CANCELLED' &&
        Boolean(t.externalId) &&
        t.externalId!.trim().toLowerCase() === refLower
    );
    if (txRefMatch) {
      return {
        isDuplicate: true,
        reason: 'Código de autenticação/E2E já conciliado no extrato financeiro.',
        matchedTransactionId: txRefMatch.id,
        idempotencyKey,
        fingerprintHash,
      };
    }

    const viewRefMatch = existingViewItems.find(
      (v) =>
        v.payload.referenceCode &&
        v.payload.referenceCode.trim().toLowerCase() === refLower
    );
    if (viewRefMatch) {
      return {
        isDuplicate: true,
        reason: 'Notificação com o mesmo código de referência já recebida.',
        matchedRecordId: viewRefMatch.id,
        idempotencyKey,
        fingerprintHash,
      };
    }
  }

  // Layer 3: Contextual rebroadcast detection within tight 90s window
  // Distinct purchases with identical amounts made >90s apart are PRESERVED!
  const contextualMatch = existingQueue.find((q) => {
    if (q.packageName.toLowerCase() !== event.packageName.toLowerCase()) return false;
    if (q.kind !== classified.kind) return false;
    if (q.amountCents !== parsed.amountCents) return false;
    if (q.fingerprintHash !== fingerprintHash) return false;
    const deltaMs = Math.abs(q.receivedAt - event.receivedAt);
    return deltaMs <= CONTEXTUAL_DUPLICATE_WINDOW_MS;
  });

  if (contextualMatch) {
    return {
      isDuplicate: true,
      reason: 'Notificação repetida recebida em menos de 90 segundos com mesmo valor e estabelecimento.',
      matchedRecordId: contextualMatch.id,
      idempotencyKey,
      fingerprintHash,
    };
  }

  // Also flag soft warning if ledger already has an identical confirmed transaction on same date + amount + counterparty
  // (Only mark duplicate automatically if idempotencyKey matches existing transaction)
  const txIdemMatch = existingTransactions.find(
    (t) =>
      t.status !== 'CANCELLED' &&
      (t.idempotencyKey === idempotencyKey ||
        (parsed.amountCents !== null &&
          t.date === parsed.occurredDate &&
          getTransactionAmountCents(t) === parsed.amountCents &&
          Boolean(parsed.merchantOrCounterparty) &&
          normalizeDescription(t.counterparty || t.description).includes(
            normalizeDescription(parsed.merchantOrCounterparty || '')
          ) &&
          t.origin === 'BANK_NOTIFICATION'))
  );

  if (txIdemMatch) {
    return {
      isDuplicate: true,
      reason: 'Movimentação equivalente já confirmada anteriormente a partir de notificação.',
      matchedTransactionId: txIdemMatch.id,
      idempotencyKey,
      fingerprintHash,
    };
  }

  return {
    isDuplicate: false,
    idempotencyKey,
    fingerprintHash,
  };
}
