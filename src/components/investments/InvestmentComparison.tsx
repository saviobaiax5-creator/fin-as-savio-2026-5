import React, { useMemo } from 'react';
import {
  CDIRate,
  InvestmentFilterPeriod,
  InvestmentProductType,
} from '../../types/investment';
import {
  buildHistoricalComparisonWithContributions,
  compareInvestments,
  parseDailyCdiRates,
} from '../../services/investmentCalculator';
import {
  PRODUCT_TYPE_LABELS,
  formatPercentBR,
} from '../../utils/investmentFormatters';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import GraficoComparativo, { ChartPoint } from './GraficoComparativo';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface InvestmentComparisonProps {
  rates: CDIRate[];
  loading: boolean;
  error: string | null;
  periodFilter: InvestmentFilterPeriod;
  setPeriodFilter: (p: InvestmentFilterPeriod) => void;
  customStartIso: string;
  customEndIso: string;
  setCustomStartIso: (v: string) => void;
  setCustomEndIso: (v: string) => void;
  initialAmount: number;
  setInitialAmount: (v: number) => void;
  monthlyContribution: number;
  setMonthlyContribution: (v: number) => void;
  cdbPercentage: number;
  setCdbPercentage: (v: number) => void;
  productType: InvestmentProductType;
  setProductType: (t: InvestmentProductType) => void;
  onRefresh: () => void;
  theme: 'light' | 'dark';
}

const PERIOD_OPTIONS: Array<{ id: InvestmentFilterPeriod; label: string }> = [
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: '6m', label: '6 meses' },
  { id: '12m', label: '12 meses' },
  { id: '24m', label: '24 meses' },
  { id: '5y', label: '5 anos' },
  { id: 'custom', label: 'Personalizado' },
];

