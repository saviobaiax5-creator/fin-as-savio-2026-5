import type {
  Account,
  AuditLogEntry,
  Boleto,
  CreditCard,
  Transaction,
} from '../../types';
import { generateEntityId } from '../common/id';
import { addMoney, cents, fromCents, subtractMoney, toCents } from '../money/money';
import { executeInternalTransfer } from '../transactions/TransferService';
import type {
  BankNotificationViewItem,
  NotificationReviewResolution,
} from './notification.types';

export interface NotificationIntegrationResult {
  updatedTransactions?: Transaction[];
  updatedCreditCards?: CreditCard[];
  updatedBoletos?: Boleto[];
  newAuditEntry?: AuditLogEntry;
  confirmedTransactionId?: string;
  confirmedCreditCardId?: string;
  feedbackMessage: string;
}

/**
 * Integrates a user-confirmed bank notification into Sávio Finanças's existing
 * Transaction, CreditCard, Boleto, and TransferService flows without altering
 * BalanceCalculator rules.
 */
export function resolveConfirmedNotificationFinancialEffects(params: {
  item: BankNotificationViewItem;
  resolution: NotificationReviewResolution;
  accounts: readonly Account[];
  creditCards: readonly CreditCard[];
  transactions: readonly Transaction[];
  boletos: readonly Boleto[];
}): NotificationIntegrationResult {
  const { item, resolution, accounts, creditCards, transactions, boletos } = params;

  if (!Number.isSafeInteger(resolution.amountCents) || resolution.amountCents <= 0) {
    throw new Error('O valor informado deve ser maior que zero.');
  }

  // Idempotency guard against duplicate ledger creation
  const existingDuplicateTx = transactions.find(
    (t) =>
      t.status !== 'CANCELLED' &&
      (t.idempotencyKey === item.idempotencyKey ||
        t.idempotencyKey === `${item.idempotencyKey}-out`)
  );
  if (existingDuplicateTx) {
    throw new Error('Esta notificação já foi confirmada e lançada no extrato.');
  }

  // 1. Credit card purchase -> adds directly to CreditCard invoice (does NOT double-debit checking account)
  if (resolution.kind === 'CREDIT_PURCHASE') {
    const card = creditCards.find((c) => c.id === resolution.creditCardId);
    if (!card) {
      throw new Error('Selecione um cartão de crédito válido para registrar a compra.');
    }

    const currentCents = toCents(card.currentInvoiceAmount);
    const nextInvoiceCents = addMoney(currentCents, resolution.amountCents);
    const updatedCreditCards = creditCards.map((c) =>
      c.id === card.id
        ? {
            ...c,
            currentInvoiceAmount: fromCents(nextInvoiceCents),
            status: 'OPEN' as const,
          }
        : c
    );

    return {
      updatedCreditCards,
      confirmedCreditCardId: card.id,
      feedbackMessage: `Compra de R$ ${fromCents(resolution.amountCents).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
      })} somada à fatura do cartão "${card.cardName}".`,
    };
  }

  // 2. Credit card invoice payment -> reduces card invoice + creates single account outflow
  if (resolution.kind === 'INVOICE_PAYMENT') {
    const card = creditCards.find((c) => c.id === resolution.creditCardId);
    const acc = accounts.find((a) => a.id === resolution.accountId && !a.archived);
    if (!card) {
      throw new Error('Selecione o cartão correspondente ao pagamento da fatura.');
    }
    if (!acc) {
      throw new Error('Selecione a conta bancária utilizada para pagar a fatura.');
    }

    const invoiceCents = toCents(card.currentInvoiceAmount);
    const paidAgainstInvoice = cents(Math.min(invoiceCents, resolution.amountCents));
    const remainingCents = subtractMoney(invoiceCents, paidAgainstInvoice);

    const updatedCreditCards = creditCards.map((c) =>
      c.id === card.id
        ? {
            ...c,
            currentInvoiceAmount: fromCents(remainingCents),
            status: (remainingCents === 0 ? 'PAID' : 'OPEN') as CreditCard['status'],
          }
        : c
    );

    const txId = generateEntityId('tr-notif');
    const newTx: Transaction = {
      id: txId,
      entityId: card.entityId,
      accountId: acc.id,
      creditCardId: card.id,
      date: resolution.date,
      description:
        remainingCents === 0
          ? `Pgto Fatura: ${card.cardName}`
          : `Pgto Parcial Fatura: ${card.cardName}`,
      category: 'Cartão',
      account: `${acc.institutionName} · ${acc.accountName}`,
      amountCents: resolution.amountCents,
      amount: fromCents(resolution.amountCents),
      direction: 'EXPENSE',
      status: 'CONFIRMED',
      origin: 'BANK_NOTIFICATION',
      isInternalTransfer: false,
      operationType: 'CARTAO',
      counterparty: card.institutionName,
      externalId: item.payload.referenceCode || undefined,
      idempotencyKey: item.idempotencyKey,
    };

    return {
      updatedCreditCards,
      updatedTransactions: [newTx, ...transactions],
      confirmedTransactionId: txId,
      confirmedCreditCardId: card.id,
      feedbackMessage: `Pagamento de fatura de "${card.cardName}" registrado na conta ${acc.institutionName}.`,
    };
  }

  // 3. Internal transfer -> routes through TransferService (never counts as operational revenue/expense)
  if (resolution.kind === 'INTERNAL_TRANSFER') {
    if (!resolution.destinationAccountId) {
      throw new Error('Selecione a conta de destino para transferência própria.');
    }
    const xferRes = executeInternalTransfer({
      originAccountId: resolution.accountId,
      destinationAccountId: resolution.destinationAccountId,
      amountCents: resolution.amountCents,
      date: resolution.date,
      description: resolution.description,
      accounts,
      existingTransactions: transactions,
      actor: 'Notificação Bancária (Revisada)',
      idempotencyKey: item.idempotencyKey,
    });

    return {
      updatedTransactions: xferRes.updatedTransactions,
      newAuditEntry: xferRes.auditEntry,
      confirmedTransactionId: xferRes.debitTransaction.id,
      feedbackMessage: 'Transferência própria registrada entre as duas contas.',
    };
  }

  // 4. All standard account movements (DEBIT_PURCHASE, PIX_IN, PIX_OUT, BOLETO, FEE, REFUND)
  const acc = accounts.find((a) => a.id === resolution.accountId && !a.archived);
  if (!acc) {
    throw new Error('Selecione uma conta bancária ativa para registrar a movimentação.');
  }

  let updatedBoletos: Boleto[] | undefined;
  if (resolution.kind === 'BOLETO') {
    const matchedBoleto = boletos.find(
      (b) => b.status === 'PENDING' && toCents(b.valorOriginal) === resolution.amountCents
    );
    if (matchedBoleto) {
      updatedBoletos = boletos.map((b) =>
        b.id === matchedBoleto.id
          ? {
              ...b,
              status: 'PAID' as const,
              paidAt: resolution.date,
              paidAmount: fromCents(resolution.amountCents),
              paidAccountId: acc.id,
            }
          : b
      );
    }
  }

  const txId = generateEntityId('tr-notif');
  const newTx: Transaction = {
    id: txId,
    entityId: resolution.entityId,
    accountId: acc.id,
    date: resolution.date,
    description: resolution.description,
    category: resolution.category,
    account: `${acc.institutionName} · ${acc.accountName}`,
    amountCents: resolution.amountCents,
    amount: fromCents(resolution.amountCents),
    direction: resolution.direction,
    status: 'CONFIRMED',
    origin: 'BANK_NOTIFICATION',
    isInternalTransfer: false,
    operationType: resolution.operationType,
    counterparty: resolution.counterparty,
    externalId: item.payload.referenceCode || undefined,
    idempotencyKey: item.idempotencyKey,
  };

  return {
    updatedTransactions: [newTx, ...transactions],
    ...(updatedBoletos ? { updatedBoletos } : {}),
    confirmedTransactionId: txId,
    feedbackMessage: `Lançamento "${resolution.description}" confirmado na conta ${acc.institutionName}.`,
  };
}
