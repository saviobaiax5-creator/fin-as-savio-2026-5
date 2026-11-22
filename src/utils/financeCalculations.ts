import { Transaction, Account, OperationType } from '../types';
import {
  MoneyCents,
  ZERO_CENTS,
  cents,
  fromCents as fromMoneyCents,
  getTransactionAmountCents,
  parseSignedMoneyInput,
  toCents as toMoneyCents,
} from '../domain/money/money';
import {
  calculateConfirmedExpenseCents,
  calculateConfirmedIncomeCents,
  calculateConsolidatedPatrimonyCents,
  calculateFinancialBalances,
  calculatePeriodMetricsCents,
  calculateProjectedBalanceCents,
  calculateRealizedBalanceCents,
  deriveAccountBalances,
} from '../domain/accounts/BalanceCalculator';

export {
  calculateConfirmedExpenseCents,
  calculateConfirmedIncomeCents,
  calculateConsolidatedPatrimonyCents,
  calculateFinancialBalances,
  calculatePeriodMetricsCents,
  calculateProjectedBalanceCents,
  calculateRealizedBalanceCents,
  getTransactionAmountCents,
};

export function toCents(amount: number): MoneyCents {
  if (!Number.isFinite(amount)) return ZERO_CENTS;
  return toMoneyCents(amount);
}

export function fromCents(valueCents: number): number {
  if (!Number.isFinite(valueCents)) return 0;
  return fromMoneyCents(cents(Math.round(valueCents)));
}

export function parseCurrencyInput(raw: string): number {
  try {
    const parsedCents = parseSignedMoneyInput(raw);
    return fromMoneyCents(parsedCents);
  } catch {
    return NaN;
  }
}

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function calculateAccountBalances(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  return deriveAccountBalances(accounts, transactions);
}

export function filterTransactionsByPeriod(transactions: Transaction[], period: string): Transaction[] {
  // period format: 'YYYY-MM', 'YYYY', or 'ALL'
  if (!period || period === 'ALL') return transactions;
  return transactions.filter((t) => t.date.startsWith(period));
}

export function calculateBudget503020(transactions: Transaction[]) {
  const realIncomeCents = calculateConfirmedIncomeCents(transactions);

  const needsCents = cents(Math.round((realIncomeCents * 50) / 100));
  const wantsCents = cents(Math.round((realIncomeCents * 30) / 100));
  const savingsCents = cents(realIncomeCents - needsCents - wantsCents);

  return {
    realIncomeCents,
    needsCents,
    wantsCents,
    savingsCents,
    realIncome: fromMoneyCents(realIncomeCents),
    needs: fromMoneyCents(needsCents),
    wants: fromMoneyCents(wantsCents),
    savings: fromMoneyCents(savingsCents),
  };
}

export function normalizeDescription(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function checkDuplicateTransaction(
  existingTransactions: Transaction[],
  newTr: {
    date: string;
    amount: number;
    amountCents?: MoneyCents;
    description: string;
    externalId?: string;
  }
): boolean {
  const newExtId = newTr.externalId ? newTr.externalId.trim().toLowerCase() : '';
  if (newExtId) {
    const idMatch = existingTransactions.some(
      (t) =>
        t.status !== 'CANCELLED' &&
        Boolean(t.externalId) &&
        t.externalId!.trim().toLowerCase() === newExtId
    );
    if (idMatch) return true;
  }

  const newNorm = normalizeDescription(newTr.description);
  const newCents = getTransactionAmountCents(newTr);
  return existingTransactions.some(
    (t) =>
      t.status !== 'CANCELLED' &&
      t.date === newTr.date &&
      getTransactionAmountCents(t) === newCents &&
      normalizeDescription(t.description) === newNorm
  );
}

export function detectInternalTransfer(
  item: {
    operationType?: OperationType;
    isInternalTransfer?: boolean;
    counterparty?: string;
    description?: string;
    originAccountHint?: string;
    destinationAccountHint?: string;
  },
  accounts: Account[]
): boolean {
  if (item.isInternalTransfer || item.operationType === 'TRANSFERENCIA_PROPRIA') {
    return true;
  }

  const knownKeywords = accounts
    .flatMap((a) => [a.institutionName, a.accountName])
    .map(normalizeDescription)
    .filter((k) => k.length >= 4);

  const originNorm = normalizeDescription(item.originAccountHint || '');
  const destNorm = normalizeDescription(item.destinationAccountHint || '');

  if (originNorm && destNorm) {
    const originMatches = knownKeywords.some((k) => originNorm.includes(k));
    const destMatches = knownKeywords.some((k) => destNorm.includes(k));
    if (originMatches && destMatches) return true;
  }

  const combined = normalizeDescription(`${item.description || ''} ${item.counterparty || ''}`);
  if (
    combined.includes('mesma titularidade') ||
    combined.includes('entre contas proprias') ||
    combined.includes('transferencia propria')
  ) {
    return true;
  }

  return false;
}
