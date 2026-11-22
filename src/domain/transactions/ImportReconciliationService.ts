import type { Transaction } from '../../types';
import { generateEntityId } from '../common/id';
import { fromCents, getTransactionAmountCents } from '../money/money';
import { normalizeDescription } from '../../utils/financeCalculations';
import { parseLocalDate } from '../../utils/dateUtils';

export interface ReconciledMatch {
  pendingTransaction: Transaction;
  incomingItem: Omit<Transaction, 'id'>;
}

export interface ReconcileImportResult {
  accepted: Transaction[];
  reconciledTransactions: Transaction[];
  reconciledMatches: ReconciledMatch[];
  skippedDuplicatesCount: number;
  skippedItems: Omit<Transaction, 'id'>[];
}

export function daysBetweenLocalDates(dateA: string, dateB: string): number {
  const d1 = parseLocalDate(dateA);
  const d2 = parseLocalDate(dateB);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round(Math.abs(d1.getTime() - d2.getTime()) / 86_400_000);
}

export function findMatchingScheduledTransaction(
  incoming: {
    date: string;
    amount: number;
    amountCents?: Transaction['amountCents'];
    accountId: string;
    direction: Transaction['direction'];
    isInternalTransfer?: boolean;
  },
  existingTransactions: Transaction[],
  consumedIds?: Set<string>
): Transaction | undefined {
  const incomingCents = getTransactionAmountCents(incoming);
  const incomingInternal = Boolean(incoming.isInternalTransfer);

  return existingTransactions.find((tx) => {
    if (consumedIds?.has(tx.id)) return false;
    if (tx.status !== 'PENDING' && tx.status !== 'PLANNED') return false;
    if (Boolean(tx.isInternalTransfer) !== incomingInternal) return false;
    if (tx.accountId !== incoming.accountId) return false;
    if (tx.direction !== incoming.direction) return false;
    if (getTransactionAmountCents(tx) !== incomingCents) return false;
    return daysBetweenLocalDates(tx.date, incoming.date) <= 5;
  });
}

export function buildImportFingerprint(item: {
  date: string;
  amount: number;
  amountCents?: Transaction['amountCents'];
  accountId: string;
  direction: Transaction['direction'];
  description: string;
  externalId?: string;
}): string {
  const amountCents = getTransactionAmountCents(item);
  const extClean = (item.externalId || '').trim().toLowerCase();
  if (extClean) {
    return `ext:${item.accountId}|${extClean}`;
  }
  const descClean = normalizeDescription(item.description || '');
  return `fp:${item.date}|${amountCents}|${item.accountId}|${item.direction}|${descClean}`;
}

export function buildImportIdempotencyKey(item: {
  date: string;
  amount: number;
  amountCents?: Transaction['amountCents'];
  accountId: string;
  direction: Transaction['direction'];
  description: string;
  externalId?: string;
  idempotencyKey?: string;
}): string {
  if (item.idempotencyKey && item.idempotencyKey.trim()) {
    return item.idempotencyKey.trim();
  }
  return `imp:${buildImportFingerprint(item)}`;
}

export function reconcileImportBatch(
  incomingItems: Omit<Transaction, 'id'>[],
  existingTransactions: Transaction[]
): ReconcileImportResult {
  const activeExisting = existingTransactions.filter((t) => t.status !== 'CANCELLED');

  const seenIdempotencyKeys = new Set<string>();
  const seenExternalIds = new Set<string>();
  const seenFingerprints = new Set<string>();

  for (const existing of activeExisting) {
    if (existing.idempotencyKey) {
      seenIdempotencyKeys.add(existing.idempotencyKey.trim());
    }
    if (existing.externalId && existing.externalId.trim()) {
      seenExternalIds.add(existing.externalId.trim().toLowerCase());
    }
    // Confirmed entries block identical duplicate imports
    if (existing.status === 'CONFIRMED') {
      seenFingerprints.add(buildImportFingerprint(existing));
    }
  }

  const accepted: Transaction[] = [];
  const reconciledTransactions: Transaction[] = [];
  const reconciledMatches: ReconciledMatch[] = [];
  const skippedItems: Omit<Transaction, 'id'>[] = [];
  const consumedPendingIds = new Set<string>();

  for (const rawItem of incomingItems) {
    const amountCents = getTransactionAmountCents(rawItem);
    const idempotencyKey = buildImportIdempotencyKey({
      ...rawItem,
      amountCents,
      amount: fromCents(amountCents),
    });
    const extClean = (rawItem.externalId || '').trim().toLowerCase();
    const fingerprint = buildImportFingerprint({
      ...rawItem,
      amountCents,
      amount: fromCents(amountCents),
    });

    // Check if an identical confirmed entry or batch duplicate already exists
    const isConfirmedDuplicate =
      (extClean && seenExternalIds.has(extClean)) ||
      seenFingerprints.has(fingerprint) ||
      (seenIdempotencyKeys.has(idempotencyKey) &&
        !activeExisting.some(
          (t) =>
            (t.status === 'PENDING' || t.status === 'PLANNED') &&
            t.idempotencyKey === idempotencyKey
        ));

    if (isConfirmedDuplicate) {
      skippedItems.push(rawItem);
      continue;
    }

    // Check if this statement line settles an existing PENDING or PLANNED transaction
    const matchedPending = findMatchingScheduledTransaction(
      rawItem,
      activeExisting,
      consumedPendingIds
    );

    if (matchedPending) {
      consumedPendingIds.add(matchedPending.id);
      seenIdempotencyKeys.add(idempotencyKey);
      if (extClean) seenExternalIds.add(extClean);
      seenFingerprints.add(fingerprint);

      const settled: Transaction = {
        ...matchedPending,
        status: 'CONFIRMED',
        date: rawItem.date,
        amountCents,
        amount: fromCents(amountCents),
        externalId: rawItem.externalId || matchedPending.externalId,
        idempotencyKey,
      };
      reconciledTransactions.push(settled);
      reconciledMatches.push({
        pendingTransaction: matchedPending,
        incomingItem: rawItem,
      });
      continue;
    }

    seenIdempotencyKeys.add(idempotencyKey);
    if (extClean) seenExternalIds.add(extClean);
    seenFingerprints.add(fingerprint);

    accepted.push({
      ...rawItem,
      id: generateEntityId('tr-imp'),
      amountCents,
      amount: fromCents(amountCents),
      idempotencyKey,
    });
  }

  return {
    accepted,
    reconciledTransactions,
    reconciledMatches,
    skippedDuplicatesCount: skippedItems.length,
    skippedItems,
  };
}
