import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Asset } from '../../types';
import {
  CDIRate,
  InvestmentFilterPeriod,
  InvestmentProductType,
  InvestmentSimulation,
  InvestmentSubTab,
} from '../../types/investment';
import { fetchCdiWithCache } from '../../services/cdiService';
import {
  buildHistoricalComparisonWithContributions,
  computeEffectiveAnnualCdi,
  getIrRate,
  parseDailyCdiRates,
} from '../../services/investmentCalculator';
import {
  loadSavedSimulations,
  saveSimulations,
} from '../../services/investmentStorage';
import {
  PRODUCT_TYPE_LABELS,
  formatIsoDateTimePtBr,
  formatPercentBR,
} from '../../utils/investmentFormatters';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { todayLocal } from '../../utils/dateUtils';
import { generateEntityId } from '../../domain/common/id';
import { InvestmentSummary } from './InvestmentSummary';
import { InvestmentComparison } from './InvestmentComparison';
import InvestmentSimulator, { SimulatorFormState } from './InvestmentSimulator';
import { InvestmentHistory } from './InvestmentHistory';
import GraficoComparativo from './GraficoComparativo';
import {
  BarChart3,
  Calculator,
  Clock,
  RefreshCw,
  TrendingUp,
  Scale,
  AlertCircle,
} from 'lucide-react';

interface InvestmentDashboardProps {
  assets: Asset[];
  theme: 'light' | 'dark';
  onNotifyUndo?: (label: string, restore: () => void) => void;
}

function getWindowDates(
  filter: InvestmentFilterPeriod,
  customStartIso: string,
  customEndIso: string
): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filter === 'custom') {
    const s = customStartIso ? new Date(`${customStartIso}T00:00:00`) : new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const e = customEndIso ? new Date(`${customEndIso}T00:00:00`) : end;
    return {
      start: Number.isNaN(s.getTime()) ? new Date(end.getFullYear() - 1, end.getMonth(), end.getDate()) : s,
      end: Number.isNaN(e.getTime()) ? end : e,
    };
  }
  const start = new Date(end);
  if (filter === '30d') start.setDate(start.getDate() - 30);
  else if (filter === '90d') start.setDate(start.getDate() - 90);
  else if (filter === '6m') start.setMonth(start.getMonth() - 6);
  else if (filter === '12m') start.setFullYear(start.getFullYear() - 1);
  else if (filter === '24m') start.setFullYear(start.getFullYear() - 2);
  else if (filter === '5y') start.setFullYear(start.getFullYear() - 5);
  return { start, end };
}

