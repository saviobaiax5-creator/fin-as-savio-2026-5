import { Account, AuditLogEntry, Transaction } from '../../types';
import { generateEntityId, generateIdempotencyKey } from '../common/id';
import { MoneyCents, fromCents } from '../money/money';
import { todayLocal } from '../../utils/dateUtils';

export interface InternalTransferParams {
  originAccountId: string;
  destinationAccountId: string;
  amountCents: MoneyCents;
  date?: string;
  description?: string;
  accounts: readonly Account[];
  existingTransactions: readonly Transaction[];
  actor?: string;
  idempotencyKey?: string;
}

export interface InternalTransferResult {
  transferId: string;
  debitTransaction: Transaction;
  creditTransaction: Transaction;
  updatedTransactions: Transaction[];
  auditEntry: AuditLogEntry;
}

export function executeInternalTransfer(
  params: InternalTransferParams
): InternalTransferResult {
  const {
    originAccountId,
    destinationAccountId,
    amountCents,
    accounts,
    existingTransactions,
    actor = 'Usuário local',
  } = params;

  if (!originAccountId || !destinationAccountId) {
    throw new Error('Selecione as contas de origem e destino para a transferência.');
  }

  if (originAccountId === destinationAccountId) {
    throw new Error('A conta de origem e a conta de destino devem ser diferentes.');
  }

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Informe um valor válido maior que zero para transferir.');
  }

  const origin = accounts.find((a) => a.id === originAccountId);
  const destination = accounts.find((a) => a.id === destinationAccountId);

  if (!origin || !destination) {
    throw new Error('Conta de origem ou destino não encontrada.');
  }

  if (origin.archived || destination.archived) {
    throw new Error('Não é possível transferir envolvendo contas arquivadas.');
  }

  const idempotencyKey =
    params.idempotencyKey?.trim() ||
    generateIdempotencyKey(`xfer-${origin.id}-${destination.id}`);

  const duplicate = existingTransactions.some(
    (t) =>
      t.status !== 'CANCELLED' &&
      (t.idempotencyKey === idempotencyKey ||
        t.idempotencyKey === `${idempotencyKey}-out` ||
        t.idempotencyKey === `${idempotencyKey}-in`)
  );

  if (duplicate) {
    throw new Error('Esta transferência já foi processada anteriormente (idempotência).');
  }

  const transferId = generateEntityId('xfer');
  const transferDate = params.date?.trim() || todayLocal();
  const baseDesc =
    params.description?.trim() ||
    `Transferência: ${origin.institutionName} → ${destination.institutionName}`;
  const exactAmount = fromCents(amountCents);
  const nowIso = new Date().toISOString();

  const debitTransaction: Transaction = {
    id: generateEntityId('tr-xfer-out'),
    entityId: origin.entityId,
    accountId: origin.id,
    date: transferDate,
    description: `${baseDesc} (Saída)`,
    category: 'Transferência',
    account: `${origin.institutionName} · ${origin.accountName}`,
    amountCents,
    amount: exactAmount,
    direction: 'EXPENSE',
    status: 'CONFIRMED',
    origin: 'MANUAL',
    isInternalTransfer: true,
    operationType: 'TRANSFERENCIA_PROPRIA',
    counterparty: `${destination.institutionName} · ${destination.accountName}`,
    transferId,
    idempotencyKey: `${idempotencyKey}-out`,
  };

  const creditTransaction: Transaction = {
    id: generateEntityId('tr-xfer-in'),
    entityId: destination.entityId,
    accountId: destination.id,
    date: transferDate,
    description: `${baseDesc} (Entrada)`,
    category: 'Transferência',
    account: `${destination.institutionName} · ${destination.accountName}`,
    amountCents,
    amount: exactAmount,
    direction: 'INCOME',
    status: 'CONFIRMED',
    origin: 'MANUAL',
    isInternalTransfer: true,
    operationType: 'TRANSFERENCIA_PROPRIA',
    counterparty: `${origin.institutionName} · ${origin.accountName}`,
    transferId,
    idempotencyKey: `${idempotencyKey}-in`,
  };

  const updatedTransactions = [creditTransaction, debitTransaction, ...existingTransactions];

  const auditEntry: AuditLogEntry = {
    id: generateEntityId('audit'),
    action: 'TRANSFER_EXECUTED',
    entityType: 'TRANSFER',
    entityId: transferId,
    relatedEntityId: `${debitTransaction.id},${creditTransaction.id}`,
    actor,
    timestamp: nowIso,
    reason: baseDesc,
    amountCents,
    previousState: {
      originAccountId: origin.id,
      destinationAccountId: destination.id,
    },
    nextState: {
      transferId,
      debitTransactionId: debitTransaction.id,
      creditTransactionId: creditTransaction.id,
      amountCents,
      date: transferDate,
    },
  };

  return {
    transferId,
    debitTransaction,
    creditTransaction,
    updatedTransactions,
    auditEntry,
  };
}
