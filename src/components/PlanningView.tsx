import React, { useMemo, useState } from 'react';
import {
  APP_CATEGORIES,
  CategoryBudget,
  EntityScope,
  Transaction,
} from '../types';
import {
  filterTransactionsByPeriod,
  fromCents,
  formatCurrencyBRL,
} from '../utils/financeCalculations';
import { parseMoneyInput } from '../domain/money/money';
import {
  analyzeCategoryBudgets,
  calculateProjected503020,
  summarizeExpensesByCategory,
} from '../domain/planning/BudgetAnalyzer';
import {
  AlertCircle,
  AlertTriangle,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
} from 'lucide-react';

interface PlanningViewProps {
  transactions: Transaction[];
  budgets?: CategoryBudget[];
  onSaveBudget?: (params: {
    entityScope: EntityScope;
    category: string;
    limitCents: CategoryBudget['limitCents'];
  }) => void;
  onDeleteBudget?: (id: string) => void;
  scope: EntityScope;
  period: string;
}

const NEEDS_CATEGORIES = new Set([
  'Moradia',
  'Alimentação',
  'Transporte',
  'Impostos / DAS',
  'Insumos / Produção',
]);

const EXPENSE_CATEGORIES = APP_CATEGORIES.filter(
  (c) => c !== 'Salário' && c !== 'Serviço MEI' && c !== 'Transferência'
);

