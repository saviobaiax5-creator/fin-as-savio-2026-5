import type { CategoryBudget, EntityScope, Transaction } from '../../types';
import {
  MoneyCents,
  ZERO_CENTS,
  cents,
  fromCents,
  getTransactionAmountCents,
  subtractMoney,
} from '../money/money';
import { filterTransactionsByPeriod } from '../../utils/financeCalculations';

export type BudgetAlertLevel = 'OK' | 'WARNING' | 'EXCEEDED';

export interface CategoryBudgetStatus {
  budget: CategoryBudget;
  spentCents: MoneyCents;
  confirmedSpentCents: MoneyCents;
  projectedExtraCents: MoneyCents;
  remainingCents: MoneyCents;
  utilizationPct: number;
  alertLevel: BudgetAlertLevel;
}

export interface CategorySpendingSummary {
  category: string;
  confirmedCents: MoneyCents;
  projectedExtraCents: MoneyCents;
  totalCents: MoneyCents;
}

export function summarizeExpensesByCategory(params: {
  transactions: Transaction[];
  scope: EntityScope;
  period: string;
}): CategorySpendingSummary[] {
  const scoped = filterTransactionsByPeriod(
    params.transactions.filter((t) => {
      if (t.status === 'CANCELLED' || t.isInternalTransfer || t.direction !== 'EXPENSE') {
        return false;
      }
      if (params.scope === 'CPF') return t.entityId === 'CPF';
      if (params.scope === 'CNPJ') return t.entityId === 'CNPJ';
      return true;
    }),
    params.period
  );

  const map = new Map<string, { confirmed: number; projected: number }>();

  for (const tx of scoped) {
    const amt = getTransactionAmountCents(tx);
    const entry = map.get(tx.category) ?? { confirmed: 0, projected: 0 };
    if (tx.status === 'CONFIRMED') {
      entry.confirmed += amt;
    } else {
      entry.projected += amt;
    }
    map.set(tx.category, entry);
  }

  return Array.from(map.entries())
    .map(([category, vals]) => {
      const confirmedCents = cents(vals.confirmed);
      const projectedExtraCents = cents(vals.projected);
      return {
        category,
        confirmedCents,
        projectedExtraCents,
        totalCents: cents(confirmedCents + projectedExtraCents),
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function analyzeCategoryBudgets(params: {
  budgets: CategoryBudget[];
  transactions: Transaction[];
  scope: EntityScope;
  period: string;
  includeProjected: boolean;
}): CategoryBudgetStatus[] {
  const relevantBudgets = params.budgets.filter((b) => {
    if (params.scope === 'CONSOLIDATED') return true;
    return b.entityScope === params.scope || b.entityScope === 'CONSOLIDATED';
  });

  return relevantBudgets
    .map((budget) => {
      const evalScope: EntityScope =
        budget.entityScope !== 'CONSOLIDATED' ? budget.entityScope : params.scope;

      const summaryList = summarizeExpensesByCategory({
        transactions: params.transactions,
        scope: evalScope,
        period: params.period,
      });

      const found = summaryList.find((s) => s.category === budget.category);
      const confirmedSpentCents = found?.confirmedCents ?? ZERO_CENTS;
      const projectedExtraCents = found?.projectedExtraCents ?? ZERO_CENTS;
      const spentCents = params.includeProjected
        ? cents(confirmedSpentCents + projectedExtraCents)
        : confirmedSpentCents;

      const limitCents = cents(budget.limitCents);
      const remainingCents = subtractMoney(limitCents, spentCents);
      const utilizationPct =
        limitCents > 0 ? Math.round((spentCents / limitCents) * 100) : spentCents > 0 ? 100 : 0;

      let alertLevel: BudgetAlertLevel = 'OK';
      if (spentCents > limitCents) {
        alertLevel = 'EXCEEDED';
      } else if (utilizationPct >= 80) {
        alertLevel = 'WARNING';
      }

      return {
        budget,
        spentCents,
        confirmedSpentCents,
        projectedExtraCents,
        remainingCents,
        utilizationPct,
        alertLevel,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct);
}

export function calculateProjected503020(params: {
  transactions: Transaction[];
  includeProjected: boolean;
  needsCategories: Set<string>;
}) {
  const active = params.transactions.filter(
    (t) =>
      t.status !== 'CANCELLED' &&
      !t.isInternalTransfer &&
      (params.includeProjected || t.status === 'CONFIRMED')
  );

  let incomeCents = 0;
  let needsSpentCents = 0;
  let wantsSpentCents = 0;

  for (const tx of active) {
    const amt = getTransactionAmountCents(tx);
    if (tx.direction === 'INCOME') {
      incomeCents += amt;
    } else if (params.needsCategories.has(tx.category)) {
      needsSpentCents += amt;
    } else {
      wantsSpentCents += amt;
    }
  }

  const baseIncomeCents = cents(incomeCents);
  const needsTargetCents = cents(Math.round((baseIncomeCents * 50) / 100));
  const wantsTargetCents = cents(Math.round((baseIncomeCents * 30) / 100));
  const savingsTargetCents = cents(baseIncomeCents - needsTargetCents - wantsTargetCents);
  const actualSavingsCents = cents(Math.max(0, baseIncomeCents - (needsSpentCents + wantsSpentCents)));

  return {
    baseIncomeCents,
    needsTargetCents,
    wantsTargetCents,
    savingsTargetCents,
    needsSpentCents: cents(needsSpentCents),
    wantsSpentCents: cents(wantsSpentCents),
    actualSavingsCents,
    baseIncome: fromCents(baseIncomeCents),
    needsTarget: fromCents(needsTargetCents),
    wantsTarget: fromCents(wantsTargetCents),
    savingsTarget: fromCents(savingsTargetCents),
    needsSpent: fromCents(cents(needsSpentCents)),
    wantsSpent: fromCents(cents(wantsSpentCents)),
    actualSavings: fromCents(actualSavingsCents),
  };
}
