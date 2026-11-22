import { AuditLogEntry, Transaction, TransactionReversalRecord } from '../../types';
import { generateEntityId, generateIdempotencyKey } from '../common/id';
import { getTransactionAmountCents, fromCents } from '../money/money';
import { todayLocal } from '../../utils/dateUtils';

export interface ReverseTransactionParams {
  transaction: Transaction;
  existingTransactions: readonly Transaction[];
  reason: string;
  actor?: string;
  reversalDate?: string;
  idempotencyKey?: string;
}

export interface ReverseTransactionResult {
  updatedTransactions: Transaction[];
  reversalTransaction: Transaction;
  reversalRecord: TransactionReversalRecord;
  auditEntry: AuditLogEntry;
}

export interface CancelUnconfirmedParams {
  transaction: Transaction;
  existingTransactions: readonly Transaction[];
  reason: string;
  actor?: string;
}

export interface CancelUnconfirmedResult {
  updatedTransactions: Transaction[];
  cancelledTransaction: Transaction;
  auditEntry: AuditLogEntry;
}

export function reverseConfirmedTransaction(
  params: ReverseTransactionParams
): ReverseTransactionResult {
  const { transaction, existingTransactions, reason, actor = 'Usuário local' } = params;
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    throw new Error('Informe o motivo do estorno para preservar a trilha de auditoria.');
  }

  if (transaction.status !== 'CONFIRMED') {
    throw new Error('Apenas lançamentos confirmados exigem estorno contábil.');
  }

  if (transaction.reversedTransactionId) {
    throw new Error('Este registro já é um estorno de outro lançamento.');
  }

  const alreadyReversed =
    Boolean(transaction.reversalTransactionId) ||
    existingTransactions.some(
      (t) => t.reversedTransactionId === transaction.id && t.status === 'CONFIRMED'
    );

  if (alreadyReversed) {
    throw new Error('Este lançamento já foi estornado anteriormente.');
  }

  const amountCents = getTransactionAmountCents(transaction);
  const reversalId = generateEntityId('tr-rev');
  const nowIso = new Date().toISOString();
  const reversalDate = params.reversalDate || todayLocal();
  const idempotencyKey =
    params.idempotencyKey || generateIdempotencyKey(`rev-${transaction.id}`);

  const reversalTransaction: Transaction = {
    id: reversalId,
    entityId: transaction.entityId,
    accountId: transaction.accountId,
    date: reversalDate,
    description: `Estorno: ${transaction.description}`,
    category: transaction.category,
    account: transaction.account,
    amountCents,
    amount: fromCents(amountCents),
    direction: transaction.direction === 'INCOME' ? 'EXPENSE' : 'INCOME',
    status: 'CONFIRMED',
    origin: transaction.origin,
    isInternalTransfer: transaction.isInternalTransfer,
    operationType: transaction.operationType,
    counterparty: transaction.counterparty,
    transferId: transaction.transferId,
    idempotencyKey,
    reversedTransactionId: transaction.id,
  };

  const updatedTransactions = [
    reversalTransaction,
    ...existingTransactions.map((t) =>
      t.id === transaction.id
        ? {
            ...t,
            amountCents: getTransactionAmountCents(t),
            reversalTransactionId: reversalId,
          }
        : t
    ),
  ];

  const reversalRecord: TransactionReversalRecord = {
    id: generateEntityId('rev'),
    originalTransactionId: transaction.id,
    reversalTransactionId: reversalId,
    actor,
    timestamp: nowIso,
    reason: trimmedReason,
    amountCents,
  };

  const auditEntry: AuditLogEntry = {
    id: generateEntityId('audit'),
    action: 'TRANSACTION_REVERSED',
    entityType: 'TRANSACTION',
    entityId: transaction.id,
    relatedEntityId: reversalId,
    actor,
    timestamp: nowIso,
    reason: trimmedReason,
    amountCents,
    previousState: {
      id: transaction.id,
      status: transaction.status,
      direction: transaction.direction,
      amountCents,
      reversalTransactionId: transaction.reversalTransactionId ?? null,
    },
    nextState: {
      id: transaction.id,
      status: transaction.status,
      reversalTransactionId: reversalId,
      reversalDirection: reversalTransaction.direction,
      amountCents,
    },
  };

  return {
    updatedTransactions,
    reversalTransaction,
    reversalRecord,
    auditEntry,
  };
}