export const InvestmentDashboard: React.FC<InvestmentDashboardProps> = ({
  assets,
  theme,
  onNotifyUndo,
}) => {
  const { hideValues } = usePrivacy();
  const [subTab, setSubTab] = useState<InvestmentSubTab>('overview');
  const [periodFilter, setPeriodFilter] = useState<InvestmentFilterPeriod>('12m');
  const [customStartIso, setCustomStartIso] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [customEndIso, setCustomEndIso] = useState(() => todayLocal());

  // Shared active scenario parameters
  const [initialAmount, setInitialAmount] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [cdbPercentage, setCdbPercentage] = useState(115);
  const [productType, setProductType] = useState<InvestmentProductType>('CDB');

  // Real BCB state
  const [cdiRates, setCdiRates] = useState<CDIRate[]>([]);
  const [cdiFetchedAt, setCdiFetchedAt] = useState<string | undefined>(undefined);
  const [cdiSource, setCdiSource] = useState<string>('Banco Central · SGS Série 12');
  const [cdiWarning, setCdiWarning] = useState<string | null>(null);
  const [cdiError, setCdiError] = useState<string | null>(null);
  const [loadingCdi, setLoadingCdi] = useState<boolean>(false);

  // Saved simulations state
  const [simulations, setSimulations] = useState<InvestmentSimulation[]>(() =>
    loadSavedSimulations()
  );
  const [simulatorPreset, setSimulatorPreset] = useState<Partial<SimulatorFormState> | undefined>(
    undefined
  );

  useEffect(() => {
    saveSimulations(simulations);
  }, [simulations]);

  const loadCdiSeries = useCallback(
    async (forceRefresh = false) => {
      const { start, end } = getWindowDates(periodFilter, customStartIso, customEndIso);
      if (start.getTime() > end.getTime()) {
        setCdiError('A data inicial do filtro personalizado deve ser anterior à data final.');
        return;
      }
      setLoadingCdi(true);
      setCdiError(null);
      setCdiWarning(null);
      try {
        const res = await fetchCdiWithCache(start, end, { forceRefresh });
        setCdiRates(res.series);
        setCdiFetchedAt(res.fetchedAt);
        setCdiSource(res.source);
        if (res.warning) {
          setCdiWarning(res.warning);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Serviço do Banco Central indisponível no momento.';
        setCdiError(msg);
      } finally {
        setLoadingCdi(false);
      }
    },
    [periodFilter, customStartIso, customEndIso]
  );

  useEffect(() => {
    void loadCdiSeries(false);
  }, [loadCdiSeries]);

  const { realAnnualCdiPercent, latestDailyRatePercent, lastBcbDate } = useMemo(() => {
    if (cdiRates.length === 0) {
      return {
        realAnnualCdiPercent: null,
        latestDailyRatePercent: null,
        lastBcbDate: undefined,
      };
    }
    try {
      const parsed = parseDailyCdiRates(cdiRates);
      const lastItem = cdiRates[cdiRates.length - 1];
      return {
        realAnnualCdiPercent: computeEffectiveAnnualCdi(parsed),
        latestDailyRatePercent: Number(lastItem.valor),
        lastBcbDate: lastItem.data,
      };
    } catch {
      return {
        realAnnualCdiPercent: null,
        latestDailyRatePercent: null,
        lastBcbDate: undefined,
      };
    }
  }, [cdiRates]);

  const activeSummary = useMemo(() => {
    return buildHistoricalComparisonWithContributions({
      initialAmount: Math.max(0, initialAmount),
      monthlyContribution: Math.max(0, monthlyContribution),
      cdiPercentage: Math.max(0, cdbPercentage),
      rates: cdiRates,
      productType,
    });
  }, [initialAmount, monthlyContribution, cdbPercentage, cdiRates, productType]);

  const overviewChartData = useMemo(() => {
    return activeSummary.timeline.map((pt) => ({
      date: pt.label,
      cdi: pt.cdiValue,
      cdb: pt.cdbValue,
      invested: pt.investedAmount,
    }));
  }, [activeSummary]);

  const handleSaveSimulation = (
    simData: Omit<InvestmentSimulation, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const nowIso = new Date().toISOString();
    const created: InvestmentSimulation = {
      ...simData,
      id: generateEntityId('sim'),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setSimulations((prev) => [created, ...prev]);
  };

  const handleRenameSimulation = (id: string, newName: string) => {
    const nowIso = new Date().toISOString();
    setSimulations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: newName, updatedAt: nowIso } : s))
    );
  };

  const handleDuplicateSimulation = (sim: InvestmentSimulation) => {
    const nowIso = new Date().toISOString();
    const copy: InvestmentSimulation = {
      ...sim,
      id: generateEntityId('sim'),
      name: `${sim.name} (cópia)`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setSimulations((prev) => [copy, ...prev]);
  };

  const handleDeleteSimulation = (id: string) => {
    const removed = simulations.find((s) => s.id === id);
    const index = simulations.findIndex((s) => s.id === id);
    setSimulations((prev) => prev.filter((s) => s.id !== id));
    if (removed && onNotifyUndo) {
      onNotifyUndo(`Simulação "${removed.name}" removida.`, () => {
        setSimulations((prev) => {
          if (prev.some((item) => item.id === removed.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
      });
    }
  };

  const handleLoadSimulation = (sim: InvestmentSimulation) => {
    const approxMonths = Math.max(1, Math.round(sim.days / 30.4167));
    setSimulatorPreset({
      name: sim.name,
      productType: sim.productType,
      initialAmount: sim.initialAmount,
      monthlyContribution: sim.monthlyContribution,
      cdiPercentage: sim.cdiPercentage,
      months: approxMonths,
      annualCdiPercent: sim.annualReferenceCdi ?? realAnnualCdiPercent ?? 10.65,
    });
    setSubTab('simulator');
  };

  const navTabs: Array<{ id: InvestmentSubTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'overview', label: 'Visão geral', icon: BarChart3 },
    { id: 'comparator', label: 'Comparador CDI × CDB', icon: Scale },
    { id: 'simulator', label: 'Simulador', icon: Calculator },
    { id: 'history', label: 'Histórico de simulações', icon: Clock },
    { id: 'analysis', label: 'Análise de rentabilidade', icon: TrendingUp },
  ];

  // Equivalência LCI/LCA isenta vs CDB tributado no prazo atual
  const currentIrRate = getIrRate(Math.max(1, activeSummary.tax.days || 365));
  const equivalentExemptPct = Math.round(cdbPercentage * (1 - currentIrRate) * 10) / 10;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header strip + BCB Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
            Investimentos, Comparador CDI × CDB e Simulador
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Dados oficiais do Banco Central (SGS 12) ·{' '}
            {cdiFetchedAt
              ? `Última atualização CDI: ${formatIsoDateTimePtBr(cdiFetchedAt)}`
              : 'Consultando histórico do CDI...'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {realAnnualCdiPercent !== null && (
            <div className="font-money px-3 py-2 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-200">
              CDI anualizado: <strong className="text-[#059669] dark:text-[#10B981]">{formatPercentBR(realAnnualCdiPercent)}</strong>
              {latestDailyRatePercent !== null && (
                <span className="text-[#64748B] ml-2">
                  ({latestDailyRatePercent.toFixed(6).replace('.', ',')}%/dia)
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadCdiSeries(true)}
            disabled={loadingCdi}
            className="min-h-10 px-3.5 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loadingCdi ? 'animate-spin' : ''} />
            Atualizar CDI
          </button>
        </div>
      </div>

      {cdiWarning && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{cdiWarning}</span>
        </div>
      )}

      {/* 5 Subsections Navigation */}
      <div
        role="tablist"
        aria-label="Subseções de Investimentos"
        className="flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800"
      >
        {navTabs.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(t.id)}
              className={`min-h-10 px-3.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-white dark:bg-slate-800 text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-slate-700'
                  : 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Visão geral */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <InvestmentSummary
            summary={activeSummary}
            assets={assets}
            isProjection={false}
            cdiPercentage={cdbPercentage}
            productLabel={PRODUCT_TYPE_LABELS[productType]}
            theme={theme}
            onGoToSimulator={() => setSubTab('simulator')}
            onGoToComparator={() => setSubTab('comparator')}
          />

          <GraficoComparativo
            data={overviewChartData}
            cdbLabel={`${productType} ${formatPercentBR(cdbPercentage, 1)} CDI`}
            title={`Evolução histórica (${cdiSource})`}
            showInvested={monthlyContribution > 0}
            theme={theme}
          />
        </div>
      )}

      {/* 2. Comparador CDI × CDB */}
      {subTab === 'comparator' && (
        <InvestmentComparison
          rates={cdiRates}
          loading={loadingCdi}
          error={cdiError}
          periodFilter={periodFilter}
          setPeriodFilter={setPeriodFilter}
          customStartIso={customStartIso}
          customEndIso={customEndIso}
          setCustomStartIso={setCustomStartIso}
          setCustomEndIso={setCustomEndIso}
          initialAmount={initialAmount}
          setInitialAmount={setInitialAmount}
          monthlyContribution={monthlyContribution}
          setMonthlyContribution={setMonthlyContribution}
          cdbPercentage={cdbPercentage}
          setCdbPercentage={setCdbPercentage}
          productType={productType}
          setProductType={setProductType}
          onRefresh={() => void loadCdiSeries(true)}
          theme={theme}
        />
      )}

      {/* 3. Simulador */}
      {subTab === 'simulator' && (
        <InvestmentSimulator
          realAnnualCdiPercent={realAnnualCdiPercent}
          cdiLastDate={lastBcbDate}
          initialPreset={simulatorPreset}
          onSaveSimulation={handleSaveSimulation}
          theme={theme}
        />
      )}

      {/* 4. Histórico de simulações */}
      {subTab === 'history' && (
        <InvestmentHistory
          simulations={simulations}
          onRenameSimulation={handleRenameSimulation}
          onDuplicateSimulation={handleDuplicateSimulation}
          onDeleteSimulation={handleDeleteSimulation}
          onLoadSimulation={handleLoadSimulation}
          theme={theme}
        />
      )}

      {/* 5. Análise de rentabilidade */}
      {subTab === 'analysis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="sf-card p-5">
              <span className="text-xs text-[#64748B] dark:text-slate-400">Taxa CDI anualizada (252 DU)</span>
              <div className="font-money text-2xl font-extrabold text-[#0F172A] dark:text-white mt-1">
                {realAnnualCdiPercent !== null ? formatPercentBR(realAnnualCdiPercent) : 'Indisponível'}
              </div>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                Base: {cdiRates.length} pregões reais do BCB
              </p>
            </div>

            <div className="sf-card p-5">
              <span className="text-xs text-[#64748B] dark:text-slate-400">
                Equivalência Isenta (LCI / LCA)
              </span>
              <div className="font-money text-2xl font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
                {formatPercentBR(equivalentExemptPct, 1)} do CDI
              </div>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                Para empatar líquido com CDB {formatPercentBR(cdbPercentage, 1)} CDI (IR{' '}
                {(currentIrRate * 100).toFixed(1).replace('.', ',')}%)
              </p>
            </div>

            <div className="sf-card p-5">
              <span className="text-xs text-[#64748B] dark:text-slate-400">
                Retorno Líquido Estimado no Período
              </span>
              <div className="font-money text-2xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">
                {formatarValor(activeSummary.netProfit, hideValues)}
              </div>
              <p className="font-money text-xs text-[#64748B] dark:text-slate-400 mt-1">
                Sobre {formatarValor(activeSummary.investedValue, hideValues)} aplicados
              </p>
            </div>
          </div>

          {/* Tabela regressiva de IR e isenções */}
          <div className="sf-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                Tabela Regressiva de Tributação Aplicada (Estimativa)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#F8FAFC] dark:bg-slate-800/60 text-[#64748B] dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3 px-5 font-semibold">Prazo do Resgate</th>
                    <th className="py-3 px-5 font-semibold">Alíquota IR (CDB / Tesouro)</th>
                    <th className="py-3 px-5 font-semibold">LCI / LCA / Poupança</th>
                    <th className="py-3 px-5 font-semibold">IOF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td className="py-3 px-5 font-semibold text-[#0F172A] dark:text-white">Até 180 dias</td>
                    <td className="py-3 px-5 font-money">22,5%</td>
                    <td className="py-3 px-5 text-[#059669] dark:text-[#10B981] font-semibold">Isento</td>
                    <td className="py-3 px-5">96% a 3% até o 29º dia; 0% a partir do 30º dia</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-semibold text-[#0F172A] dark:text-white">De 181 a 360 dias</td>
                    <td className="py-3 px-5 font-money">20,0%</td>
                    <td className="py-3 px-5 text-[#059669] dark:text-[#10B981] font-semibold">Isento</td>
                    <td className="py-3 px-5">Isento</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-semibold text-[#0F172A] dark:text-white">De 361 a 720 dias</td>
                    <td className="py-3 px-5 font-money">17,5%</td>
                    <td className="py-3 px-5 text-[#059669] dark:text-[#10B981] font-semibold">Isento</td>
                    <td className="py-3 px-5">Isento</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-5 font-semibold text-[#0F172A] dark:text-white">Acima de 720 dias</td>
                    <td className="py-3 px-5 font-money">15,0%</td>
                    <td className="py-3 px-5 text-[#059669] dark:text-[#10B981] font-semibold">Isento</td>
                    <td className="py-3 px-5">Isento</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
