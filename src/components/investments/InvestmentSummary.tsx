import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';
import { MonthlySimulationSummary } from '../../types/investment';
import { formatBRL, formatPercentBR } from '../../utils/investmentFormatters';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { Asset } from '../../types';

interface InvestmentSummaryProps {
  summary: MonthlySimulationSummary;
  assets: Asset[];
  isProjection: boolean;
  cdiPercentage: number;
  productLabel: string;
  theme: 'light' | 'dark';
  onGoToSimulator: () => void;
  onGoToComparator: () => void;
}

export const InvestmentSummary: React.FC<InvestmentSummaryProps> = ({
  summary,
  assets,
  isProjection,
  cdiPercentage,
  productLabel,
  theme,
  onGoToSimulator,
  onGoToComparator,
}) => {
  const realAssetsTotal = assets.reduce((acc, a) => acc + (a.currentValue || 0), 0);

  const compositionData = [
    { name: 'Capital inicial', value: Math.max(0, summary.initialAmount), color: '#082B5C' },
    { name: 'Aportes', value: Math.max(0, summary.totalContributions), color: '#3b82f6' },
    { name: 'Rendimento líquido', value: Math.max(0, summary.netProfit), color: '#00A65A' },
    ...(summary.tax.totalTax > 0
      ? [{ name: 'Impostos estimados', value: summary.tax.totalTax, color: '#F5B719' }]
      : []),
  ].filter((item) => item.value > 0);

  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      {/* Separation notice */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          <strong>Separação patrimonial:</strong> Simulações e projeções não alteram seu patrimônio cadastrado (
          <span className="font-semibold tabular-nums">R$ {formatCurrencyBRL(realAssetsTotal)}</span> em Ativos reais).
        </span>
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
          {isProjection ? 'Projeção estimada' : 'Base histórica real BCB'} · {productLabel} ({formatPercentBR(cdiPercentage, 1)} CDI)
        </span>
      </div>

      {/* Primary KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">Capital inicial</span>
          <div className="text-lg sm:text-xl font-bold text-[#082B5C] dark:text-white mt-1 tabular-nums">
            {formatBRL(summary.initialAmount)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block tabular-nums">
            Aportes: {formatBRL(summary.totalContributions)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">Saldo bruto</span>
          <div className="text-lg sm:text-xl font-bold text-blue-700 dark:text-blue-400 mt-1 tabular-nums">
            {formatBRL(summary.grossValue)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block tabular-nums">
            Rendimento bruto: +{formatBRL(summary.grossProfit)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">Imposto estimado</span>
          <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
            {formatBRL(summary.tax.totalTax)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {summary.tax.taxExempt
              ? 'Produto isento de IR/IOF'
              : `IR ${(summary.tax.irRate * 100).toFixed(1).replace('.', ',')}%${
                  summary.tax.iofAmount > 0 ? ` + IOF ${(summary.tax.iofRate * 100).toFixed(0)}%` : ''
                }`}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <span className="text-xs text-slate-500 dark:text-slate-400">Saldo líquido</span>
          <div className="text-lg sm:text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
            {formatBRL(summary.netValue)}
          </div>
          <span className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1 block tabular-nums">
            Líquido: +{formatBRL(summary.netProfit)} · {formatPercentBR(summary.cumulativeYieldPct)}
          </span>
        </div>
      </div>

      {/* Capital composition & comparison quick bridge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
              Composição do Capital Acumulado
            </h3>
            <span className="text-xs text-slate-400 tabular-nums">
              Total investido: {formatBRL(summary.investedValue)}
            </span>
          </div>

          {compositionData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-xs text-slate-400">
              Informe valores positivos para visualizar a composição.
            </div>
          ) : (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={compositionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {compositionData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#061B3B' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      color: isDark ? '#f8fafc' : '#172536',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => formatBRL(Number(val) || 0)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
              Resumo Comparativo vs CDI 100%
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Saldo bruto CDI 100%</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                  {formatBRL(summary.cdi100GrossValue)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">
                  Saldo bruto {formatPercentBR(cdiPercentage, 1)} CDI
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatBRL(summary.grossValue)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Diferença bruta sobre CDI 100%</span>
                <span
                  className={`font-extrabold tabular-nums ${
                    summary.differenceVsCdiGross >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {summary.differenceVsCdiGross >= 0 ? '+' : ''}
                  {formatBRL(summary.differenceVsCdiGross)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Rendimento líquido estimado</span>
                <span className="font-bold text-[#082B5C] dark:text-white tabular-nums">
                  +{formatBRL(summary.netProfit)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {summary.tax.note}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onGoToComparator}
              className="flex-1 min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              Abrir Comparador Real
            </button>
            <button
              type="button"
              onClick={onGoToSimulator}
              className="flex-1 min-h-11 px-4 rounded-xl bg-[#082B5C] dark:bg-emerald-600 hover:opacity-95 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Ajustar no Simulador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