export const InvestmentComparison: React.FC<InvestmentComparisonProps> = ({
  rates,
  loading,
  error,
  periodFilter,
  setPeriodFilter,
  customStartIso,
  customEndIso,
  setCustomStartIso,
  setCustomEndIso,
  initialAmount,
  setInitialAmount,
  monthlyContribution,
  setMonthlyContribution,
  cdbPercentage,
  setCdbPercentage,
  productType,
  setProductType,
  onRefresh,
  theme,
}) => {
  const { hideValues } = usePrivacy();
  const safeInitial = Number.isFinite(initialAmount) && initialAmount >= 0 ? initialAmount : 0;
  const safeContrib =
    Number.isFinite(monthlyContribution) && monthlyContribution >= 0 ? monthlyContribution : 0;
  const safePct = Number.isFinite(cdbPercentage) && cdbPercentage >= 0 ? cdbPercentage : 100;

  const summary = useMemo(() => {
    return buildHistoricalComparisonWithContributions({
      initialAmount: safeInitial,
      monthlyContribution: safeContrib,
      cdiPercentage: safePct,
      rates,
      productType,
    });
  }, [safeInitial, safeContrib, safePct, rates, productType]);

  // Pure base comparison without contributions to show rate leverage cleanly
  const pureComparison = useMemo(() => {
    if (rates.length === 0) return null;
    try {
      const dailyRates = parseDailyCdiRates(rates);
      return {
        c100: compareInvestments(safeInitial, dailyRates, 100),
        c110: compareInvestments(safeInitial, dailyRates, 110),
        c115: compareInvestments(safeInitial, dailyRates, 115),
        c120: compareInvestments(safeInitial, dailyRates, 120),
        selected: compareInvestments(safeInitial, dailyRates, safePct),
      };
    } catch {
      return null;
    }
  }, [rates, safeInitial, safePct]);

  const chartData: ChartPoint[] = useMemo(() => {
    return summary.timeline.map((pt) => ({
      date: pt.label,
      cdi: pt.cdiValue,
      cdb: pt.cdbValue,
      invested: pt.investedAmount,
    }));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* Period filter + controls */}
      <div className="sf-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
              Comparador Histórico Real · CDI × {productType}
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Calculado dia a dia sobre a série histórica oficial do CDI (Banco Central SGS 12).
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-10 px-3.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-xs font-semibold text-[#0F172A] dark:text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Consultando BCB...' : 'Atualizar BCB'}
          </button>
        </div>

        {/* Period chips */}
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPeriodFilter(opt.id)}
              className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                periodFilter === opt.id
                  ? 'bg-[#061E3E] dark:bg-[#059669] text-white'
                  : 'bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {periodFilter === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Data inicial
              </label>
              <input
                type="date"
                value={customStartIso}
                onChange={(e) => setCustomStartIso(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white min-h-11"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Data final
              </label>
              <input
                type="date"
                value={customEndIso}
                onChange={(e) => setCustomEndIso(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white min-h-11"
              />
            </div>
          </div>
        )}

        {/* Numeric parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Capital inicial (R$)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={initialAmount}
              onChange={(e) => setInitialAmount(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Aporte mensal opcional (R$)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={monthlyContribution}
              onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Percentual do CDI (%)
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0"
                step="0.5"
                value={cdbPercentage}
                onChange={(e) => setCdbPercentage(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
            </div>
            <div className="flex gap-1 mt-1.5">
              {[100, 110, 115, 120].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setCdbPercentage(pct)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    cdbPercentage === pct
                      ? 'bg-[#059669] text-white'
                      : 'bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-[#64748B] dark:text-slate-300'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Regra tributária
            </label>
            <select
              value={productType}
              onChange={(e) => setProductType(e.target.value as InvestmentProductType)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white min-h-11"
            >
              {(Object.keys(PRODUCT_TYPE_LABELS) as InvestmentProductType[]).map((key) => (
                <option key={key} value={key}>
                  {PRODUCT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/60 p-4 text-xs sm:text-sm text-red-700 dark:text-red-300 flex items-center gap-2.5">
          <AlertCircle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Comparative chart */}
      <GraficoComparativo
        data={chartData}
        cdbLabel={`${productType} ${formatPercentBR(safePct, 1)} CDI`}
        title={`Evolução real · CDI 100% × ${productType} ${formatPercentBR(safePct, 1)} CDI`}
        showInvested={safeContrib > 0}
        theme={theme}
      />

      {/* Real benchmark table */}
      {pureComparison && (
        <div className="sf-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Faixas comparativas no período (capital único de {formatarValor(safeInitial, hideValues)})
            </h3>
            <span className="font-money text-xs text-[#64748B] dark:text-slate-400">{rates.length} dias úteis BCB</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-800/60 text-[#64748B] dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-5 font-semibold">Referência</th>
                  <th className="py-3 px-5 font-semibold text-right">Saldo Bruto</th>
                  <th className="py-3 px-5 font-semibold text-right">Rendimento Bruto</th>
                  <th className="py-3 px-5 font-semibold text-right">Ganho vs CDI 100%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-money">
                {[
                  { label: 'CDI 100%', val: pureComparison.c100.cdi, profit: pureComparison.c100.cdiProfit, diff: 0 },
                  {
                    label: 'CDB 110% CDI',
                    val: pureComparison.c110.cdb,
                    profit: pureComparison.c110.cdbProfit,
                    diff: pureComparison.c110.difference,
                  },
                  {
                    label: 'CDB 115% CDI',
                    val: pureComparison.c115.cdb,
                    profit: pureComparison.c115.cdbProfit,
                    diff: pureComparison.c115.difference,
                  },
                  {
                    label: 'CDB 120% CDI',
                    val: pureComparison.c120.cdb,
                    profit: pureComparison.c120.cdbProfit,
                    diff: pureComparison.c120.difference,
                  },
                  ...(![100, 110, 115, 120].includes(safePct)
                    ? [
                        {
                          label: `Seu cenário (${formatPercentBR(safePct, 1)} CDI)`,
                          val: pureComparison.selected.cdb,
                          profit: pureComparison.selected.cdbProfit,
                          diff: pureComparison.selected.difference,
                        },
                      ]
                    : []),
                ].map((row) => (
                  <tr key={row.label} className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5 font-sans font-bold text-[#0F172A] dark:text-white">{row.label}</td>
                    <td className="py-3.5 px-5 text-right font-bold text-[#0F172A] dark:text-slate-100">
                      {formatarValor(row.val, hideValues)}
                    </td>
                    <td className="py-3.5 px-5 text-right font-semibold text-[#059669] dark:text-[#10B981]">
                      {hideValues ? formatarValor(row.profit, true) : `+${formatarValor(row.profit, false)}`}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold text-blue-700 dark:text-blue-400">
                      {hideValues
                        ? formatarValor(row.diff, true)
                        : `${row.diff >= 0 ? '+' : ''}${formatarValor(row.diff, false)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
