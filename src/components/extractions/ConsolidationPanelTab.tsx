import React, { useMemo, useState } from 'react';
import type { Account, Asset, CreditCard, Debt, Transaction } from '../../types';
import {
  INSTITUTION_CATEGORY_LABELS,
  type AccountExtensionMeta,
  type ConsolidationBreakdownItem,
  type ConsolidationMode,
  type ConsolidationPreferences,
  type InstitutionCategory,
  type InstitutionProfile,
} from '../../types/extractions';
import { computeFinancialConsolidation, inferAccountCategory } from '../../domain/extractions/consolidationEngine';
import { fromCents, type MoneyCents } from '../../domain/money/money';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { InstitutionCategoryBadge } from './InstitutionCategoryBadge';
import { Sheet } from '../Sheet';
import {
  AlertTriangle,
  CheckSquare,
  ChevronRight,
  Layers,
  PiggyBank,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';

interface ConsolidationPanelTabProps {
  accounts: Account[];
  creditCards: CreditCard[];
  assets: Asset[];
  debts: Debt[];
  transactions: Transaction[];
  accountExtensions: AccountExtensionMeta[];
  institutions: InstitutionProfile[];
  preferences: ConsolidationPreferences;
  period: string;
  onUpdatePreferences: (next: ConsolidationPreferences) => void;
  onNavigateModule?: (tab: string) => void;
}

function currencySymbol(cur: 'BRL' | 'USD' | 'EUR'): string {
  if (cur === 'USD') return 'US$ ';
  if (cur === 'EUR') return '€ ';
  return 'R$ ';
}

export const ConsolidationPanelTab: React.FC<ConsolidationPanelTabProps> = ({
  accounts,
  creditCards,
  assets,
  debts,
  transactions,
  accountExtensions,
  institutions,
  preferences,
  period,
  onUpdatePreferences,
  onNavigateModule,
}) => {
  const { hideValues } = usePrivacy();
  const [entityFilter, setEntityFilter] = useState<'ALL' | 'CPF' | 'CNPJ'>('ALL');
  const [periodOverride, setPeriodOverride] = useState(period);
  const [inspectBucket, setInspectBucket] = useState<{
    title: string;
    items: ConsolidationBreakdownItem[];
  } | null>(null);

  const extById = useMemo(
    () => new Map(accountExtensions.map((e) => [e.id, e])),
    [accountExtensions]
  );

  const summary = useMemo(
    () =>
      computeFinancialConsolidation({
        accounts,
        creditCards,
        assets,
        debts,
        transactions,
        accountExtensions,
        institutions,
        preferences,
        period: periodOverride,
        entityFilter,
      }),
    [
      accounts,
      creditCards,
      assets,
      debts,
      transactions,
      accountExtensions,
      institutions,
      preferences,
      periodOverride,
      entityFilter,
    ]
  );

  const sym = currencySymbol(preferences.targetCurrency);
  const fmtAmt = (cents: MoneyCents): string => {
    if (preferences.targetCurrency === 'BRL') {
      return formatarValor(fromCents(cents), hideValues);
    }
    return hideValues ? `${sym}•••••` : `${sym}${formatCurrencyBRL(fromCents(cents))}`;
  };
  const activeAccounts = useMemo(
    () => accounts.filter((a) => preferences.includeClosedAccounts || !a.archived),
    [accounts, preferences.includeClosedAccounts]
  );

  const applyQuickCommand = (cmd: string) => {
    const allAccountIds = activeAccounts.map((a) => a.id);
    const allCardIds = creditCards.map((c) => c.id);
    if (cmd === 'ALL') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CONSOLIDATED',
        selectedAccountIds: allAccountIds,
        selectedCardIds: allCardIds,
        selectedCategories: [],
      });
    } else if (cmd === 'NONE') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CUSTOM',
        selectedAccountIds: [],
        selectedCardIds: [],
        selectedCategories: [],
      });
    } else if (cmd === 'ACTIVE_ONLY') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CUSTOM',
        includeClosedAccounts: false,
        selectedAccountIds: accounts.filter((a) => !a.archived).map((a) => a.id),
        selectedCardIds: allCardIds,
        selectedCategories: [],
      });
    } else if (cmd === 'BANCOS_FISICOS') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CATEGORY',
        selectedCategories: ['BANCO_FISICO'],
      });
    } else if (cmd === 'BANCOS_DIGITAIS') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CATEGORY',
        selectedCategories: ['BANCO_DIGITAL'],
      });
    } else if (cmd === 'CORRETORAS') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CATEGORY',
        selectedCategories: ['CORRETORA_NACIONAL', 'CORRETORA_INTERNACIONAL'],
      });
    } else if (cmd === 'CARTOES') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CATEGORY',
        selectedCategories: ['CARTAO_CREDITO'],
      });
    } else if (cmd === 'EXCHANGES') {
      onUpdatePreferences({
        ...preferences,
        mode: 'CATEGORY',
        selectedCategories: ['EXCHANGE'],
      });
    }
  };

  const toggleAccountSelection = (accId: string) => {
    const current = new Set(preferences.selectedAccountIds);
    if (current.has(accId)) current.delete(accId);
    else current.add(accId);
    onUpdatePreferences({
      ...preferences,
      mode: 'CUSTOM',
      selectedAccountIds: Array.from(current),
    });
  };

  const cards = [
    {
      title: 'Disponibilidades Financeiras',
      valueCents: summary.disponibilidadesCents,
      sub: `Bancos físicos ${fmtAmt(summary.disponibilidadeBancosFisicosCents)} · Digitais ${fmtAmt(summary.disponibilidadeBancosDigitaisCents)}`,
      icon: Wallet,
      color: 'text-[#0F172A] dark:text-blue-300',
      bucket: summary.breakdownByBucket.disponibilidades,
    },
    {
      title: 'Investimentos (Corretoras & Renda)',
      valueCents: summary.investimentosCents,
      sub: 'Ações, FIIs, CDB/RDB, Tesouro e fundos (separado de saldo à vista)',
      icon: TrendingUp,
      color: 'text-[#059669] dark:text-[#10B981]',
      bucket: summary.breakdownByBucket.investimentos,
    },
    {
      title: 'Criptoativos & Exchanges',
      valueCents: summary.criptoCents,
      sub: 'Posições custodiadas em exchanges e carteiras',
      icon: PiggyBank,
      color: 'text-[#F5B719]',
      bucket: summary.breakdownByBucket.cripto,
    },
    {
      title: 'Faturas em Aberto + Dívidas',
      valueCents: summary.obrigacoesTotaisCents,
      sub: `Faturas ${fmtAmt(summary.faturasAbertasCents)} · Dívidas ${fmtAmt(summary.dividasCents)} (limites excluídos)`,
      icon: Receipt,
      color: 'text-[#DC3545]',
      bucket: [...summary.breakdownByBucket.faturas, ...summary.breakdownByBucket.dividas],
    },
    {
      title: 'Receitas no Período',
      valueCents: summary.receitasPeriodoCents,
      sub: 'Exclui transferências próprias e resgates de principal',
      icon: TrendingUp,
      color: 'text-[#059669] dark:text-[#10B981]',
      bucket: summary.breakdownByBucket.receitas,
    },
    {
      title: 'Despesas no Período',
      valueCents: summary.despesasPeriodoCents,
      sub: 'Exclui aplicações patrimoniais e transferências próprias',
      icon: Receipt,
      color: 'text-[#DC3545]',
      bucket: summary.breakdownByBucket.despesas,
    },
    {
      title: 'Patrimônio Bruto',
      valueCents: summary.patrimonioBrutoCents,
      sub: 'Disponibilidades + Investimentos + Cripto selecionados',
      icon: Layers,
      color: 'text-[#0F172A] dark:text-white',
      bucket: [
        ...summary.breakdownByBucket.disponibilidades,
        ...summary.breakdownByBucket.investimentos,
        ...summary.breakdownByBucket.cripto,
      ],
    },
    {
      title: 'Patrimônio Líquido',
      valueCents: summary.patrimonioLiquidoCents,
      sub: 'Total de ativos menos total de obrigações constituídas',
      icon: Scale,
      color:
        summary.patrimonioLiquidoCents >= 0
          ? 'text-[#059669] dark:text-[#10B981]'
          : 'text-[#DC3545]',
      bucket: [
        ...summary.breakdownByBucket.disponibilidades,
        ...summary.breakdownByBucket.investimentos,
        ...summary.breakdownByBucket.cripto,
        ...summary.breakdownByBucket.faturas,
        ...summary.breakdownByBucket.dividas,
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {/* Mode Switcher & Preferences */}
      <div className="sf-card rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-extrabold text-[#0F172A] dark:text-white">
              Consolidação Financeira Transparente
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Alterne entre visão individual, por categoria, consolidada ou seleção personalizada. Clique em qualquer indicador para inspecionar sua composição exata.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
            {(
              [
                { id: 'INDIVIDUAL', label: 'Individual' },
                { id: 'CATEGORY', label: 'Por categoria' },
                { id: 'CONSOLIDATED', label: 'Consolidada' },
                { id: 'CUSTOM', label: 'Personalizada' },
              ] as Array<{ id: ConsolidationMode; label: string }>
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdatePreferences({ ...preferences, mode: m.id })}
                className={`px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  preferences.mode === m.id
                    ? 'bg-[#061E3E] text-white dark:bg-[#059669] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Titularidade
            </label>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as 'ALL' | 'CPF' | 'CNPJ')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
            >
              <option value="ALL">CPF + CNPJ</option>
              <option value="CPF">Somente CPF</option>
              <option value="CNPJ">Somente CNPJ</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Moeda de Consolidação
            </label>
            <select
              value={preferences.targetCurrency}
              onChange={(e) =>
                onUpdatePreferences({
                  ...preferences,
                  targetCurrency: e.target.value as 'BRL' | 'USD' | 'EUR',
                })
              }
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
            >
              <option value="BRL">BRL (Real Brasileiro)</option>
              <option value="USD">USD (Dólar Americano)</option>
              <option value="EUR">EUR (Euro)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Taxa USD→BRL / EUR→BRL
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={preferences.usdToBrlRate}
                onChange={(e) =>
                  onUpdatePreferences({
                    ...preferences,
                    usdToBrlRate: Number(e.target.value) || 0,
                  })
                }
                aria-label="Taxa USD para BRL"
                className="w-1/2 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800 min-h-10 tabular-nums"
              />
              <input
                type="number"
                step="0.01"
                value={preferences.eurToBrlRate}
                onChange={(e) =>
                  onUpdatePreferences({
                    ...preferences,
                    eurToBrlRate: Number(e.target.value) || 0,
                  })
                }
                aria-label="Taxa EUR para BRL"
                className="w-1/2 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800 min-h-10 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">
              {preferences.mode === 'INDIVIDUAL' ? 'Conta/Cartão individual' : 'Competência'}
            </label>
            {preferences.mode === 'INDIVIDUAL' ? (
              <select
                value={preferences.defaultIndividualId || ''}
                onChange={(e) =>
                  onUpdatePreferences({
                    ...preferences,
                    defaultIndividualId: e.target.value,
                  })
                }
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
              >
                <option value="">Selecione uma origem...</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institutionName} · {a.accountName} ({a.entityId})
                  </option>
                ))}
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cartão: {c.cardName} (•••• {c.last4})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 min-h-10">
                <input
                  type="text"
                  value={periodOverride}
                  onChange={(e) => setPeriodOverride(e.target.value)}
                  placeholder="ALL ou YYYY-MM"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                />
              </div>
            )}
          </div>
        </div>

        {/* Quick Command Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {[
            { id: 'ALL', label: 'Selecionar todas' },
            { id: 'NONE', label: 'Desmarcar todas' },
            { id: 'ACTIVE_ONLY', label: 'Somente contas ativas' },
            { id: 'BANCOS_FISICOS', label: 'Somente bancos físicos' },
            { id: 'BANCOS_DIGITAIS', label: 'Somente bancos digitais' },
            { id: 'CORRETORAS', label: 'Somente corretoras' },
            { id: 'EXCHANGES', label: 'Somente exchanges' },
            { id: 'CARTOES', label: 'Somente cartões' },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => applyQuickCommand(btn.id)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-[#0F172A] dark:text-slate-200 cursor-pointer"
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Individual Account Selection Strip when in CUSTOM mode */}
        {preferences.mode === 'CUSTOM' && (
          <div className="pt-2 border-t border-slate-100 dark:border-white/10">
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <CheckSquare size={13} /> Marque as contas que participam da consolidação ({summary.selectedCount} selecionadas):
            </div>
            <div className="flex flex-wrap gap-2">
              {activeAccounts.map((a) => {
                const checked = preferences.selectedAccountIds.includes(a.id);
                const cat = inferAccountCategory({
                  account: a,
                  extension: extById.get(a.id),
                  institutions,
                });
                return (
                  <label
                    key={a.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs cursor-pointer ${
                      checked
                        ? 'border-[#059669] bg-[#059669]/10 text-[#0F172A] dark:text-emerald-300 font-bold'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccountSelection(a.id)}
                      className="accent-[#059669]"
                    />
                    <span>
                      {a.institutionName} · {a.accountName}
                    </span>
                    <span className="text-[10px] opacity-75">
                      ({INSTITUTION_CATEGORY_LABELS[cat]})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Warnings for Unconverted Currencies or Outdated Balances */}
      {(summary.hasUnconvertedCurrencies || summary.hasOutdatedBalances) && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {summary.hasUnconvertedCurrencies && (
              <p>
                Moedas sem taxa de câmbio configurada ({summary.missingRateCurrencies.join(', ')}) não foram somadas indevidamente ao total.
              </p>
            )}
            {summary.hasOutdatedBalances && (
              <p>
                Existem contas marcadas com saldo desatualizado ou desconhecido — nenhuma conta recebeu saldo zero presumido.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Separated Indicators Grid (Click to Inspect Composition) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.title}
              type="button"
              onClick={() => setInspectBucket({ title: card.title, items: card.bucket })}
              className="sf-card-interactive text-left rounded-2xl p-4 space-y-2 cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B] dark:text-slate-400">
                  {card.title}
                </span>
                <Icon size={16} className={`${card.color} shrink-0`} />
              </div>
              <div className={`font-money text-xl font-extrabold ${card.color}`}>
                {fmtAmt(card.valueCents)}
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                <span className="line-clamp-2">{card.sub}</span>
                <ChevronRight size={14} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Detailed Institution Breakdown */}
      <div className="sf-card rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white">
            Relação por Instituição ({summary.institutionRows.length})
          </h4>
          <span className="text-[11px] text-slate-400">
            {summary.selectedCount} contas/cartões ativos na seleção
          </span>
        </div>

        {summary.institutionRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nenhuma instituição selecionada para consolidação.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {summary.institutionRows.map((row) => (
              <div
                key={`${row.institutionId}-${row.category}`}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-bold text-sm text-[#0F172A] dark:text-white">
                    {row.institutionName}
                  </span>
                  <InstitutionCategoryBadge category={row.category} compact />
                  {row.hasOutdatedBalance && (
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      · Saldo desatualizado
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 text-right text-xs font-money shrink-0">
                  <div>
                    <span className="block text-[10px] text-slate-400">Disponível</span>
                    <strong className="text-[#0F172A] dark:text-blue-300">
                      {fmtAmt(row.disponibilidadesCents)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Investido</span>
                    <strong className="text-[#059669] dark:text-[#10B981]">
                      {fmtAmt(row.investimentosCents)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Obrigações</span>
                    <strong className="text-[#DC3545]">
                      {fmtAmt(row.obrigacoesCents)}
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composition Drilldown Sheet */}
      <Sheet
        open={Boolean(inspectBucket)}
        onClose={() => setInspectBucket(null)}
        title={inspectBucket?.title || 'Composição'}
        subtitle="Detalhamento exato das instituições, contas e registros que formam este indicador"
        maxWidthClass="max-w-xl"
      >
        {inspectBucket && (
          <div className="space-y-3">
            {inspectBucket.items.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-500 py-4">
                Nenhum registro compõe este indicador com os filtros atuais.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/10 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                {inspectBucket.items.map((item) => (
                  <div
                    key={`${item.sourceKind}-${item.id}`}
                    className="p-3 flex items-center justify-between gap-3 bg-white dark:bg-[#11185A]"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate">
                        {item.label}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                        <InstitutionCategoryBadge category={item.institutionCategory} compact />
                        <span>{item.entityId}</span>
                        {item.balanceStatus !== 'UPDATED' && (
                          <span className="text-amber-600 font-bold">Desatualizado</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-money text-xs font-extrabold text-[#0F172A] dark:text-white">
                        {fmtAmt(item.convertedBrlCents)}
                      </div>
                      {item.currency !== preferences.targetCurrency && (
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          Original: {item.currency}{' '}
                          {hideValues ? '•••••' : formatCurrencyBRL(fromCents(item.originalAmountCents))}
                        </div>
                      )}
                      {item.targetTab && onNavigateModule && (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectBucket(null);
                            onNavigateModule(item.targetTab!);
                          }}
                          className="text-[10px] font-bold text-[#059669] dark:text-[#10B981] hover:underline cursor-pointer"
                        >
                          Abrir módulo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
};