export const PlanningView: React.FC<PlanningViewProps> = ({
  transactions,
  budgets = [],
  onSaveBudget,
  onDeleteBudget,
  scope,
  period,
}) => {
  const [includeProjected, setIncludeProjected] = useState(false);
  const [budgetCategory, setBudgetCategory] = useState<string>('Alimentação');
  const [budgetScope, setBudgetScope] = useState<EntityScope>(scope);
  const [budgetLimitStr, setBudgetLimitStr] = useState('');
  const [budgetError, setBudgetError] = useState('');

  const periodScopedTrs = useMemo(() => {
    const byScope = transactions.filter((t) => {
      if (t.status === 'CANCELLED') return false;
      if (scope === 'CPF') return t.entityId === 'CPF';
      if (scope === 'CNPJ') return t.entityId === 'CNPJ';
      return true;
    });
    return filterTransactionsByPeriod(byScope, period);
  }, [transactions, scope, period]);

  const budget503020 = useMemo(
    () =>
      calculateProjected503020({
        transactions: periodScopedTrs,
        includeProjected,
        needsCategories: NEEDS_CATEGORIES,
      }),
    [periodScopedTrs, includeProjected]
  );

  const budgetStatuses = useMemo(
    () =>
      analyzeCategoryBudgets({
        budgets,
        transactions,
        scope,
        period,
        includeProjected,
      }),
    [budgets, transactions, scope, period, includeProjected]
  );

  const categoryExpenses = useMemo(
    () => summarizeExpensesByCategory({ transactions, scope, period }),
    [transactions, scope, period]
  );

  const unbudgetedCategories = useMemo(() => {
    const budgetedSet = new Set(budgetStatuses.map((b) => b.budget.category));
    return categoryExpenses.filter((c) => !budgetedSet.has(c.category));
  }, [categoryExpenses, budgetStatuses]);

  const pct = (actual: number, target: number) => {
    if (target <= 0) return 0;
    return Math.min(100, Math.round((actual / target) * 100));
  };

  const handleSaveCategoryBudget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveBudget) return;
    setBudgetError('');

    let limitCents;
    try {
      limitCents = parseMoneyInput(budgetLimitStr);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'Informe um teto válido em R$.');
      return;
    }

    if (limitCents <= 0) {
      setBudgetError('O teto mensal deve ser maior que zero.');
      return;
    }

    onSaveBudget({
      entityScope: budgetScope,
      category: budgetCategory,
      limitCents,
    });
    setBudgetLimitStr('');
  };

  const alertsCount = budgetStatuses.filter((b) => b.alertLevel !== 'OK').length;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
            Planejamento Financeiro · Regra 50/30/20 & Tetos
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Base de receita ({period === 'ALL' ? 'Todo período' : period}, escopo {scope}):{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              R$ {formatCurrencyBRL(budget503020.baseIncome)}
            </strong>
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 self-start">
          <button
            type="button"
            onClick={() => setIncludeProjected(false)}
            className={`px-3.5 min-h-10 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !includeProjected
                ? 'bg-[#082B5C] text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Apenas Realizado
          </button>
          <button
            type="button"
            onClick={() => setIncludeProjected(true)}
            className={`px-3.5 min-h-10 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              includeProjected
                ? 'bg-[#082B5C] text-white dark:bg-emerald-600'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Realizado + Previsto
          </button>
        </div>
      </div>

      {/* 50/30/20 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-md">
              NECESSIDADES · 50%
            </span>
            <Target className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white">
            R$ {formatCurrencyBRL(budget503020.needsTarget)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {includeProjected ? 'Projetado' : 'Realizado'}:{' '}
            <strong>R$ {formatCurrencyBRL(budget503020.needsSpent)}</strong> (
            {pct(budget503020.needsSpent, budget503020.needsTarget)}%)
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                budget503020.needsSpent > budget503020.needsTarget ? 'bg-red-500' : 'bg-blue-600'
              }`}
              style={{ width: `${pct(budget503020.needsSpent, budget503020.needsTarget)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">Moradia, alimentação, transporte, tributos e insumos.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded-md">
              DESEJOS / OUTROS · 30%
            </span>
            <Target className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white">
            R$ {formatCurrencyBRL(budget503020.wantsTarget)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {includeProjected ? 'Projetado' : 'Realizado'}:{' '}
            <strong>R$ {formatCurrencyBRL(budget503020.wantsSpent)}</strong> (
            {pct(budget503020.wantsSpent, budget503020.wantsTarget)}%)
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                budget503020.wantsSpent > budget503020.wantsTarget ? 'bg-red-500' : 'bg-amber-500'
              }`}
              style={{ width: `${pct(budget503020.wantsSpent, budget503020.wantsTarget)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">Cartão de crédito, lazer, compras pessoais e outros.</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md">
              RESERVA / SOBRA · 20%
            </span>
            <Target className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#082B5C] dark:text-white">
            R$ {formatCurrencyBRL(budget503020.savingsTarget)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Preservado no período:{' '}
            <strong>R$ {formatCurrencyBRL(budget503020.actualSavings)}</strong> (
            {pct(budget503020.actualSavings, budget503020.savingsTarget)}%)
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full"
              style={{ width: `${pct(budget503020.actualSavings, budget503020.savingsTarget)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">Margem disponível para investimentos e reserva.</p>
        </div>
      </div>

      {/* Category Budgets & Alerts */}
      {onSaveBudget && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#082B5C] dark:text-white flex items-center gap-2">
                Tetos Mensais por Categoria
                {alertsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                    {alertsCount} alerta(s)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Defina limites por categoria para receber alertas a partir de 80% do teto.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSaveCategoryBudget}
            className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
          >
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Categoria
              </label>
              <select
                value={budgetCategory}
                onChange={(e) => setBudgetCategory(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-11"
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Escopo da meta
              </label>
              <select
                value={budgetScope}
                onChange={(e) => setBudgetScope(e.target.value as EntityScope)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-11"
              >
                <option value="CONSOLIDATED">Consolidado</option>
                <option value="CPF">CPF (Pessoal)</option>
                <option value="CNPJ">CNPJ (MEI)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Teto no período (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex.: 1500,00"
                value={budgetLimitStr}
                onChange={(e) => {
                  setBudgetLimitStr(e.target.value);
                  setBudgetError('');
                }}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-11"
              />
            </div>

            <button
              type="submit"
              className="min-h-11 px-4 bg-[#082B5C] hover:bg-[#061B3B] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} /> Salvar teto
            </button>
          </form>

          {budgetError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={15} /> {budgetError}
            </div>
          )}

          {budgetStatuses.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              Nenhum teto por categoria definido ainda. Adicione um limite acima para acompanhar alertas em tempo real.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {budgetStatuses.map((status) => {
                const { budget, spentCents, remainingCents, utilizationPct, alertLevel, projectedExtraCents } =
                  status;
                const barWidth = Math.min(100, utilizationPct);
                const barColor =
                  alertLevel === 'EXCEEDED'
                    ? 'bg-red-600'
                    : alertLevel === 'WARNING'
                    ? 'bg-amber-500'
                    : 'bg-emerald-600';

                return (
                  <div
                    key={budget.id}
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      alertLevel === 'EXCEEDED'
                        ? 'border-red-300 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20'
                        : alertLevel === 'WARNING'
                        ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-sm text-[#082B5C] dark:text-white truncate">
                          {budget.category}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                          {budget.entityScope === 'CONSOLIDATED' ? 'Geral' : budget.entityScope}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {alertLevel !== 'OK' && (
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              alertLevel === 'EXCEEDED'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            }`}
                          >
                            <AlertTriangle size={11} />
                            {alertLevel === 'EXCEEDED' ? 'Excedido' : 'Atenção'} ({utilizationPct}%)
                          </span>
                        )}
                        {onDeleteBudget && (
                          <button
                            type="button"
                            onClick={() => onDeleteBudget(budget.id)}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            aria-label={`Remover teto de ${budget.category}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span>
                        Gasto: <strong>R$ {formatCurrencyBRL(fromCents(spentCents))}</strong>
                        {!includeProjected && projectedExtraCents > 0 && (
                          <span className="text-slate-400">
                            {' '}
                            (+ R$ {formatCurrencyBRL(fromCents(projectedExtraCents))} prev.)
                          </span>
                        )}
                      </span>
                      <span>
                        Teto: <strong>R$ {formatCurrencyBRL(budget.limitAmount)}</strong>
                      </span>
                    </div>

                    <div className="w-full bg-slate-200/70 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>

                    <div className="text-[11px] font-semibold">
                      {remainingCents >= 0 ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Margem restante: R$ {formatCurrencyBRL(fromCents(remainingCents))}
                        </span>
                      ) : (
                        <span className="text-red-700 dark:text-red-400">
                          Ultrapassado em R$ {formatCurrencyBRL(Math.abs(fromCents(remainingCents)))}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unbudgetedCategories.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                Categorias com despesas no período ainda sem teto:
              </p>
              <div className="flex flex-wrap gap-2">
                {unbudgetedCategories.slice(0, 6).map((cat) => (
                  <button
                    key={cat.category}
                    type="button"
                    onClick={() => {
                      setBudgetCategory(cat.category);
                      setBudgetScope(scope);
                    }}
                    className="px-3 min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    + {cat.category} (R$ {formatCurrencyBRL(fromCents(includeProjected ? cat.totalCents : cat.confirmedCents))})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#082B5C] dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Critério de cálculo real
        </h3>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Os tetos 50/30/20 e por categoria são calculados dinamicamente sobre a competência selecionada (excluindo lançamentos cancelados e transferências internas entre contas próprias). Alterne para &quot;Realizado + Previsto&quot; para incluir despesas pendentes e parcelamentos futuros na projeção.
        </p>
      </div>
    </div>
  );
};
