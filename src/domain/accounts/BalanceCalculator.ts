import { Account, Asset, Debt, Transaction } from '../../types';
import {
  MoneyCents,
  ZERO_CENTS,
  addMoney,
  cents,
  fromCents,
  getTransactionAmountCents,
  safeToCents,
  subtractMoney,
} from '../money/money';

export interface FinancialBalancesResult {
  realizedBalanceCents: MoneyCents;
  projectedBalanceCents: MoneyCents;
  pendingNetCents: MoneyCents;
  plannedNetCents: MoneyCents;
}

export interface PeriodMetricsCents {
  confirmedIncomeCents: MoneyCents;
  confirmedExpenseCents: MoneyCents;
  realizedNetCents: MoneyCents;
  pendingIncomeCents: MoneyCents;
  pendingExpenseCents: MoneyCents;
  pendingNetCents: MoneyCents;
  plannedIncomeCents: MoneyCents;
  plannedExpenseCents: MoneyCents;
  plannedNetCents: MoneyCents;
  projectedIncomeCents: MoneyCents;
  projectedExpenseCents: MoneyCents;
  projectedNetCents: MoneyCents;
}

export interface ConsolidatedPatrimonyCents {
  realizedAccountsBalanceCents: MoneyCents;
  projectedAccountsBalanceCents: MoneyCents;
  assetsTotalCents: MoneyCents;
  debtsTotalCents: MoneyCents;
  realizedNetWorthCents: MoneyCents;
  projectedNetWorthCents: MoneyCents;
}

function signedTransactionCents(tx: Transaction): MoneyCents {
  const amountCents = getTransactionAmountCents(tx);
  return tx.direction === 'INCOME' ? amountCents : cents(-amountCents);
}

function sumSignedCents(openingCents: MoneyCents, items: readonly Transaction[]): MoneyCents {
  let total = openingCents as number;
  for (let i = 0; i < items.length; i += 1) {
    total += signedTransactionCents(items[i]);
  }
  return cents(total);
}

export function getAccountOpeningCents(account: Account): MoneyCents {
  if (
    typeof account.openingBalanceCents === 'number' &&
    Number.isSafeInteger(account.openingBalanceCents)
  ) {
    return cents(account.openingBalanceCents);
  }
  return safeToCents(account.openingBalance ?? 0, ZERO_CENTS);
}

export function calculateFinancialBalances(
  openingBalanceCents: number | MoneyCents,
  transactions: readonly Transaction[]
): FinancialBalancesResult {
  const baseCents = cents(Math.trunc(openingBalanceCents));

  const confirmed = transactions.filter((t) => t.status === 'CONFIRMED');
  const pending = transactions.filter((t) => t.status === 'PENDING');
  const planned = transactions.filter((t) => t.status === 'PLANNED');
  const projected = transactions.filter(
    (t) => t.status === 'CONFIRMED' || t.status === 'PENDING' || t.status === 'PLANNED'
  );

  return {
    realizedBalanceCents: sumSignedCents(baseCents, confirmed),
    projectedBalanceCents: sumSignedCents(baseCents, projected),
    pendingNetCents: sumSignedCents(ZERO_CENTS, pending),
    plannedNetCents: sumSignedCents(ZERO_CENTS, planned),
  };
}

export function calculateRealizedBalanceCents(
  openingBalanceCents: MoneyCents,
  transactions: readonly Transaction[]
): MoneyCents {
  return calculateFinancialBalances(openingBalanceCents, transactions).realizedBalanceCents;
}

export function calculateProjectedBalanceCents(
  openingBalanceCents: MoneyCents,
  transactions: readonly Transaction[]
): MoneyCents {
  return calculateFinancialBalances(openingBalanceCents, transactions).projectedBalanceCents;
}

export function calculateConfirmedIncomeCents(transactions: readonly Transaction[]): MoneyCents {
  let total = 0;
  for (let i = 0; i < transactions.length; i += 1) {
    const t = transactions[i];
    if (t.status === 'CONFIRMED' && t.direction === 'INCOME' && !t.isInternalTransfer) {
      total += getTransactionAmountCents(t);
    }
  }
  return cents(total);
}

export function calculateConfirmedExpenseCents(transactions: readonly Transaction[]): MoneyCents {
  let total = 0;
  for (let i = 0; i < transactions.length; i += 1) {
    const t = transactions[i];
    if (t.status === 'CONFIRMED' && t.direction === 'EXPENSE' && !t.isInternalTransfer) {
      total += getTransactionAmountCents(t);
    }
  }
  return cents(total);
}

