import type { Account, Boleto, EntityScope, Transaction } from '../../types';
import {
  MoneyCents,
  ZERO_CENTS,
  cents,
  fromCents,
  getTransactionAmountCents,
  toCents,
} from '../money/money';
import { addDaysLocal, todayLocal } from '../../utils/dateUtils';

export type CashFlowHorizonDays = 30 | 60 | 90;

export interface CashFlowEvent {
  id: string;
  date: string;
  title: string;
  sourceType: 'TRANSACTION' | 'BOLETO';
  direction: 'INCOME' | 'EXPENSE';
  amountCents: MoneyCents;
  runningBalanceCents: MoneyCents;
  statusLabel: string;
}

export interface CashFlowProjectionResult {
  horizonDays: CashFlowHorizonDays;
  startDate: string;
  endDate: string;
  startingBalanceCents: MoneyCents;
  projectedEndBalanceCents: MoneyCents;
  lowestBalanceCents: MoneyCents;
  lowestBalanceDate: string;
  totalInflowsCents: MoneyCents;
  totalOutflowsCents: MoneyCents;
  negativeAlertEventsCount: number;
  events: CashFlowEvent[];
  startingBalance: number;
  projectedEndBalance: number;
  lowestBalance: number;
  totalInflows: number;
  totalOutflows: number;
}

export function buildCashFlowProjection(params: {
  accounts: Account[];
  transactions: Transaction[];
  boletos: Boleto[];
  scope: EntityScope;
  horizonDays: CashFlowHorizonDays;
  startDate?: string;
}): CashFlowProjectionResult {
  const startDate = params.startDate || todayLocal();
  const endDate = addDaysLocal(startDate, params.horizonDays);

  const scopedAccounts = params.accounts.filter(
    (a) => !a.archived && (params.scope === 'CONSOLIDATED' ? true : a.entityId === params.scope)
  );

  const startingBalanceCents = cents(
    scopedAccounts.reduce(
      (sum, acc) => sum + (acc.balanceCents ?? toCents(acc.balance)),
      0
    )
  );

  interface RawScheduledItem {
    id: string;
    date: string;
    title: string;
    sourceType: 'TRANSACTION' | 'BOLETO';
    direction: 'INCOME' | 'EXPENSE';
    amountCents: MoneyCents;
    statusLabel: string;
  }

  const scheduled: RawScheduledItem[] = [];

  for (const tx of params.transactions) {
    if (tx.status !== 'PENDING' && tx.status !== 'PLANNED') continue;
    if (tx.isInternalTransfer) continue;
    if (params.scope !== 'CONSOLIDATED' && tx.entityId !== params.scope) continue;
    if (tx.date < startDate || tx.date > endDate) continue;

    const amt = getTransactionAmountCents(tx);
    if (amt <= 0) continue;

    scheduled.push({
      id: `cf-tx-${tx.id}`,
      date: tx.date,
      title: tx.description,
      sourceType: 'TRANSACTION',
      direction: tx.direction,
      amountCents: amt,
      statusLabel: tx.status === 'PENDING' ? 'Pendente' : 'Planejado',
    });
  }

  for (const bol of params.boletos) {
    if (bol.status !== 'PENDING') continue;
    if (params.scope !== 'CONSOLIDATED' && bol.entityId !== params.scope) continue;
    if (bol.vencimento < startDate || bol.vencimento > endDate) continue;

    const amt = toCents(bol.valorOriginal);
    if (amt <= 0) continue;

    scheduled.push({
      id: `cf-bol-${bol.id}`,
      date: bol.vencimento,
      title: `Boleto: ${bol.beneficiario}`,
      sourceType: 'BOLETO',
      direction: 'EXPENSE',
      amountCents: amt,
      statusLabel: 'Boleto a vencer',
    });
  }

  scheduled.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    // Inflows before outflows on the same calendar day
    if (a.direction !== b.direction) return a.direction === 'INCOME' ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  let running = Number(startingBalanceCents);
  let lowest = running;
  let lowestDate = startDate;
  let inflows = 0;
  let outflows = 0;
  let negativeCount = running < 0 ? 1 : 0;

  const events: CashFlowEvent[] = scheduled.map((item) => {
    if (item.direction === 'INCOME') {
      inflows += item.amountCents;
      running += item.amountCents;
    } else {
      outflows += item.amountCents;
      running -= item.amountCents;
    }
    if (running < lowest) {
      lowest = running;
      lowestDate = item.date;
    }
    if (running < 0) {
      negativeCount += 1;
    }
    return {
      ...item,
      runningBalanceCents: cents(running),
    };
  });

  const projectedEndBalanceCents = cents(running);
  const lowestBalanceCents = cents(lowest);
  const totalInflowsCents = cents(inflows);
  const totalOutflowsCents = cents(outflows);

  return {
    horizonDays: params.horizonDays,
    startDate,
    endDate,
    startingBalanceCents,
    projectedEndBalanceCents,
    lowestBalanceCents,
    lowestBalanceDate: lowestDate,
    totalInflowsCents: totalInflowsCents || ZERO_CENTS,
    totalOutflowsCents: totalOutflowsCents || ZERO_CENTS,
    negativeAlertEventsCount: negativeCount,
    events,
    startingBalance: fromCents(startingBalanceCents),
    projectedEndBalance: fromCents(projectedEndBalanceCents),
    lowestBalance: fromCents(lowestBalanceCents),
    totalInflows: fromCents(totalInflowsCents),
    totalOutflows: fromCents(totalOutflowsCents),
  };
}
