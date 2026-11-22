import React, { useMemo } from 'react';
import {
  SalaryIncomeGroup,
  SALARY_CATEGORY_GROUPS,
  type SalaryRecord,
  type SalarySource,
} from '../../types/salary';
import {
  buildMonthlyEvolutionSeries,
  compareYearsSamePeriod,
  getMonthlyTotal,
  summarizeAnnualIncome,
} from '../../utils/salaryCalculations';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarCheck,
  TrendingUp,
} from 'lucide-react';

interface SalaryDashboardProps {
  sources: SalarySource[];
  records: SalaryRecord[];
  selectedYear: number;
  selectedMonth: number;
  availableYears: number[];
  onOpenImport: () => void;
  onOpenNewRecord: () => void;
  onGoToArea: (area: 'monthly' | 'sources' | 'adjustments' | 'extras' | 'reports') => void;
}

export const SalaryDashboard: React.FC<SalaryDashboardProps> = ({
  sources,
  records,
  selectedYear,
  selectedMonth,
  availableYears,
  onOpenImport,
  onOpenNewRecord,
  onGoToArea,
}) => {
  const summary = useMemo(
    () => summarizeAnnualIncome(records, sources, selectedYear),
    [records, sources, selectedYear]
  );

  const monthlySeries = useMemo(
    () => buildMonthlyEvolutionSeries(records, sources, selectedYear),
    [records, sources, selectedYear]
  );

  const currentMonthReceived = useMemo(
    () => getMonthlyTotal(records, selectedYear, selectedMonth, sources),
    [records, selectedYear, selectedMonth, sources]
  );

  const prevMonthInfo = useMemo(() => {
    const prevM = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevY = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    const prevTotal = getMonthlyTotal(records, prevY, prevM, sources);
    const pct =
      prevTotal > 0 ? ((currentMonthReceived - prevTotal) / prevTotal) * 100 : null;
    return { prevM, prevY, prevTotal, pct };
  }, [records, selectedYear, selectedMonth, sources, currentMonthReceived]);

  // Latest month in selectedYear that actually has received income
  const latestReceivedMonth = useMemo(() => {
    const withValue = monthlySeries.filter((m) => m.received > 0);
    return withValue.length > 0 ? withValue[withValue.length - 1] : null;
  }, [monthlySeries]);

  const previousYearComparison = useMemo(() => {
    const prevYear = selectedYear - 1;
    if (!availableYears.includes(prevYear)) return null;
    return compareYearsSamePeriod(records, sources, prevYear, selectedYear);
  }, [records, sources, selectedYear, availableYears]);

  const hasAnyData = sources.length > 0 || records.length > 0;

  if (!hasAnyData) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 grid place-items-center mx-auto">
          <Banknote size={24} />
        </div>
        <div className="max-w-lg mx-auto space-y-1.5">
          <h3 className="text-lg font-bold text-[#082B5C] dark:text-white">
            Nenhuma fonte salarial cadastrada ainda
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Importe a aba salarial da sua planilha Excel (com revisão de valores antes de salvar) ou cadastre manualmente suas instituições de trabalho, aulas, 13º salário e férias.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenImport}
            className="min-h-11 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Importar planilha Excel
          </button>
          <button
            type="button"
            onClick={() => onGoToArea('sources')}
            className="min-h-11 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Cadastrar fonte de renda
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Recebido no mês ({String(selectedMonth).padStart(2, '0')}/{selectedYear})</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white tabular-nums">
            R$ {formatCurrencyBRL(currentMonthReceived)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
            {prevMonthInfo.pct === null ? (
              <span>Sem base no mês anterior ({String(prevMonthInfo.prevM).padStart(2, '0')}/{prevMonthInfo.prevY})</span>
            ) : prevMonthInfo.pct >= 0 ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  +{prevMonthInfo.pct.toFixed(1)}% vs mês anterior
                </span>
              </>
            ) : (
              <>
                <ArrowDownRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span className="text-red-700 dark:text-red-400 font-semibold">
                  {prevMonthInfo.pct.toFixed(1)}% vs mês anterior
                </span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total recebido em {selectedYear}</span>
            <Banknote className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white tabular-nums">
            R$ {formatCurrencyBRL(summary.receivedNetTotal)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Bruto est.: R$ {formatCurrencyBRL(summary.receivedGrossTotal)} · Desc.: R$ {formatCurrencyBRL(summary.receivedDeductionsTotal)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Média mensal ({selectedYear})</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white tabular-nums">
            R$ {formatCurrencyBRL(summary.monthlyAverage)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.receivedMonthsCount} {summary.receivedMonthsCount === 1 ? 'mês com recebimento' : 'meses com recebimento'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Fontes ativas · Conciliação</span>
            <Building2 className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white tabular-nums">
            {summary.activeSourcesCount}
            <span className="text-sm font-semibold text-slate-400 ml-2">
              {summary.activeSourcesCount === 1 ? 'fonte ativa' : 'fontes ativas'}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {summary.linkedTransactionsCount} registro(s) vinculados ao extrato bancário
          </div>
        </div>
      </div>

      {/* Secondary Indicators Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Última renda mensal realizada</div>
          <div className="text-lg font-bold text-[#082B5C] dark:text-white mt-1 tabular-nums">
            {latestReceivedMonth
              ? `R$ ${formatCurrencyBRL(latestReceivedMonth.received)}`
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {latestReceivedMonth ? `Referência: ${latestReceivedMonth.label}/${selectedYear}` : 'Nenhum mês confirmado'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Maior renda mensal ({selectedYear})</div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
            {summary.highestMonth
              ? `R$ ${formatCurrencyBRL(summary.highestMonth.total)}`
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {summary.highestMonth ? `Mês de ${summary.highestMonth.label}` : 'Sem lançamentos recebidos'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Menor renda mensal ({selectedYear})</div>
          <div className="text-lg font-bold text-[#082B5C] dark:text-white mt-1 tabular-nums">
            {summary.lowestMonth
              ? `R$ ${formatCurrencyBRL(summary.lowestMonth.total)}`
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {summary.lowestMonth ? `Mês de ${summary.lowestMonth.label}` : 'Sem lançamentos recebidos'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Crescimento vs {selectedYear - 1}</div>
          <div className="text-lg font-bold text-[#082B5C] dark:text-white mt-1 tabular-nums">
            {previousYearComparison && previousYearComparison.samePeriodGrowthPct !== null
              ? `${previousYearComparison.samePeriodGrowthPct >= 0 ? '+' : ''}${previousYearComparison.samePeriodGrowthPct.toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {previousYearComparison
              ? previousYearComparison.commonMonths.length > 0
                ? `Mesmos ${previousYearComparison.commonMonths.length} mês(es) em comum`
                : 'Sem meses comuns para comparação'
              : `Sem base cadastrada para ${selectedYear - 1}`}
          </div>
        </div>
      </div>

      {/* Breakdown by Type: Recurring vs Extraordinary vs Expected/Unknown vs Loans */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
              Composição da renda em {selectedYear}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Separação rigorosa entre renda recorrente, valores extraordinários, pendentes de confirmação e empréstimos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenNewRecord}
              className="min-h-10 px-4 py-2 rounded-xl bg-[#082B5C] hover:bg-[#061B3B] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Lançar salário / renda
            </button>
            <button
              type="button"
              onClick={() => onGoToArea('monthly')}
              className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Abrir tabela mensal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Renda recorrente recebida</div>
            <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
              R$ {formatCurrencyBRL(summary.recurringTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Salário fixo, docência e benefícios
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Renda extraordinária recebida</div>
            <div className="text-lg font-extrabold text-blue-700 dark:text-blue-400 mt-1 tabular-nums">
              R$ {formatCurrencyBRL(summary.extraordinaryTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              13º salário, férias, bônus e extras
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Previsto e a confirmar</div>
            <div className="text-lg font-extrabold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
              R$ {formatCurrencyBRL(summary.expectedTotal + summary.unknownTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
              Previsto: R$ {formatCurrencyBRL(summary.expectedTotal)} · A confirmar: R$ {formatCurrencyBRL(summary.unknownTotal)}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70">
            <div className="text-xs text-slate-500 dark:text-slate-400">Empréstimos (isolados da renda)</div>
            <div className="text-lg font-extrabold text-slate-700 dark:text-slate-200 mt-1 tabular-nums">
              R$ {formatCurrencyBRL(summary.loanTotal)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {Object.values(SALARY_CATEGORY_GROUPS).filter((g: SalaryIncomeGroup) => g === 'loan').length > 0
                ? 'Não somado nos indicadores de salário'
                : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
