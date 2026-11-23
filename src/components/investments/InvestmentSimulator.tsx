import React, { useEffect, useMemo, useState } from 'react';
import {
  InvestmentProductType,
  InvestmentSimulation,
} from '../../types/investment';
import { simulateProjectedInvestment } from '../../services/investmentCalculator';
import {
  PRODUCT_TYPE_LABELS,
  formatPercentBR,
} from '../../utils/investmentFormatters';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { todayLocal } from '../../utils/dateUtils';
import GraficoComparativo, { ChartPoint } from './GraficoComparativo';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';

export interface SimulatorFormState {
  name: string;
  productType: InvestmentProductType;
  initialAmount: number;
  monthlyContribution: number;
  cdiPercentage: number;
  months: number;
  annualCdiPercent: number;
}

interface InvestmentSimulatorProps {
  realAnnualCdiPercent: number | null;
  cdiLastDate?: string;
  initialPreset?: Partial<SimulatorFormState>;
  onSaveSimulation: (sim: Omit<InvestmentSimulation, 'id' | 'createdAt' | 'updatedAt'>) => void;
  theme: 'light' | 'dark';
}

export default function InvestmentSimulator({
  realAnnualCdiPercent,
  cdiLastDate,
  initialPreset,
  onSaveSimulation,
  theme,
}: InvestmentSimulatorProps) {
  const { hideValues } = usePrivacy();
  const [form, setForm] = useState<SimulatorFormState>({
    name: initialPreset?.name || 'Reserva CDB 115% CDI',
    productType: initialPreset?.productType || 'CDB',
    initialAmount: initialPreset?.initialAmount ?? 1000,
    monthlyContribution: initialPreset?.monthlyContribution ?? 250,
    cdiPercentage: initialPreset?.cdiPercentage ?? 115,
    months: initialPreset?.months ?? 12,
    annualCdiPercent: initialPreset?.annualCdiPercent ?? realAnnualCdiPercent ?? 10.65,
  });

  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (initialPreset) {
      setForm((prev) => ({
        ...prev,
        ...initialPreset,
      }));
    }
  }, [initialPreset]);

  useEffect(() => {
    if (realAnnualCdiPercent !== null && realAnnualCdiPercent > 0 && !initialPreset?.annualCdiPercent) {
      setForm((prev) => ({ ...prev, annualCdiPercent: realAnnualCdiPercent }));
    }
  }, [realAnnualCdiPercent, initialPreset?.annualCdiPercent]);

  const updateField = <K extends keyof SimulatorFormState>(
    field: K,
    value: SimulatorFormState[K]
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const simulation = useMemo(() => {
    try {
      return simulateProjectedInvestment({
        initialAmount: Math.max(0, Number(form.initialAmount) || 0),
        monthlyContribution: Math.max(0, Number(form.monthlyContribution) || 0),
        cdiPercentage: Math.max(0, Number(form.cdiPercentage) || 0),
        annualCdiPercent: Math.max(0, Number(form.annualCdiPercent) || 0),
        months: Math.min(600, Math.max(1, Math.round(Number(form.months) || 1))),
        productType: form.productType,
        startDateIso: todayLocal(),
      });
    } catch {
      return null;
    }
  }, [form]);

  const chartData: ChartPoint[] = useMemo(() => {
    if (!simulation) return [];
    return simulation.timeline.map((pt) => ({
      date: pt.label,
      cdi: pt.cdiValue,
      cdb: pt.cdbValue,
      invested: pt.investedAmount,
    }));
  }, [simulation]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!simulation) return;
    const startIso = todayLocal();
    const endDt = new Date(`${startIso}T00:00:00`);
    endDt.setMonth(endDt.getMonth() + Math.max(1, Math.round(form.months)));
    const endIso = `${endDt.getFullYear()}-${String(endDt.getMonth() + 1).padStart(2, '0')}-${String(
      endDt.getDate()
    ).padStart(2, '0')}`;

    onSaveSimulation({
      name: form.name.trim() || `Cenário ${form.productType} ${form.cdiPercentage}% CDI`,
      productType: form.productType,
      initialAmount: simulation.initialAmount,
      monthlyContribution: Number(form.monthlyContribution) || 0,
      cdiPercentage: Number(form.cdiPercentage) || 100,
      startDate: startIso,
      endDate: endIso,
      days: simulation.tax.days,
      annualReferenceCdi: Number(form.annualCdiPercent) || 0,
      grossValue: simulation.grossValue,
      investedValue: simulation.investedValue,
      grossProfit: simulation.grossProfit,
      estimatedIof: simulation.tax.iofAmount,
      estimatedIr: simulation.tax.irAmount,
      estimatedTax: simulation.tax.totalTax,
      netValue: simulation.netValue,
      netProfit: simulation.netProfit,
      taxExempt: simulation.tax.taxExempt,
      dataSource: 'PROJECAO_CDI',
      cdiReferenceDate: cdiLastDate,
    });

    setSavedFeedback('Simulação salva no histórico local. Ela não altera o patrimônio cadastrado.');
    setTimeout(() => setSavedFeedback(null), 4500);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Form Card */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-5 space-y-4 sf-card p-5"
        >
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
              Simulador de Rentabilidade
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
              Projeção estimada com capitalização composta diária e tributação regressiva aplicável.
            </p>
          </div>

          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Nome do cenário
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Ex.: Reserva CDB 115% CDI"
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white min-h-11"
            />
          </label>

          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Produto financeiro
            <select
              value={form.productType}
              onChange={(e) => updateField('productType', e.target.value as InvestmentProductType)}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-white min-h-11"
            >
              {(Object.keys(PRODUCT_TYPE_LABELS) as InvestmentProductType[]).map((key) => (
                <option key={key} value={key}>
                  {PRODUCT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Valor inicial (R$)
              <input
                type="number"
                min="0"
                step="100"
                value={form.initialAmount}
                onChange={(e) => updateField('initialAmount', Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Aporte mensal (R$)
              <input
                type="number"
                min="0"
                step="50"
                value={form.monthlyContribution}
                onChange={(e) =>
                  updateField('monthlyContribution', Math.max(0, Number(e.target.value) || 0))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Percentual do CDI (%)
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.cdiPercentage}
                onChange={(e) => updateField('cdiPercentage', Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Prazo em meses
              <input
                type="number"
                min="1"
                max="600"
                value={form.months}
                onChange={(e) =>
                  updateField('months', Math.min(600, Math.max(1, Number(e.target.value) || 1)))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Taxa CDI anual de referência (% a.a.)
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.05"
                value={form.annualCdiPercent}
                onChange={(e) =>
                  updateField('annualCdiPercent', Math.max(0, Number(e.target.value) || 0))
                }
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white min-h-11 tabular-nums"
              />
              {realAnnualCdiPercent !== null && (
                <button
                  type="button"
                  onClick={() => updateField('annualCdiPercent', realAnnualCdiPercent)}
                  className="px-3 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 shrink-0 cursor-pointer"
                >
                  Usar BCB ({formatPercentBR(realAnnualCdiPercent)})
                </button>
              )}
            </div>
            <span className="text-[11px] font-normal text-slate-400 mt-1 block">
              {realAnnualCdiPercent !== null
                ? `Referência anualizada calculada da série real do BCB${cdiLastDate ? ` (última cota ${cdiLastDate})` : ''}.`
                : 'Você pode informar manualmente a taxa anual projetada quando offline.'}
            </span>
          </label>

          {savedFeedback && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{savedFeedback}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!simulation}
            className="w-full min-h-12 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            Salvar simulação no histórico
          </button>
        </form>

        {/* Live output + Chart */}
        <div className="lg:col-span-7 space-y-5">
          {simulation ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="sf-card p-4">
                  <span className="text-xs text-[#64748B] dark:text-slate-400">Total investido</span>
                  <div className="font-money text-base sm:text-lg font-bold text-[#0F172A] dark:text-white mt-1">
                    {formatarValor(simulation.investedValue, hideValues)}
                  </div>
                  <span className="text-[11px] text-[#64748B] dark:text-slate-400">Sem aportes contados como lucro</span>
                </div>

                <div className="sf-card p-4">
                  <span className="text-xs text-[#64748B] dark:text-slate-400">Saldo bruto estimado</span>
                  <div className="font-money text-base sm:text-lg font-bold text-blue-700 dark:text-blue-400 mt-1">
                    {formatarValor(simulation.grossValue, hideValues)}
                  </div>
                  <span className="font-money text-[11px] text-[#64748B] dark:text-slate-400">
                    Rendimento: {hideValues ? formatarValor(simulation.grossProfit, true) : `+${formatarValor(simulation.grossProfit, false)}`}
                  </span>
                </div>

                <div className="sf-card p-4 col-span-2 sm:col-span-1">
                  <span className="text-xs text-[#64748B] dark:text-slate-400">Saldo líquido estimado</span>
                  <div className="font-money text-base sm:text-lg font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
                    {formatarValor(simulation.netValue, hideValues)}
                  </div>
                  <span className="font-money text-[11px] text-amber-700 dark:text-amber-400">
                    Impostos: {hideValues ? formatarValor(simulation.tax.totalTax, true) : `-${formatarValor(simulation.tax.totalTax, false)}`}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Projeção estimada ({form.months} meses · ~{simulation.tax.days} dias corridos):</strong>{' '}
                  {simulation.tax.note}
                </span>
              </div>

              <GraficoComparativo
                data={chartData}
                cdbLabel={`${form.productType} ${formatPercentBR(form.cdiPercentage, 1)} CDI`}
                title="Projeção CDI 100% × Cenário Simulado"
                showInvested={form.monthlyContribution > 0}
                theme={theme}
              />
            </>
          ) : (
            <div className="sf-card p-8 text-center text-sm text-[#64748B]">
              Ajuste os parâmetros numéricos para visualizar os resultados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
