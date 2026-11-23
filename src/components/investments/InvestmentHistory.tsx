import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { InvestmentSimulation } from '../../types/investment';
import {
  formatPercentBR,
  formatIsoDateTimePtBr,
} from '../../utils/investmentFormatters';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { Sheet } from '../Sheet';
import { Copy, Pencil, Trash2, ArrowUpRight, Layers } from 'lucide-react';

interface InvestmentHistoryProps {
  simulations: InvestmentSimulation[];
  onRenameSimulation: (id: string, newName: string) => void;
  onDuplicateSimulation: (sim: InvestmentSimulation) => void;
  onDeleteSimulation: (id: string) => void;
  onLoadSimulation: (sim: InvestmentSimulation) => void;
  theme: 'light' | 'dark';
}

export const InvestmentHistory: React.FC<InvestmentHistoryProps> = ({
  simulations,
  onRenameSimulation,
  onDuplicateSimulation,
  onDeleteSimulation,
  onLoadSimulation,
  theme,
}) => {
  const { hideValues } = usePrivacy();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renamingSim, setRenamingSim] = useState<InvestmentSimulation | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id].slice(-4)
    );
  };

  const comparedSimulations = useMemo(() => {
    if (selectedIds.length > 0) {
      return simulations.filter((s) => selectedIds.includes(s.id));
    }
    return simulations.slice(0, 3);
  }, [simulations, selectedIds]);

  const compareChartData = useMemo(() => {
    return comparedSimulations.map((s) => ({
      name: s.name.length > 18 ? `${s.name.slice(0, 16)}…` : s.name,
      invested: s.investedValue,
      netProfit: s.netProfit,
      tax: s.estimatedTax,
    }));
  }, [comparedSimulations]);

  const isDark = theme === 'dark';

  return (
    <div className="space-y-6">
      <div className="sf-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
              Histórico de Simulações Salvas ({simulations.length})
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Cenários salvos no dispositivo para comparação. Nunca são duplicados no patrimônio real.
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs font-semibold text-slate-600 dark:text-slate-300 underline cursor-pointer"
            >
              Limpar seleção ({selectedIds.length})
            </button>
          )}
        </div>

        {simulations.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma simulação salva ainda. Crie e salve um cenário na aba Simulador.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {simulations.map((sim) => {
              const checked = selectedIds.includes(sim.id);
              return (
                <div
                  key={sim.id}
                  className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(sim.id)}
                      aria-label={`Selecionar ${sim.name} para comparar`}
                      className="mt-1 accent-emerald-600 cursor-pointer shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-display font-bold text-sm text-[#0F172A] dark:text-white truncate">
                        {sim.name}
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                        {sim.productType} · {formatPercentBR(sim.cdiPercentage, 1)} CDI · Inicial{' '}
                        {formatarValor(sim.initialAmount, hideValues)} · Aporte {formatarValor(sim.monthlyContribution, hideValues)}/mês ·{' '}
                        {sim.days} dias
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                        Atualizado em {formatIsoDateTimePtBr(sim.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-4">
                    <div className="text-left md:text-right font-money">
                      <div className="text-sm font-extrabold text-[#059669] dark:text-[#10B981]">
                        Líquido: {formatarValor(sim.netValue, hideValues)}
                      </div>
                      <div className="text-xs text-[#64748B] dark:text-slate-400">
                        Bruto: {formatarValor(sim.grossValue, hideValues)} · IR/IOF: {formatarValor(sim.estimatedTax, hideValues)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onLoadSimulation(sim)}
                        className="px-3 min-h-9 rounded-lg bg-[#ECFDF5] dark:bg-emerald-950/60 text-[#059669] dark:text-[#10B981] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        title="Carregar no simulador"
                      >
                        <ArrowUpRight size={14} /> Abrir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingSim(sim);
                          setRenameInput(sim.name);
                        }}
                        className="min-w-9 min-h-9 grid place-items-center text-slate-400 hover:text-[#0F172A] dark:hover:text-white rounded-lg cursor-pointer"
                        aria-label={`Renomear ${sim.name}`}
                        title="Renomear cenário"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateSimulation(sim)}
                        className="min-w-9 min-h-9 grid place-items-center text-slate-400 hover:text-blue-600 rounded-lg cursor-pointer"
                        aria-label={`Duplicar ${sim.name}`}
                        title="Duplicar cenário"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSimulation(sim.id)}
                        className="min-w-9 min-h-9 grid place-items-center text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                        aria-label={`Excluir ${sim.name}`}
                        title="Excluir cenário"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-scenario comparison chart */}
      {comparedSimulations.length >= 2 && (
        <div className="sf-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="sf-icon-badge shrink-0">
              <Layers size={18} />
            </span>
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Comparação Visual entre Cenários ({comparedSimulations.length})
            </h3>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareChartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                <YAxis
                  width={84}
                  tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    hideValues
                      ? 'R$ •••'
                      : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#11185A' : '#ffffff',
                    borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#cbd5e1',
                    borderRadius: '0.75rem',
                    color: isDark ? '#f8fafc' : '#172536',
                    fontSize: '12px',
                  }}
                  formatter={(v: unknown, name: unknown) => [
                    formatarValor(Number(v) || 0, hideValues),
                    String(name || ''),
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="invested" name="Total investido" stackId="a" fill={isDark ? '#38bdf8' : '#061E3E'} />
                <Bar dataKey="netProfit" name="Rendimento líquido" stackId="a" fill="#059669" />
                <Bar dataKey="tax" name="Imposto estimado" stackId="a" fill="#F5B719" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Rename Sheet */}
      <Sheet
        open={Boolean(renamingSim)}
        onClose={() => setRenamingSim(null)}
        title="Renomear cenário"
        subtitle={renamingSim?.name}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!renamingSim || !renameInput.trim()) return;
            onRenameSimulation(renamingSim.id, renameInput.trim());
            setRenamingSim(null);
          }}
          className="space-y-4"
        >
          <input
            type="text"
            required
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            placeholder="Novo nome da simulação"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white min-h-12"
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRenamingSim(null)}
              className="flex-1 min-h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[1.5] min-h-11 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer transition-colors"
            >
              Salvar nome
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
};
