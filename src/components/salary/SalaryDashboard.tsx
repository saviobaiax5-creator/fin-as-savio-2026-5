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
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
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
  const { hideValues } = usePrivacy();

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
      <div className="sf-card p-8 text-center space-y-4">
        <div className="sf-icon-badge mx-auto">
          <Banknote size={20} strokeWidth={2} />
        </div>
        <div className="max-w-lg mx-auto space-y-1.5">
          <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
            Nenhuma fonte salarial cadastrada ainda
          </h3>
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Importe a aba salarial da sua planilha Excel (com revisão de valores antes de salvar) ou cadastre manualmente suas instituições de trabalho, aulas, 13º salário e férias.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenImport}
            className="min-h-11 px-5 py-2.5 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Importar planilha Excel
          </button>
          <button
            type="button"
            onClick={() => onGoToArea('sources')}
            className="sf-card-interactive min-h-11 px-5 py-2.5 text-[#0F172A] dark:text-slate-200 text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
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
        <div className="sf-card p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-slate-400">
            <span>Recebido no mês ({String(selectedMonth).padStart(2, '0')}/{selectedYear})</span>
            <span className="sf-icon-badge">
              <CalendarCheck size={18} strokeWidth={2} />
            </span>
          </div>
          <div className="font-money text-2xl font-extrabold text-[#0F172A] dark:text-white">
            {formatarValor(currentMonthReceived, hideValues)}
          </div>
          <div className="text-xs text-[#64748B] dark:text-slate-400 flex items-center gap-1.5 font-money">
            {prevMonthInfo.pct === null ? (
              <span className="font-sans">Sem base no mês anterior ({String(prevMonthInfo.prevM).padStart(2, '0')}/{prevMonthInfo.prevY})</span>
            ) : prevMonthInfo.pct >= 0 ? (
              <>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                <span className="text-[#059669] dark:text-[#10B981] font-semibold">
                  +{prevMonthInfo.pct.toFixed(1)}% vs mês anterior
                </span>
              </>
            ) : (
              <>
                <ArrowDownRight className="w-3.5 h-3.5 text-[#DC3545] shrink-0" />
                <span className="text-[#DC3545] dark:text-red-400 font-semibold">
                  {prevMonthInfo.pct.toFixed(1)}% vs mês anterior
                </span>
              </>
            )}
          </div>
        </div>

        <div className="sf-card p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-slate-400">
            <span>Total recebido em {selectedYear}</span>
            <span className="sf-icon-badge sf-icon-badge-navy">
              <Banknote size={18} strokeWidth={2} />
            </span>
          </div>
          <div className="font-money text-2xl font-extrabold text-[#0F172A] dark:text-white">
            {formatarValor(summary.receivedNetTotal, hideValues)}
          </div>
          <div className="font-money text-xs text-[#64748B] dark:text-slate-400">
            Bruto est.: {formatarValor(summary.receivedGrossTotal, hideValues)} · Desc.: {formatarValor(summary.receivedDeductionsTotal, hideValues)}
          </div>
        </div>

        <div className="sf-card p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-slate-400">
            <span>Média mensal ({selectedYear})</span>
            <span className="sf-icon-badge">
              <TrendingUp size={18} strokeWidth={2} />
            </span>
          </div>
          <div className="font-money text-2xl font-extrabold text-[#0F172A] dark:text-white">
            {formatarValor(summary.monthlyAverage, hideValues)}
          </div>
          <div className="font-money text-xs text-[#64748B] dark:text-slate-400">
            {summary.receivedMonthsCount} {summary.receivedMonthsCount === 1 ? 'mês com recebimento' : 'meses com recebimento'}
          </div>
        </div>

        <div className="sf-card p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-[#64748B] dark:text-slate-400">
            <span>Fontes ativas · Conciliação</span>
            <span className="sf-icon-badge sf-icon-badge-navy">
              <Building2 size={18} strokeWidth={2} />
            </span>
          </div>
          <div className="font-money text-2xl font-extrabold text-[#0F172A] dark:text-white">
            {summary.activeSourcesCount}
            <span className="font-sans text-sm font-semibold text-[#64748B] dark:text-slate-400 ml-2">
              {summary.activeSourcesCount === 1 ? 'fonte ativa' : 'fontes ativas'}
            </span>
          </div>
          <div className="font-money text-xs text-[#64748B] dark:text-slate-400">
            {summary.linkedTransactionsCount} registro(s) vinculados ao extrato bancário
          </div>
        </div>
      </div>

      {/* Secondary Indicators Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="sf-card p-4">
          <div className="text-xs text-[#64748B] dark:text-slate-400">Última renda mensal realizada</div>
          <div className="font-money text-lg font-bold text-[#0F172A] dark:text-white mt-1">
            {latestReceivedMonth
              ? formatarValor(latestReceivedMonth.received, hideValues)
              : '—'}
          </div>
          <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            {latestReceivedMonth ? `Referência: ${latestReceivedMonth.label}/${selectedYear}` : 'Nenhum mês confirmado'}
          </div>
        </div>

        <div className="sf-card p-4">
          <div className="text-xs text-[#64748B] dark:text-slate-400">Maior renda mensal ({selectedYear})</div>
          <div className="font-money text-lg font-bold text-[#059669] dark:text-[#10B981] mt-1">
            {summary.highestMonth
              ? formatarValor(summary.highestMonth.total, hideValues)
              : '—'}
          </div>
          <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            {summary.highestMonth ? `Mês de ${summary.highestMonth.label}` : 'Sem lançamentos recebidos'}
          </div>
        </div>

        <div className="sf-card p-4">
          <div className="text-xs text-[#64748B] dark:text-slate-400">Menor renda mensal ({selectedYear})</div>
          <div className="font-money text-lg font-bold text-[#0F172A] dark:text-white mt-1">
            {summary.lowestMonth
              ? formatarValor(summary.lowestMonth.total, hideValues)
              : '—'}
          </div>
          <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            {summary.lowestMonth ? `Mês de ${summary.lowestMonth.label}` : 'Sem lançamentos recebidos'}
          </div>
        </div>

        <div className="sf-card p-4">
          <div className="text-xs text-[#64748B] dark:text-slate-400">Crescimento vs {selectedYear - 1}</div>
          <div className="font-money text-lg font-bold text-[#0F172A] dark:text-white mt-1">
            {previousYearComparison && previousYearComparison.samePeriodGrowthPct !== null
              ? `${previousYearComparison.samePeriodGrowthPct >= 0 ? '+' : ''}${previousYearComparison.samePeriodGrowthPct.toFixed(1)}%`
              : '—'}
          </div>
          <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            {previousYearComparison
              ? previousYearComparison.commonMonths.length > 0
                ? `Mesmos ${previousYearComparison.commonMonths.length} mês(es) em comum`
                : 'Sem meses comuns para comparação'
              : `Sem base cadastrada para ${selectedYear - 1}`}
          </div>
        </div>
      </div>

      {/* Breakdown by Type: Recurring vs Extraordinary vs Expected/Unknown vs Loans */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
              Composição da renda em {selectedYear}
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Separação rigorosa entre renda recorrente, valores extraordinários, pendentes de confirmação e empréstimos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onOpenNewRecord}
              className="min-h-10 px-4 py-2 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              Lançar salário / renda
            </button>
            <button
              type="button"
              onClick={() => onGoToArea('monthly')}
              className="min-h-10 px-4 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-[#0F172A] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              Abrir tabela mensal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-800">
            <div className="text-xs text-[#64748B] dark:text-slate-400">Renda recorrente recebida</div>
            <div className="font-money text-lg font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
              {formatarValor(summary.recurringTotal, hideValues)}
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
              Salário fixo, docência e benefícios
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-800">
            <div className="text-xs text-[#64748B] dark:text-slate-400">Renda extraordinária recebida</div>
            <div className="font-money text-lg font-extrabold text-blue-700 dark:text-blue-400 mt-1">
              {formatarValor(summary.extraordinaryTotal, hideValues)}
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
              13º salário, férias, bônus e extras
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-800">
            <div className="text-xs text-[#64748B] dark:text-slate-400">Previsto e a confirmar</div>
            <div className="font-money text-lg font-extrabold text-amber-700 dark:text-amber-400 mt-1">
              {formatarValor(summary.expectedTotal + summary.unknownTotal, hideValues)}
            </div>
            <div className="font-money text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
              Previsto: {formatarValor(summary.expectedTotal, hideValues)} · A confirmar: {formatarValor(summary.unknownTotal, hideValues)}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-800">
            <div className="text-xs text-[#64748B] dark:text-slate-400">Empréstimos (isolados da renda)</div>
            <div className="font-money text-lg font-extrabold text-slate-700 dark:text-slate-200 mt-1">
              {formatarValor(summary.loanTotal, hideValues)}
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
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
