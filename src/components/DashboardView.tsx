import React, { useMemo } from 'react';
import {
  Transaction,
  EntityScope,
  Boleto,
  Account,
  CreditCard,
  CategoryBudget,
  LedgerDrilldownFilter,
} from '../types';
import { calculateCountdown } from '../utils/countdown';
import {
  filterTransactionsByPeriod,
  calculatePeriodMetricsCents,
  getTransactionAmountCents,
  toCents,
  fromCents,
} from '../utils/financeCalculations';
import { analyzeCategoryBudgets } from '../domain/planning/BudgetAnalyzer';
import { buildCashFlowProjection } from '../domain/planning/CashFlowProjectionService';
import { formatDateBR, todayLocal } from '../utils/dateUtils';
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Wallet,
  CreditCard as CreditCardIcon,
  Camera,
  Plus,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  PieChart,
} from 'lucide-react';

import type { SyncStatus } from '../services/cloudSyncService';
import { FinancialCalendarWidget } from './FinancialCalendarWidget';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface DashboardViewProps {
  transactions: Transaction[];
  accounts: Account[];
  boletos: Boleto[];
  cards: CreditCard[];
  budgets?: CategoryBudget[];
  scope: EntityScope;
  period: string;
  syncStatus?: SyncStatus;
  onNavigate: (tab: string, filter?: LedgerDrilldownFilter) => void;
  onOpenNew: () => void;
  onEditTransaction?: (tx: Transaction) => void;
  onScopeChange?: (scope: EntityScope) => void;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getPreviousMonthKey(period: string): string {
  const baseYm = period && /^\d{4}-\d{2}$/.test(period) ? period : todayLocal().slice(0, 7);
  const [y, m] = baseYm.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
}

function getComparisonBaseKey(period: string): string {
  if (period && /^\d{4}-\d{2}$/.test(period)) return period;
  return todayLocal().slice(0, 7);
}

interface VariationInfo {
  label: string;
  direction: 'UP' | 'DOWN' | 'FLAT';
  isPositiveTone: boolean;
}

function computeVariation(
  currentCents: number,
  prevCents: number,
  invertPolarity = false
): VariationInfo | null {
  if (prevCents === 0) {
    if (currentCents === 0) return null;
    return null;
  }
  const rawPct = ((currentCents - prevCents) / Math.abs(prevCents)) * 100;
  if (Math.abs(rawPct) < 0.05) {
    return {
      label: '0,0%',
      direction: 'FLAT',
      isPositiveTone: true,
    };
  }
  const isUp = rawPct > 0;
  const formatted = `${isUp ? '+' : '-'}${Math.abs(rawPct).toFixed(1).replace('.', ',')}%`;
  const isPositiveTone = invertPolarity ? !isUp : isUp;
  return {
    label: formatted,
    direction: isUp ? 'UP' : 'DOWN',
    isPositiveTone,
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  accounts,
  boletos,
  cards,
  budgets = [],
  scope,
  period,
  syncStatus,
  onNavigate,
  onOpenNew,
  onEditTransaction,
}) => {
  const { hideValues } = usePrivacy();

  const scopedAccounts = useMemo(() => {
    return accounts.filter((a) => (scope === 'CONSOLIDATED' ? true : a.entityId === scope));
  }, [accounts, scope]);

  const { totalBalance, projectedBalance } = useMemo(() => {
    const realizedCents = scopedAccounts.reduce(
      (sum, a) => sum + (a.balanceCents ?? toCents(a.balance)),
      0
    );
    const projectedCents = scopedAccounts.reduce(
      (sum, a) => sum + (a.projectedBalanceCents ?? a.balanceCents ?? toCents(a.balance)),
      0
    );
    return {
      totalBalance: fromCents(realizedCents),
      projectedBalance: fromCents(projectedCents),
    };
  }, [scopedAccounts]);

  const scopedTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.status === 'CANCELLED') return false;
      if (scope === 'CPF') return t.entityId === 'CPF';
      if (scope === 'CNPJ') return t.entityId === 'CNPJ';
      return true;
    });
  }, [transactions, scope]);

  const periodTransactions = useMemo(() => {
    return filterTransactionsByPeriod(scopedTransactions, period);
  }, [scopedTransactions, period]);

  const {
    totalIncome,
    totalExpense,
    netResult,
    preservationRate,
    pendingNet,
    plannedNet,
    incomeCents,
    expenseCents,
    netCents,
  } = useMemo(() => {
    const metrics = calculatePeriodMetricsCents(periodTransactions);
    const rate =
      metrics.confirmedIncomeCents > 0
        ? ((metrics.realizedNetCents / metrics.confirmedIncomeCents) * 100).toFixed(1)
        : '0.0';
    return {
      totalIncome: fromCents(metrics.confirmedIncomeCents),
      totalExpense: fromCents(metrics.confirmedExpenseCents),
      netResult: fromCents(metrics.realizedNetCents),
      preservationRate: rate,
      pendingNet: fromCents(metrics.pendingNetCents),
      plannedNet: fromCents(metrics.plannedNetCents),
      incomeCents: metrics.confirmedIncomeCents,
      expenseCents: metrics.confirmedExpenseCents,
      netCents: metrics.realizedNetCents,
    };
  }, [periodTransactions]);

  // Month-over-month comparison metrics
  const { incomeVariation, expenseVariation, netVariation } = useMemo(() => {
    const baseKey = getComparisonBaseKey(period);
    const prevKey = getPreviousMonthKey(baseKey);
    const currentBaseMetrics =
      period === 'ALL'
        ? calculatePeriodMetricsCents(filterTransactionsByPeriod(scopedTransactions, baseKey))
        : {
            confirmedIncomeCents: incomeCents,
            confirmedExpenseCents: expenseCents,
            realizedNetCents: netCents,
          };
    const prevMetrics = calculatePeriodMetricsCents(
      filterTransactionsByPeriod(scopedTransactions, prevKey)
    );

    return {
      incomeVariation: computeVariation(
        currentBaseMetrics.confirmedIncomeCents,
        prevMetrics.confirmedIncomeCents,
        false
      ),
      expenseVariation: computeVariation(
        currentBaseMetrics.confirmedExpenseCents,
        prevMetrics.confirmedExpenseCents,
        true
      ),
      netVariation: computeVariation(
        currentBaseMetrics.realizedNetCents,
        prevMetrics.realizedNetCents,
        false
      ),
    };
  }, [scopedTransactions, period, incomeCents, expenseCents, netCents]);

  const scopedBoletos = useMemo(() => {
    return boletos.filter((b) => (scope === 'CONSOLIDATED' ? true : b.entityId === scope));
  }, [boletos, scope]);

  const pendingBoletos = useMemo(() => {
    return scopedBoletos
      .filter((b) => b.status === 'PENDING')
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [scopedBoletos]);

  const totalPendingBoletos = useMemo(() => {
    return fromCents(pendingBoletos.reduce((acc, b) => acc + toCents(b.valorOriginal), 0));
  }, [pendingBoletos]);

  // Donut Chart geometry (Receitas #10B981 vs Despesas #EF4444)
  const donutData = useMemo(() => {
    const totalFlow = Math.max(0, incomeCents) + Math.max(0, expenseCents);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const incomeShare = totalFlow > 0 ? Math.max(0, incomeCents) / totalFlow : 0;
    const expenseShare = totalFlow > 0 ? Math.max(0, expenseCents) / totalFlow : 0;
    return {
      totalFlow: fromCents(totalFlow),
      radius,
      circumference,
      incomePct: Math.round(incomeShare * 100),
      expensePct: Math.round(expenseShare * 100),
      incomeStroke: incomeShare * circumference,
      expenseStroke: expenseShare * circumference,
      hasData: totalFlow > 0,
    };
  }, [incomeCents, expenseCents]);

  // Real monthly chart data aggregated from confirmed scopedTransactions
  const monthlySeries = useMemo(() => {
    const targetYear = period && period !== 'ALL' ? period.slice(0, 4) : '2026';
    const byMonth = new Map<string, { incomeCents: number; expenseCents: number }>();

    scopedTransactions.forEach((t) => {
      if (t.status !== 'CONFIRMED' || t.isInternalTransfer || !t.date.startsWith(targetYear)) return;
      const ym = t.date.slice(0, 7);
      const curr = byMonth.get(ym) || { incomeCents: 0, expenseCents: 0 };
      const amtCents = getTransactionAmountCents(t);
      if (t.direction === 'INCOME') curr.incomeCents += amtCents;
      else curr.expenseCents += amtCents;
      byMonth.set(ym, curr);
    });

    const sortedKeys = Array.from(byMonth.keys()).sort();
    const maxCents = sortedKeys.reduce((max, k) => {
      const item = byMonth.get(k)!;
      return Math.max(max, item.incomeCents, item.expenseCents);
    }, 0);

    return sortedKeys.map((ym) => {
      const mIdx = Number(ym.slice(5, 7)) - 1;
      const item = byMonth.get(ym)!;
      return {
        ym,
        label: `${MONTH_NAMES[mIdx] || ym.slice(5, 7)}/${ym.slice(2, 4)}`,
        income: fromCents(item.incomeCents),
        expense: fromCents(item.expenseCents),
        incPct: maxCents > 0 ? Math.max(8, Math.round((item.incomeCents / maxCents) * 100)) : 0,
        expPct: maxCents > 0 ? Math.max(8, Math.round((item.expenseCents / maxCents) * 100)) : 0,
      };
    });
  }, [scopedTransactions, period]);

  // Real income breakdown by category for confirmed entries in the selected period
  const incomeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    let totalCents = 0;

    periodTransactions
      .filter((t) => t.status === 'CONFIRMED' && t.direction === 'INCOME' && !t.isInternalTransfer)
      .forEach((t) => {
        const c = getTransactionAmountCents(t);
        totalCents += c;
        map.set(t.category, (map.get(t.category) || 0) + c);
      });

    return Array.from(map.entries())
      .map(([category, cents]) => ({
        category,
        amount: fromCents(cents),
        percent: totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [periodTransactions]);

  const scopedCards = useMemo(() => {
    return cards.filter((c) => (scope === 'CONSOLIDATED' ? true : c.entityId === scope));
  }, [cards, scope]);

  const sortedRecent = useMemo(() => {
    return [...periodTransactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [periodTransactions]);

  const budgetAlerts = useMemo(() => {
    if (budgets.length === 0) return [];
    return analyzeCategoryBudgets({
      budgets,
      transactions,
      scope,
      period,
      includeProjected: true,
    }).filter((b) => b.alertLevel !== 'OK');
  }, [budgets, transactions, scope, period]);

  const cashFlow30 = useMemo(
    () =>
      buildCashFlowProjection({
        accounts,
        transactions,
        boletos,
        scope,
        horizonDays: 30,
      }),
    [accounts, transactions, boletos, scope]
  );

  const scopeLabel =
    scope === 'CONSOLIDATED'
      ? 'Saldo consolidado'
      : scope === 'CPF'
      ? 'Saldo pessoal (CPF)'
      : 'Saldo empresa (CNPJ)';

  const renderVariationBadge = (info: VariationInfo | null) => {
    if (!info) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-[#64748B] dark:bg-white/10 dark:text-slate-300">
          vs mês ant.
        </span>
      );
    }

    const toneClass = info.isPositiveTone
      ? 'bg-[#ECFDF5] text-[#059669] dark:bg-[#10B981]/20 dark:text-[#10B981]'
      : 'bg-[#FEF2F2] text-[#DC2626] dark:bg-[#EF4444]/20 dark:text-red-300';

    return (
      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold font-money ${toneClass}`}>
        {info.direction === 'UP' && <ArrowUp size={11} strokeWidth={2.25} />}
        {info.direction === 'DOWN' && <ArrowDown size={11} strokeWidth={2.25} />}
        <span>{info.label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fadeIn">
      {/* Header row (Desktop-only — eliminates mobile title duplication) */}
      <div className="hidden md:flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight">
            Visão executiva
          </h2>
          <p className="font-sans text-sm text-[#64748B] dark:text-slate-300 mt-0.5">
            Escopo: <strong className="font-semibold text-[#0F172A] dark:text-white">{scope}</strong> · Competência:{' '}
            <strong className="font-semibold text-[#0F172A] dark:text-white">
              {period === 'ALL' ? 'Todo período' : period}
            </strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="sf-card-interactive px-4 min-h-11 text-xs font-semibold text-[#0F172A] dark:text-white flex items-center gap-2 cursor-pointer"
          >
            <Camera size={16} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981]" />
            Scanner & Documentos
          </button>
          <button
            type="button"
            onClick={onOpenNew}
            className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-600 text-white px-4 min-h-11 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} strokeWidth={2} />
            Novo lançamento
          </button>
        </div>
      </div>

      {/* 1. SALDO CONSOLIDADO (HERO CARD) + DONUT RESUMO RECEITAS vs DESPESAS */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 sf-hero-card text-white p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <span className="font-sans text-xs font-semibold text-[#10B981] uppercase tracking-wider flex items-center gap-1.5">
                <Wallet size={15} strokeWidth={1.75} />
                {scopeLabel}
              </span>
              {scopedAccounts.length === 0 ? (
                <>
                  <div className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">
                    Nenhuma conta cadastrada
                  </div>
                  <p className="font-sans text-xs sm:text-sm text-white/85 mt-1.5">
                    Cadastre sua primeira conta bancária ou importe um backup (.json) em Configurações para começar.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-money text-3xl sm:text-4xl font-extrabold text-white mt-1.5">
                    {formatarValor(totalBalance, hideValues)}
                  </div>
                  <p className="font-sans text-xs sm:text-sm text-white/85 mt-1.5">
                    Saldo realizado (inicial + confirmados em {scopedAccounts.length} conta
                    {scopedAccounts.length !== 1 ? 's' : ''}).
                    {Math.abs(projectedBalance - totalBalance) >= 0.01 && (
                      <span className="ml-1.5 text-amber-300 font-semibold font-money">
                        · Projetado: {formatarValor(projectedBalance, hideValues)}
                      </span>
                    )}
                  </p>
                  {(Math.abs(pendingNet) >= 0.01 || Math.abs(plannedNet) >= 0.01) && (
                    <p className="font-sans text-xs text-white/85 mt-1">
                      Pendentes no período:{' '}
                      <span className="font-money font-semibold text-white">
                        {formatarValor(pendingNet, hideValues)}
                      </span>{' '}
                      · Planejados:{' '}
                      <span className="font-money font-semibold text-white">
                        {formatarValor(plannedNet, hideValues)}
                      </span>
                    </p>
                  )}
                </>
              )}
              {(syncStatus === 'PENDING_OFFLINE' ||
                syncStatus === 'UNVERIFIED_EMAIL' ||
                syncStatus === 'CONFLICT') && (
                <p className="text-[11px] text-amber-300 font-semibold mt-1.5">
                  Informação ainda não sincronizada com a nuvem — salva com segurança neste dispositivo.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('accounts')}
                className="px-4 min-h-10 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold border border-white/15 transition-colors cursor-pointer"
              >
                {scopedAccounts.length === 0 ? 'Cadastrar conta' : `Ver contas (${scopedAccounts.length})`}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('documents')}
                className="md:hidden px-4 min-h-10 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Camera size={15} strokeWidth={1.75} /> Scanner
              </button>
            </div>
          </div>
        </div>

        {/* Donut Chart Card: Receitas (#10B981) vs Despesas (#EF4444) */}
        <div className="sf-card p-5 flex items-center justify-between gap-4">
          <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
            <svg viewBox="0 0 108 108" className="w-full h-full -rotate-90" aria-hidden="true">
              <circle
                cx="54"
                cy="54"
                r={donutData.radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="12"
                className="text-slate-100 dark:text-white/10"
              />
              {donutData.hasData && donutData.incomeStroke > 0 && (
                <circle
                  cx="54"
                  cy="54"
                  r={donutData.radius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="12"
                  strokeLinecap={donutData.expenseStroke === 0 ? 'round' : 'butt'}
                  strokeDasharray={`${donutData.incomeStroke} ${donutData.circumference}`}
                  strokeDashoffset="0"
                />
              )}
              {donutData.hasData && donutData.expenseStroke > 0 && (
                <circle
                  cx="54"
                  cy="54"
                  r={donutData.radius}
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="12"
                  strokeLinecap={donutData.incomeStroke === 0 ? 'round' : 'butt'}
                  strokeDasharray={`${donutData.expenseStroke} ${donutData.circumference}`}
                  strokeDashoffset={-donutData.incomeStroke}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
              <span className="text-[10px] font-medium text-[#64748B] dark:text-slate-300 uppercase tracking-wider">
                Saldo mês
              </span>
              <span className="font-money text-xs font-extrabold text-[#0F172A] dark:text-white leading-tight mt-0.5">
                {donutData.hasData ? `${preservationRate}%` : '0%'}
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-2">
              <PieChart size={15} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981] shrink-0" />
              <h3 className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white truncate">
                Proporção do mês
              </h3>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[#64748B] dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] shrink-0" />
                  Receitas ({donutData.incomePct}%)
                </span>
                <span className="font-money font-bold text-[#0F172A] dark:text-white shrink-0">
                  {formatarValor(totalIncome, hideValues)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[#64748B] dark:text-slate-300 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shrink-0" />
                  Despesas ({donutData.expensePct}%)
                </span>
                <span className="font-money font-bold text-[#0F172A] dark:text-white shrink-0">
                  {formatarValor(totalExpense, hideValues)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. RECEITAS & DESPESAS + RESULTADO + A VENCER (com Variação % vs Mês Anterior) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() =>
            onNavigate(scope === 'CNPJ' ? 'cnpj' : 'cpf', {
              direction: 'INCOME',
              status: 'CONFIRMED',
            })
          }
          className="sf-card-interactive text-left p-4 sm:p-5 cursor-pointer flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-300">Receitas</span>
            <span className="sf-icon-badge">
              <TrendingUp size={18} strokeWidth={1.75} />
            </span>
          </div>
          <div className="font-money text-lg sm:text-2xl font-extrabold text-[#059669] dark:text-white">
            {formatarValor(totalIncome, hideValues)}
          </div>
          <div className="flex items-center justify-between gap-1">
            {renderVariationBadge(incomeVariation)}
            <span className="font-sans text-[11px] text-[#64748B] dark:text-slate-300 font-medium inline-flex items-center gap-0.5">
              Entradas <ChevronRight size={12} strokeWidth={1.75} />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onNavigate(scope === 'CNPJ' ? 'cnpj' : 'cpf', {
              direction: 'EXPENSE',
              status: 'CONFIRMED',
            })
          }
          className="sf-card-interactive text-left p-4 sm:p-5 cursor-pointer flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-300">Despesas</span>
            <span className="sf-icon-badge-danger">
              <TrendingDown size={18} strokeWidth={1.75} />
            </span>
          </div>
          <div className="font-money text-lg sm:text-2xl font-extrabold text-[#DC3545] dark:text-white">
            {formatarValor(totalExpense, hideValues)}
          </div>
          <div className="flex items-center justify-between gap-1">
            {renderVariationBadge(expenseVariation)}
            <span className="font-sans text-[11px] text-[#64748B] dark:text-slate-300 font-medium inline-flex items-center gap-0.5">
              Saídas <ChevronRight size={12} strokeWidth={1.75} />
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="sf-card-interactive text-left p-4 sm:p-5 cursor-pointer flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-300">Resultado</span>
            <span className={netResult >= 0 ? 'sf-icon-badge' : 'sf-icon-badge-danger'}>
              <ArrowUpRight size={18} strokeWidth={1.75} />
            </span>
          </div>
          <div
            className={`font-money text-lg sm:text-2xl font-extrabold ${
              netResult >= 0 ? 'text-[#059669] dark:text-white' : 'text-[#DC3545] dark:text-white'
            }`}
          >
            {formatarValor(netResult, hideValues)}
          </div>
          <div className="flex items-center justify-between gap-1">
            {renderVariationBadge(netVariation)}
            <span className="font-sans text-[11px] text-[#64748B] dark:text-slate-300 font-medium truncate">
              {preservationRate}% salvo
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('boletos')}
          className="sf-card-interactive text-left p-4 sm:p-5 cursor-pointer flex flex-col justify-between gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-300">
              A vencer (Boletos)
            </span>
            <span className="sf-icon-badge-amber">
              <AlertCircle size={18} strokeWidth={1.75} />
            </span>
          </div>
          <div className="font-money text-lg sm:text-2xl font-extrabold text-amber-600 dark:text-white">
            {formatarValor(totalPendingBoletos, hideValues)}
          </div>
          <div className="font-sans text-[11px] text-[#64748B] dark:text-slate-300 font-medium inline-flex items-center justify-between gap-1">
            <span>
              {pendingBoletos.length} pendente{pendingBoletos.length !== 1 ? 's' : ''}
            </span>
            <ChevronRight size={13} strokeWidth={1.75} />
          </div>
        </button>
      </section>

      {/* 3. Tabbed Transactions & Minimizable Calendar Widget */}
      <FinancialCalendarWidget
        transactions={transactions}
        scope={scope}
        period={period}
        onEditTransaction={onEditTransaction}
      />

      {/* RADAR DE ORÇAMENTO E FLUXO PROJETADO */}
      {(budgetAlerts.length > 0 || cashFlow30.lowestBalanceCents < 0) && (
        <section className="bg-amber-50/90 dark:bg-[#11185A] border border-amber-200 dark:border-amber-400/30 p-4 sm:p-5 rounded-2xl space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-300" strokeWidth={1.75} />
              Radar Financeiro (Orçamento & Liquidez 30d)
            </span>
            <div className="flex items-center gap-3">
              {budgetAlerts.length > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('planning')}
                  className="text-xs font-bold text-amber-900 dark:text-amber-200 inline-flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  Ver tetos <ChevronRight size={13} strokeWidth={1.75} />
                </button>
              )}
              {cashFlow30.lowestBalanceCents < 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="text-xs font-bold text-red-700 dark:text-red-300 inline-flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  Ver projeção <ChevronRight size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {budgetAlerts.map((a) => (
              <span
                key={a.budget.id}
                className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                  a.alertLevel === 'EXCEEDED'
                    ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200'
                    : 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200'
                }`}
              >
                {a.budget.category}: {a.utilizationPct}% do teto
              </span>
            ))}
            {cashFlow30.lowestBalanceCents < 0 && (
              <span className="px-3 py-1 rounded-xl text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200">
                Caixa projetado negativo ({formatarValor(cashFlow30.lowestBalance, hideValues)}) em{' '}
                {formatDateBR(cashFlow30.lowestBalanceDate)}
              </span>
            )}
          </div>
        </section>
      )}

      {/* 4. CENTRAL DE VENCIMENTOS */}
      <section className="sf-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="sf-icon-badge">
              <Clock size={18} strokeWidth={1.75} />
            </span>
            <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
              Central de Vencimentos & Contadores
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('boletos')}
            className="px-3.5 min-h-9 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            Gerenciar boletos <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        {pendingBoletos.length === 0 ? (
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-300 py-2">
            Nenhum boleto ou obrigação pendente para o escopo selecionado.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {pendingBoletos.slice(0, 3).map((bol) => {
              const countdown = calculateCountdown(bol.vencimento, false);
              return (
                <div
                  key={bol.id}
                  className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-xs font-bold text-[#0F172A] dark:text-white truncate">
                        {bol.beneficiario}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-white/15 text-[#0F172A] dark:text-white shrink-0">
                        {bol.entityId}
                      </span>
                    </div>
                    <div className="font-money text-base font-bold text-[#0F172A] dark:text-white mt-1">
                      {formatarValor(bol.valorOriginal, hideValues)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${countdown.badgeColor}`}>
                      {countdown.shortLabel}
                    </span>
                    <span className="text-[11px] text-[#64748B] dark:text-slate-300">
                      {bol.vencimento.split('-').reverse().join('/')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. MOVIMENTAÇÕES RECENTES (Grouped Container no mobile, Tabela no desktop) */}
      <section className="sf-card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
            Últimas movimentações
          </h3>
          <button
            type="button"
            onClick={() => onNavigate(scope === 'CNPJ' ? 'cnpj' : 'cpf')}
            className="text-xs font-semibold text-[#059669] dark:text-[#10B981] hover:underline flex items-center gap-1 cursor-pointer min-h-9 px-2"
          >
            Ver todas <ChevronRight size={15} strokeWidth={1.75} />
          </button>
        </div>

        {sortedRecent.length === 0 ? (
          <p className="font-sans text-sm text-[#64748B] dark:text-slate-300 py-6 text-center">
            Nenhuma movimentação encontrada para este período e escopo.
          </p>
        ) : (
          <>
            {/* Mobile Fintech Grouped List */}
            <div className="md:hidden sf-grouped-card sf-grouped-divider">
              {sortedRecent.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onEditTransaction && onEditTransaction(t)}
                  className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 active:bg-slate-50 dark:active:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[#0F172A] dark:text-white truncate">
                      {t.description}
                    </div>
                    <div className="text-xs text-[#64748B] dark:text-slate-300 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{t.date.split('-').reverse().join('/')}</span>
                      <span>·</span>
                      <span className="truncate">{t.category}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.entityId === 'CPF'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'
                        }`}
                      >
                        {t.entityId}
                      </span>
                      {t.status === 'PENDING' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                          Pendente
                        </span>
                      )}
                      {t.status === 'PLANNED' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
                          Planejado
                        </span>
                      )}
                      {t.reversedTransactionId && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200">
                          Estorno
                        </span>
                      )}
                      {t.reversalTransactionId && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700 dark:bg-white/15 dark:text-slate-200">
                          Estornado
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`font-money text-sm font-bold ${
                        t.direction === 'INCOME'
                          ? 'text-[#059669] dark:text-white'
                          : 'text-[#DC3545] dark:text-white'
                      }`}
                    >
                      {hideValues
                        ? formatarValor(fromCents(getTransactionAmountCents(t)), true)
                        : `${t.direction === 'INCOME' ? '+ ' : '− '}${formatarValor(fromCents(getTransactionAmountCents(t)), false)}`}
                    </span>
                    <ChevronRight size={15} strokeWidth={1.75} className="text-[#94A3B8] dark:text-slate-400" />
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-[#64748B] dark:text-slate-300 border-b border-[#F1F5F9] dark:border-white/10">
                    <th className="pb-3 font-semibold">Data</th>
                    <th className="pb-3 font-semibold">Descrição</th>
                    <th className="pb-3 font-semibold">Categoria</th>
                    <th className="pb-3 font-semibold">Conta</th>
                    <th className="pb-3 font-semibold">Vínculo</th>
                    <th className="pb-3 font-semibold text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] dark:divide-white/10">
                  {sortedRecent.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => onEditTransaction && onEditTransaction(t)}
                      className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="py-3 text-[#64748B] dark:text-slate-300">
                        {t.date.split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 font-medium text-[#0F172A] dark:text-white">
                        {t.description}
                        {t.status === 'PENDING' && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-200 font-semibold">
                            Pendente
                          </span>
                        )}
                        {t.status === 'PLANNED' && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-500/20 text-sky-700 dark:text-sky-200 font-semibold">
                            Planejado
                          </span>
                        )}
                        {t.reversedTransactionId && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-semibold">
                            Estorno
                          </span>
                        )}
                        {t.reversalTransactionId && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/15 text-slate-700 dark:text-slate-200 font-semibold">
                            Estornado
                          </span>
                        )}
                        {t.isInternalTransfer && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[#64748B] dark:text-slate-300">
                            Transferência
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 text-[#0F172A] dark:text-slate-200 rounded-md text-[10px] font-medium">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-3 text-[#64748B] dark:text-slate-300">{t.account}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.entityId === 'CPF'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                          }`}
                        >
                          {t.entityId}
                        </span>
                      </td>
                      <td
                        className={`font-money py-3 text-right font-bold ${
                          t.direction === 'INCOME'
                            ? 'text-[#059669] dark:text-white'
                            : 'text-[#DC3545] dark:text-white'
                        }`}
                      >
                        {hideValues
                          ? formatarValor(fromCents(getTransactionAmountCents(t)), true)
                          : `${t.direction === 'INCOME' ? '+ ' : '− '}${formatarValor(fromCents(getTransactionAmountCents(t)), false)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 6. REAL CHARTS & CARDS SUMMARY */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Flow derived from actual transactions */}
        <div className="lg:col-span-2 sf-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                Fluxo financeiro mensal
              </h3>
              <p className="font-sans text-xs text-[#64748B] dark:text-slate-300">
                Receitas vs Despesas reais por competência
              </p>
            </div>
            <span className="text-xs bg-slate-100 dark:bg-white/10 text-[#64748B] dark:text-white px-3 py-1 rounded-full font-medium">
              {period === 'ALL' ? 'Histórico' : period.slice(0, 4)}
            </span>
          </div>

          {monthlySeries.length === 0 ? (
            <div className="h-40 grid place-items-center text-xs text-[#64748B] dark:text-slate-300">
              Sem lançamentos no ano selecionado para exibir o gráfico.
            </div>
          ) : (
            <div className="h-48 flex items-end gap-4 px-2 pt-4 border-b border-[#F1F5F9] dark:border-white/10 pb-2">
              {monthlySeries.map((m) => (
                <div key={m.ym} className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0">
                  <div className="w-full flex justify-center items-end gap-1.5 h-36">
                    <div
                      style={{ height: `${m.incPct}%` }}
                      className="w-4 sm:w-6 bg-[#10B981] rounded-t-sm transition-all"
                      title={`Receitas: ${formatarValor(m.income, hideValues)}`}
                    />
                    <div
                      style={{ height: `${m.expPct}%` }}
                      className="w-4 sm:w-6 bg-[#EF4444] rounded-t-sm transition-all"
                      title={`Despesas: ${formatarValor(m.expense, hideValues)}`}
                    />
                  </div>
                  <span className="text-[11px] text-[#64748B] dark:text-slate-300 font-medium">{m.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-6 mt-4 text-xs text-[#64748B] dark:text-slate-300 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#10B981]" /> Receitas
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#EF4444]" /> Despesas
            </div>
          </div>
        </div>

        {/* Income Breakdown & Card Invoices */}
        <div className="sf-card p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white mb-1">
              Origem das receitas ({period === 'ALL' ? 'Geral' : period})
            </h3>
            <p className="font-sans text-xs text-[#64748B] dark:text-slate-300 mb-4">
              Distribuição calculada sobre lançamentos reais
            </p>

            {incomeBreakdown.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-slate-300 py-4">
                Nenhuma receita registrada no período.
              </p>
            ) : (
              <div className="space-y-3">
                {incomeBreakdown.map((item) => (
                  <div key={item.category}>
                    <div className="flex justify-between text-xs font-medium mb-1 gap-2">
                      <span className="text-[#64748B] dark:text-slate-300 truncate">{item.category}</span>
                      <span className="font-money font-bold text-[#0F172A] dark:text-white shrink-0">
                        {item.percent}% ({formatarValor(item.amount, hideValues)})
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#10B981] h-full rounded-full"
                        style={{ width: `${item.percent}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#F1F5F9] dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#0F172A] dark:text-white">
              <span className="font-display flex items-center gap-1.5">
                <CreditCardIcon size={14} strokeWidth={1.75} className="text-amber-500" /> Faturas em aberto
              </span>
              <button
                type="button"
                onClick={() => onNavigate('cards')}
                className="text-[#059669] dark:text-[#10B981] font-semibold hover:underline cursor-pointer"
              >
                Cartões
              </button>
            </div>
            {scopedCards.length === 0 ? (
              <p className="text-xs text-[#64748B] dark:text-slate-300">Nenhum cartão cadastrado neste escopo.</p>
            ) : (
              scopedCards.slice(0, 2).map((c) => (
                <div
                  key={c.id}
                  className="flex justify-between items-center text-xs bg-[#F8FAFC] dark:bg-white/5 px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-white/10"
                >
                  <span className="text-[#0F172A] dark:text-white truncate font-medium">
                    {c.cardName} (dia {c.dueDay})
                  </span>
                  <span className="font-money font-bold text-[#DC3545] dark:text-white shrink-0">
                    {formatarValor(c.currentInvoiceAmount, hideValues)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
