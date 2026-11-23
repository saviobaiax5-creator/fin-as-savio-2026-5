import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { SalaryRecord, SalarySource } from '../../types/salary';
import {
  buildMonthlyEvolutionSeries,
  compareYearsSamePeriod,
  getAnnualTotal,
  getSourceAnnualTotal,
} from '../../utils/salaryCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';

interface SalaryChartsProps {
  sources: SalarySource[];
  records: SalaryRecord[];
  selectedYear: number;
  availableYears: number[];
  theme?: 'light' | 'dark';
}

const CHART_COLORS = [
  '#059669',
  '#2563eb',
  '#F5B719',
  '#0d9488',
  '#4f46e5',
  '#e11d48',
  '#65a30d',
  '#7c3aed',
];

export const SalaryCharts: React.FC<SalaryChartsProps> = ({
  sources,
  records,
  selectedYear,
  availableYears,
  theme = 'light',
}) => {
  const { hideValues } = usePrivacy();
  const [compareYearA, setCompareYearA] = useState<number>(() =>
    availableYears.length >= 2 ? availableYears[availableYears.length - 2] : selectedYear
  );
  const [compareYearB, setCompareYearB] = useState<number>(selectedYear);

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#11185A' : '#ffffff',
    borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#cbd5e1',
    borderRadius: '0.75rem',
    color: isDark ? '#f8fafc' : '#172536',
    fontSize: '12px',
  };

  // Chart 1 & 4: Monthly Evolution & Variation %
  const monthlySeries = useMemo(
    () => buildMonthlyEvolutionSeries(records, sources, selectedYear),
    [records, sources, selectedYear]
  );

  // Chart 2: Annual Evolution
  const annualSeries = useMemo(() => {
    return availableYears.map((yr) => ({
      year: String(yr),
      total: getAnnualTotal(records, yr, sources),
    }));
  }, [records, sources, availableYears]);

  // Chart 3: Distribution by Institution (non-loan sources with positive received total)
  const institutionShare = useMemo(() => {
    const items = sources
      .filter((s) => s.category !== 'loan')
      .map((s) => ({
        name: s.name,
        value: getSourceAnnualTotal(records, s.id, selectedYear),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);

    const grandTotal = items.reduce((acc, i) => acc + i.value, 0);
    return items.map((i) => ({
      ...i,
      pct: grandTotal > 0 ? (i.value / grandTotal) * 100 : 0,
    }));
  }, [sources, records, selectedYear]);

  // Chart 5: Same-period comparison across years
  const yearComparison = useMemo(
    () => compareYearsSamePeriod(records, sources, compareYearA, compareYearB),
    [records, sources, compareYearA, compareYearB]
  );

  const hasMonthlyValues = monthlySeries.some((m) => m.received > 0 || m.expected > 0);

  return (
    <div className="space-y-6">
      {/* Gráfico 1: Evolução Mensal */}
      <div className="sf-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
              Evolução mensal líquida ({selectedYear})
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Soma dos salários recebidos separada em renda recorrente vs extraordinária.
            </p>
          </div>
        </div>

        {!hasMonthlyValues ? (
          <div className="h-[260px] flex items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-slate-700 text-xs text-[#64748B] px-4 text-center">
            Nenhum rendimento recebido registrado em {selectedYear} para exibir a evolução mensal.
          </div>
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 11 }}
                  tickLine={false}
                  width={82}
                  tickFormatter={(v: number) =>
                    hideValues
                      ? 'R$ •••'
                      : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [
                    formatarValor(Number(value) || 0, hideValues),
                    String(name || ''),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="recurring" name="Renda recorrente" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="extraordinary" name="13º, Férias e Extras" stackId="a" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expected" name="Previsto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Grid: Chart 2 (Evolução Anual) + Chart 3 (Por Instituição) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sf-card p-5">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white mb-1">
            Evolução anual recebida
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mb-4">
            Total consolidado em cada ano cadastrado.
          </p>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={annualSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="year" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 11 }}
                  tickLine={false}
                  width={82}
                  tickFormatter={(v: number) =>
                    hideValues
                      ? 'R$ •••'
                      : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown) => [
                    formatarValor(Number(value) || 0, hideValues),
                    'Total recebido',
                  ]}
                />
                <Bar dataKey="total" name="Total anual recebido" fill={isDark ? '#38bdf8' : '#061E3E'} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sf-card p-5">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white mb-1">
            Participação por instituição ({selectedYear})
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mb-4">
            Representatividade de cada fonte na renda líquida recebida.
          </p>

          {institutionShare.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] dark:border-slate-700 text-xs text-[#64748B]">
              Sem recebimentos confirmados em {selectedYear}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={institutionShare}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={2}
                    >
                      {institutionShare.map((entry, idx) => (
                        <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: unknown) => [
                        formatarValor(Number(value) || 0, hideValues),
                        'Recebido',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 text-xs">
                {institutionShare.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-200 font-medium">
                        {item.name}
                      </span>
                    </div>
                    <span className="font-money font-bold text-[#0F172A] dark:text-white shrink-0">
                      {item.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid: Chart 4 (Variação Mensal %) + Chart 5 (Comparação Anual Mesmo Período) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sf-card p-5">
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white mb-1">
            Variação mensal (%) em {selectedYear}
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mb-4">
            Oscilação percentual mês a mês sobre o total líquido recebido.
          </p>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 11 }}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown) =>
                    value === null || value === undefined
                      ? ['Sem base anterior', 'Variação']
                      : [`${Number(value).toFixed(2)}%`, 'Variação']
                  }
                />
                <Line
                  type="monotone"
                  dataKey="variationPct"
                  name="Variação mensal (%)"
                  stroke="#F5B719"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sf-card p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                Comparação entre anos (mesmo período)
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Confronto mês a mês destacando diferenças de cobertura.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <select
                aria-label="Ano base para comparação"
                value={compareYearA}
                onChange={(e) => setCompareYearA(Number(e.target.value))}
                className="min-h-9 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {availableYears.map((yr) => (
                  <option key={`a-${yr}`} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">×</span>
              <select
                aria-label="Ano comparado"
                value={compareYearB}
                onChange={(e) => setCompareYearB(Number(e.target.value))}
                className="min-h-9 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                {availableYears.map((yr) => (
                  <option key={`b-${yr}`} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {yearComparison.isIncompleteComparison && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] tabular-nums">
              Comparação parcial: {compareYearA} possui {yearComparison.monthsWithDataA} mês(es) recebido(s) e {compareYearB} possui {yearComparison.monthsWithDataB}. Base equivalente ({yearComparison.commonMonths.length} mês(es) em comum): {formatarValor(yearComparison.sameMonthsTotalA, hideValues)} × {formatarValor(yearComparison.sameMonthsTotalB, hideValues)}.
            </div>
          )}

          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={yearComparison.monthlyRows}
                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fill: tickColor, fontSize: 11 }} tickLine={false} />
                <YAxis
                  tick={{ fill: tickColor, fontSize: 11 }}
                  tickLine={false}
                  width={78}
                  tickFormatter={(v: number) =>
                    hideValues
                      ? 'R$ •••'
                      : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: unknown, name: unknown) => [
                    formatarValor(Number(value) || 0, hideValues),
                    String(name || ''),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="yearAValue"
                  name={String(compareYearA)}
                  stroke="#64748b"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="yearBValue"
                  name={String(compareYearB)}
                  stroke="#059669"
                  strokeWidth={2.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