export function calculatePeriodMetricsCents(
  transactions: readonly Transaction[]
): PeriodMetricsCents {
  let confirmedIncome = 0;
  let confirmedExpense = 0;
  let pendingIncome = 0;
  let pendingExpense = 0;
  let plannedIncome = 0;
  let plannedExpense = 0;

  for (let i = 0; i < transactions.length; i += 1) {
    const t = transactions[i];
    if (t.isInternalTransfer || t.status === 'CANCELLED') continue;

    const amt = getTransactionAmountCents(t);
    if (t.status === 'CONFIRMED') {
      if (t.direction === 'INCOME') confirmedIncome += amt;
      else confirmedExpense += amt;
    } else if (t.status === 'PENDING') {
      if (t.direction === 'INCOME') pendingIncome += amt;
      else pendingExpense += amt;
    } else if (t.status === 'PLANNED') {
      if (t.direction === 'INCOME') plannedIncome += amt;
      else plannedExpense += amt;
    }
  }

  const confirmedIncomeCents = cents(confirmedIncome);
  const confirmedExpenseCents = cents(confirmedExpense);
  const pendingIncomeCents = cents(pendingIncome);
  const pendingExpenseCents = cents(pendingExpense);
  const plannedIncomeCents = cents(plannedIncome);
  const plannedExpenseCents = cents(plannedExpense);

  const projectedIncomeCents = addMoney(
    addMoney(confirmedIncomeCents, pendingIncomeCents),
    plannedIncomeCents
  );
  const projectedExpenseCents = addMoney(
    addMoney(confirmedExpenseCents, pendingExpenseCents),
    plannedExpenseCents
  );

  return {
    confirmedIncomeCents,
    confirmedExpenseCents,
    realizedNetCents: subtractMoney(confirmedIncomeCents, confirmedExpenseCents),
    pendingIncomeCents,
    pendingExpenseCents,
    pendingNetCents: subtractMoney(pendingIncomeCents, pendingExpenseCents),
    plannedIncomeCents,
    plannedExpenseCents,
    plannedNetCents: subtractMoney(plannedIncomeCents, plannedExpenseCents),
    projectedIncomeCents,
    projectedExpenseCents,
    projectedNetCents: subtractMoney(projectedIncomeCents, projectedExpenseCents),
  };
}

export function deriveAccountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[]
): Account[] {
  const txByAccount = new Map<string, Transaction[]>();
  for (let i = 0; i < transactions.length; i += 1) {
    const t = transactions[i];
    const list = txByAccount.get(t.accountId);
    if (list) list.push(t);
    else txByAccount.set(t.accountId, [t]);
  }

  return accounts.map((acc) => {
    const openingCents = getAccountOpeningCents(acc);
    const accTransactions = txByAccount.get(acc.id) ?? [];
    const { realizedBalanceCents, projectedBalanceCents } = calculateFinancialBalances(
      openingCents,
      accTransactions
    );

    return {
      ...acc,
      openingBalanceCents: openingCents,
      openingBalance: fromCents(openingCents),
      balanceCents: realizedBalanceCents,
      balance: fromCents(realizedBalanceCents),
      projectedBalanceCents,
      projectedBalance: fromCents(projectedBalanceCents),
    };
  });
}

export function calculateConsolidatedPatrimonyCents(params: {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  assets: readonly Asset[];
  debts: readonly Debt[];
}): ConsolidatedPatrimonyCents {
  const derivedAccounts = deriveAccountBalances(params.accounts, params.transactions);

  let realizedAccountsTotal = 0;
  let projectedAccountsTotal = 0;
  for (let i = 0; i < derivedAccounts.length; i += 1) {
    const acc = derivedAccounts[i];
    realizedAccountsTotal += acc.balanceCents ?? safeToCents(acc.balance, ZERO_CENTS);
    projectedAccountsTotal +=
      acc.projectedBalanceCents ?? acc.balanceCents ?? safeToCents(acc.balance, ZERO_CENTS);
  }

  let assetsTotal = 0;
  for (let i = 0; i < params.assets.length; i += 1) {
    assetsTotal += safeToCents(params.assets[i].currentValue, ZERO_CENTS);
  }

  let debtsTotal = 0;
  for (let i = 0; i < params.debts.length; i += 1) {
    if (params.debts[i].status !== 'PAID') {
      debtsTotal += safeToCents(params.debts[i].outstandingAmount, ZERO_CENTS);
    }
  }

  const realizedAccountsBalanceCents = cents(realizedAccountsTotal);
  const projectedAccountsBalanceCents = cents(projectedAccountsTotal);
  const assetsTotalCents = cents(assetsTotal);
  const debtsTotalCents = cents(debtsTotal);

  return {
    realizedAccountsBalanceCents,
    projectedAccountsBalanceCents,
    assetsTotalCents,
    debtsTotalCents,
    realizedNetWorthCents: subtractMoney(
      addMoney(realizedAccountsBalanceCents, assetsTotalCents),
      debtsTotalCents
    ),
    projectedNetWorthCents: subtractMoney(
      addMoney(projectedAccountsBalanceCents, assetsTotalCents),
      debtsTotalCents
    ),
  };
}
