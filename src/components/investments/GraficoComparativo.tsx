import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';

export interface ChartPoint {
  date: string;
  label?: string;
  cdi: number;
  cdb: number;
  invested?: number;
}

export type ChartDisplayMode = 'currency' | 'percent';

export function buildComparativeChartSeries(
  data: ChartPoint[],
  mode: ChartDisplayMode
): ChartPoint[] {
  if (mode === 'currency' || data.length === 0) {
    return data;
  }

  const fallbackBase =
    typeof data[0].invested === 'number' && data[0].invested > 0
      ? data[0].invested
      : data[0].cdi > 0
        ? data[0].cdi
        : 100;

  return data.map((pt) => {
    const base =
      typeof pt.invested === 'number' && pt.invested > 0 ? pt.invested : fallbackBase;
    const cdiPct = base > 0 ? Number((((pt.cdi - base) / base) * 100).toFixed(2)) : 0;
    const cdbPct = base > 0 ? Number((((pt.cdb - base) / base) * 100).toFixed(2)) : 0;
    return {
      ...pt,
      cdi: cdiPct,
      cdb: cdbPct,
      invested: 0,
    };
  });
}

interface GraficoComparativoProps {
  data: ChartPoint[];
  cdbLabel?: string;
  title?: string;
  showInvested?: boolean;
  theme?: 'light' | 'dark';
  defaultMode?: ChartDisplayMode;
}

export default function GraficoComparativo({
  data,
  cdbLabel = 'CDB',
  title = 'Evolução CDI × CDB',
  showInvested = false,
  theme = 'light',
  defaultMode = 'currency',
}: GraficoComparativoProps) {
  const { hideValues } = usePrivacy();
  const [mode, setMode] = useState<ChartDisplayMode>(defaultMode);

  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#334155' : '#e2e8f0';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipBg = isDark ? '#11185A' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.16)' : '#cbd5e1';
  const tooltipText = isDark ? '#f8fafc' : '#172536';

  const chartSeries = useMemo(
    () => buildComparativeChartSeries(data, mode),
    [data, mode]
  );

  const isPercentMode = mode === 'percent';

  return (
    <div className="sf-card w-full p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">{title}</h3>
          <span className="font-money text-xs text-[#64748B] dark:text-slate-400">
            {data.length} ponto{data.length === 1 ? '' : 's'} calculado{data.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          role="group"
          aria-label="Modo de exibição do gráfico"
          className="inline-flex rounded-xl bg-[#F8FAFC] dark:bg-slate-800 p-1 border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold"
        >
          <button
            type="button"
            onClick={() => setMode('currency')}
            className={`px-3 min-h-8 rounded-lg transition-colors cursor-pointer ${
              mode === 'currency'
                ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-white/15'
                : 'text-[#64748B] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Valor (R$)
          </button>
          <button
            type="button"
            onClick={() => setMode('percent')}
            className={`px-3 min-h-8 rounded-lg transition-colors cursor-pointer ${
              mode === 'percent'
                ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-white/15'
                : 'text-[#64748B] dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Rentabilidade (%)
          </button>
        </div>
      </div>

      {chartSeries.length === 0 ? (
        <div className="h-[300px] w-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-500 dark:text-slate-400 px-4 text-center">
          Aguardando dados reais do CDI ou parâmetros de simulação para gerar o gráfico comparativo.
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartSeries} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis
                dataKey="date"
                tick={{ fill: tickColor, fontSize: 11 }}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: tickColor, fontSize: 11 }}
                tickLine={false}
                width={isPercentMode ? 64 : 86}
                tickFormatter={(value: number) =>
                  isPercentMode
                    ? `${Number(value).toFixed(2).replace('.', ',')}%`
                    : hideValues
                      ? 'R$ •••'
                      : `R$ ${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: tooltipBg,
                  borderColor: tooltipBorder,
                  borderRadius: '0.75rem',
                  color: tooltipText,
                  fontSize: '12px',
                }}
                formatter={(value: unknown, name: unknown) => [
                  isPercentMode
                    ? `${(Number(value) || 0).toFixed(2).replace('.', ',')}%`
                    : formatarValor(Number(value) || 0, hideValues),
                  String(name || ''),
                ]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />

              {showInvested && !isPercentMode && (
                <Line
                  type="monotone"
                  dataKey="invested"
                  name="Total aportado"
                  stroke={isDark ? '#94a3b8' : '#64748b'}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}

              <Line
                type="monotone"
                dataKey="cdi"
                name="CDI 100%"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />

              <Line
                type="monotone"
                dataKey="cdb"
                name={cdbLabel}
                stroke="#059669"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
