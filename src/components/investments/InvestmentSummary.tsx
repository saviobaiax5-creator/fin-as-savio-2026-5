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
import { formatPercentBR } from '../../utils/investmentFormatters';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
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
  const { hideValues } = usePrivacy();
  const realAssetsTotal = assets.reduce((acc, a) => acc + (a.currentValue || 0), 0);

  const isDark = theme === 'dark';

  const compositionData = [
    { name: 'Capital inicial', value: Math.max(0, summary.initialAmount), color: isDark ? '#38bdf8' : '#061E3E' },
    { name: 'Aportes', value: Math.max(0, summary.totalContributions), color: '#3b82f6' },
    { name: 'Rendimento líquido', value: Math.max(0, summary.netProfit), color: '#059669' },
    ...(summary.tax.totalTax > 0
      ? [{ name: 'Impostos estimados', value: summary.tax.totalTax, color: '#F5B719' }]
      : []),
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-6">
      {/* Separation notice */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-white/10 bg-[#F8FAFC] dark:bg-[#11185A]/80 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          <strong>Separação patrimonial:</strong> Simulações e projeções não alteram seu patrimônio cadastrado (
          <span className="font-money font-semibold">{formatarValor(realAssetsTotal, hideValues)}</span> em Ativos reais).
        </span>
        <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400 shrink-0">
          {isProjection ? 'Projeção estimada' : 'Base histórica real BCB'} · {productLabel} ({formatPercentBR(cdiPercentage, 1)} CDI)
        </span>
      </div>

      {/* Primary KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Capital inicial</span>
          <div className="font-money text-lg sm:text-xl font-bold text-[#0F172A] dark:text-white mt-1">
            {formatarValor(summary.initialAmount, hideValues)}
          </div>
          <span className="font-money text-[11px] text-[#64748B] dark:text-slate-400 mt-1 block">
            Aportes: {formatarValor(summary.totalContributions, hideValues)}
          </span>
        </div>

        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Saldo bruto</span>
          <div className="font-money text-lg sm:text-xl font-bold text-blue-700 dark:text-blue-400 mt-1">
            {formatarValor(summary.grossValue, hideValues)}
          </div>
          <span className="font-money text-[11px] text-[#64748B] dark:text-slate-400 mt-1 block">
            Rendimento bruto: {hideValues ? formatarValor(summary.grossProfit, true) : `+${formatarValor(summary.grossProfit, false)}`}
          </span>
        </div>

        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Imposto estimado</span>
          <div className="font-money text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            {formatarValor(summary.tax.totalTax, hideValues)}
          </div>
          <span className="text-[11px] text-[#64748B] dark:text-slate-400 mt-1 block">
            {summary.tax.taxExempt
              ? 'Produto isento de IR/IOF'
              : `IR ${(summary.tax.irRate * 100).toFixed(1).replace('.', ',')}%${
                  summary.tax.iofAmount > 0 ? ` + IOF ${(summary.tax.iofRate * 100).toFixed(0)}%` : ''
                }`}
          </span>
        </div>

        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Saldo líquido</span>
          <div className="font-money text-lg sm:text-xl font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
            {formatarValor(summary.netValue, hideValues)}
          </div>
          <span className="font-money text-[11px] text-[#059669]/85 dark:text-[#10B981]/85 mt-1 block">
            Líquido: {hideValues ? formatarValor(summary.netProfit, true) : `+${formatarValor(summary.netProfit, false)}`} · {formatPercentBR(summary.cumulativeYieldPct)}
          </span>
        </div>
      </div>

      {/* Capital composition & comparison quick bridge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="sf-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Composição do Capital Acumulado
            </h3>
            <span className="font-money text-xs text-[#64748B] dark:text-slate-400">
              Total investido: {formatarValor(summary.investedValue, hideValues)}
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
                      backgroundColor: isDark ? '#11185A' : '#ffffff',
                      borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      color: isDark ? '#f8fafc' : '#172536',
                      fontSize: '12px',
                    }}
                    formatter={(val: unknown) => formatarValor(Number(val) || 0, hideValues)}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="sf-card p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Resumo Comparativo vs CDI 100%
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#64748B] dark:text-slate-400">Saldo bruto CDI 100%</span>
                <span className="font-money font-bold text-[#0F172A] dark:text-slate-100">
                  {formatarValor(summary.cdi100GrossValue, hideValues)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#64748B] dark:text-slate-400">
                  Saldo bruto {formatPercentBR(cdiPercentage, 1)} CDI
                </span>
                <span className="font-money font-bold text-[#059669] dark:text-[#10B981]">
                  {formatarValor(summary.grossValue, hideValues)}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#64748B] dark:text-slate-400">Diferença bruta sobre CDI 100%</span>
                <span
                  className={`font-money font-extrabold ${
                    summary.differenceVsCdiGross >= 0
                      ? 'text-[#059669] dark:text-[#10B981]'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {hideValues
                    ? formatarValor(summary.differenceVsCdiGross, true)
                    : `${summary.differenceVsCdiGross >= 0 ? '+' : ''}${formatarValor(summary.differenceVsCdiGross, false)}`}
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#64748B] dark:text-slate-400">Rendimento líquido estimado</span>
                <span className="font-money font-bold text-[#0F172A] dark:text-white">
                  {hideValues
                    ? formatarValor(summary.netProfit, true)
                    : `+${formatarValor(summary.netProfit, false)}`}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#64748B] dark:text-slate-400 leading-relaxed">
              {summary.tax.note}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={onGoToComparator}
              className="flex-1 min-h-11 px-4 rounded-xl border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-xs font-bold text-[#0F172A] dark:text-slate-200 cursor-pointer whitespace-nowrap transition-colors"
            >
              Abrir Comparador Real
            </button>
            <button
              type="button"
              onClick={onGoToSimulator}
              className="flex-1 min-h-11 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap transition-colors"
            >
              Ajustar no Simulador
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