export function cancelUnconfirmedTransaction(
  params: CancelUnconfirmedParams
): CancelUnconfirmedResult {
  const { transaction, existingTransactions, reason, actor = 'Usuário local' } = params;

  if (transaction.status === 'CONFIRMED') {
    throw new Error('Lançamentos confirmados não podem ser cancelados; utilize estorno auditável.');
  }

  if (transaction.status === 'CANCELLED') {
    throw new Error('Este lançamento já está cancelado.');
  }

  const nowIso = new Date().toISOString();
  const amountCents = getTransactionAmountCents(transaction);
  const cleanReason = reason.trim() || 'Cancelamento de lançamento não efetivado';

  const cancelledTransaction: Transaction = {
    ...transaction,
    amountCents,
    status: 'CANCELLED',
    cancelledAt: nowIso,
    cancellationReason: cleanReason,
  };

  const updatedTransactions = existingTransactions.map((t) =>
    t.id === transaction.id ? cancelledTransaction : t
  );

  const auditEntry: AuditLogEntry = {
    id: generateEntityId('audit'),
    action: 'TRANSACTION_CANCELLED',
    entityType: 'TRANSACTION',
    entityId: transaction.id,
    actor,
    timestamp: nowIso,
    reason: cleanReason,
    amountCents,
    previousState: {
      id: transaction.id,
      status: transaction.status,
      amountCents,
    },
    nextState: {
      id: transaction.id,
      status: 'CANCELLED',
      cancelledAt: nowIso,
      amountCents,
    },
  };

  return {
    updatedTransactions,
    cancelledTransaction,
    auditEntry,
  };
}

export interface RestoreCancelledParams {
  transaction: Transaction;
  existingTransactions: readonly Transaction[];
  reason?: string;
  actor?: string;
  targetStatus?: 'PENDING' | 'PLANNED';
}

export interface RestoreCancelledResult {
  updatedTransactions: Transaction[];
  restoredTransaction: Transaction;
  auditEntry: AuditLogEntry;
}

export function restoreCancelledTransaction(
  params: RestoreCancelledParams
): RestoreCancelledResult {
  const {
    transaction,
    existingTransactions,
    reason = 'Restauração de lançamento cancelado',
    actor = 'Usuário local',
    targetStatus = 'PENDING',
  } = params;

  if (transaction.status !== 'CANCELLED') {
    throw new Error('Apenas lançamentos cancelados podem ser restaurados.');
  }

  const nowIso = new Date().toISOString();
  const amountCents = getTransactionAmountCents(transaction);
  const cleanReason = reason.trim() || 'Restauração solicitada pelo usuário';

  const restoredTransaction: Transaction = {
    ...transaction,
    amountCents,
    status: targetStatus,
    cancelledAt: undefined,
    cancellationReason: undefined,
  };

  const updatedTransactions = existingTransactions.map((t) =>
    t.id === transaction.id ? restoredTransaction : t
  );

  const auditEntry: AuditLogEntry = {
    id: generateEntityId('audit'),
    action: 'TRANSACTION_RESTORED',
    entityType: 'TRANSACTION',
    entityId: transaction.id,
    actor,
    timestamp: nowIso,
    reason: cleanReason,
    amountCents,
    previousState: {
      id: transaction.id,
      status: 'CANCELLED',
      cancelledAt: transaction.cancelledAt ?? null,
      amountCents,
    },
    nextState: {
      id: transaction.id,
      status: targetStatus,
      amountCents,
    },
  };

  return {
    updatedTransactions,
    restoredTransaction,
    auditEntry,
  };
}
