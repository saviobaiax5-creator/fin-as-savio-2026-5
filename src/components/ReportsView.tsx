import React, { useMemo, useState } from 'react';
import { Transaction, Account, Boleto, Debt, Asset, EntityScope, LedgerDrilldownFilter } from '../types';
import {
  filterTransactionsByPeriod,
  calculatePeriodMetricsCents,
  calculateConsolidatedPatrimonyCents,
  getTransactionAmountCents,
  toCents,
  fromCents,
  formatCurrencyBRL,
} from '../utils/financeCalculations';
import {
  buildCashFlowProjection,
  CashFlowHorizonDays,
} from '../domain/planning/CashFlowProjectionService';
import { formatDateBR } from '../utils/dateUtils';
import { sanitizeCellForSheet } from '../utils/sheetGuard';
import { Printer, Download, CalendarRange, AlertTriangle } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface ReportsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  boletos: Boleto[];
  debts: Debt[];
  assets: Asset[];
  scope: EntityScope;
  period: string;
  onNavigate?: (tab: string, filter?: LedgerDrilldownFilter) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  accounts,
  boletos,
  debts,
  assets,
  scope,
  period,
  onNavigate,
}) => {
  const { hideValues } = usePrivacy();
  const [horizonDays, setHorizonDays] = useState<CashFlowHorizonDays>(30);

  const cashFlowProjection = useMemo(
    () =>
      buildCashFlowProjection({
        accounts,
        transactions,
        boletos,
        scope,
        horizonDays,
      }),
    [accounts, transactions, boletos, scope, horizonDays]
  );

  const periodTrs = useMemo(() => {
    const byScope = transactions.filter((t) => {
      if (t.status === 'CANCELLED') return false;
      if (scope === 'CPF') return t.entityId === 'CPF';
      if (scope === 'CNPJ') return t.entityId === 'CNPJ';
      return true;
    });
    return filterTransactionsByPeriod(byScope, period);
  }, [transactions, scope, period]);

  const summary = useMemo(() => {
    const metrics = calculatePeriodMetricsCents(periodTrs);
    const scopedAcc = accounts.filter((a) => (scope === 'CONSOLIDATED' ? true : a.entityId === scope));
    const scopedAssets = assets.filter((a) => (scope === 'CONSOLIDATED' ? true : a.entityId === scope));
    const scopedDebts = debts.filter((d) => (scope === 'CONSOLIDATED' ? true : d.entityId === scope));

    const patrimony = calculateConsolidatedPatrimonyCents({
      accounts: scopedAcc,
      transactions: transactions.filter((t) =>
        scope === 'CONSOLIDATED' ? true : t.entityId === scope
      ),
      assets: scopedAssets,
      debts: scopedDebts,
    });

    const pendingBolCents = boletos
      .filter((b) => b.status === 'PENDING' && (scope === 'CONSOLIDATED' ? true : b.entityId === scope))
      .reduce((acc, b) => acc + toCents(b.valorOriginal), 0);

    return {
      income: fromCents(metrics.confirmedIncomeCents),
      expense: fromCents(metrics.confirmedExpenseCents),
      net: fromCents(metrics.realizedNetCents),
      projectedNet: fromCents(metrics.projectedNetCents),
      accountsBalance: fromCents(patrimony.realizedAccountsBalanceCents),
      projectedAccountsBalance: fromCents(patrimony.projectedAccountsBalanceCents),
      netWorth: fromCents(patrimony.realizedNetWorthCents),
      pendingBoletos: fromCents(pendingBolCents),
    };
  }, [periodTrs, accounts, transactions, assets, debts, boletos, scope]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { incomeCents: number; expenseCents: number }>();
    periodTrs
      .filter((t) => t.status === 'CONFIRMED' && !t.isInternalTransfer)
      .forEach((t) => {
        const curr = map.get(t.category) || { incomeCents: 0, expenseCents: 0 };
        const amtCents = getTransactionAmountCents(t);
        if (t.direction === 'INCOME') curr.incomeCents += amtCents;
        else curr.expenseCents += amtCents;
        map.set(t.category, curr);
      });

    return Array.from(map.entries())
      .map(([category, vals]) => ({
        category,
        income: fromCents(vals.incomeCents),
        expense: fromCents(vals.expenseCents),
      }))
      .sort((a, b) => b.expense + b.income - (a.expense + a.income));
  }, [periodTrs]);

  const entityComparison = useMemo(() => {
    const calc = (entity: 'CPF' | 'CNPJ') => {
      const list = filterTransactionsByPeriod(
        transactions.filter((t) => t.entityId === entity && t.status === 'CONFIRMED' && !t.isInternalTransfer),
        period
      );
      const metrics = calculatePeriodMetricsCents(list);
      return {
        inc: fromCents(metrics.confirmedIncomeCents),
        exp: fromCents(metrics.confirmedExpenseCents),
        net: fromCents(metrics.realizedNetCents),
      };
    };
    return { cpf: calc('CPF'), cnpj: calc('CNPJ') };
  }, [transactions, period]);

  const handleExportCsv = () => {
    const header = ['Data', 'Vínculo', 'Descrição', 'Categoria', 'Conta', 'Natureza', 'Valor', 'Status'];
    const rows = periodTrs.map((t) => [
      sanitizeCellForSheet(t.date),
      sanitizeCellForSheet(t.entityId),
      sanitizeCellForSheet(t.description),
      sanitizeCellForSheet(t.category),
      sanitizeCellForSheet(t.account),
      sanitizeCellForSheet(t.direction === 'INCOME' ? 'Receita' : 'Despesa'),
      fromCents(getTransactionAmountCents(t)).toFixed(2).replace('.', ','),
      sanitizeCellForSheet(t.status),
    ]);

    const csvContent =
      '\uFEFF' +
      [header, ...rows]
        .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-savio-financas-${period}-${scope.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
            Relatórios Gerenciais
          </h2>
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Consolidado real para a competência <strong className="font-semibold text-[#0F172A] dark:text-slate-200">{period === 'ALL' ? 'Todo período' : period}</strong> (escopo {scope}).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-[#059669] hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Exportar CSV Seguro
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="sf-card-interactive px-4 min-h-11 text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-slate-200 flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Real KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs text-[#64748B] font-medium">Resultado do Período</span>
          <div
            className={`font-money text-lg sm:text-xl font-extrabold mt-1 ${
              summary.net >= 0 ? 'text-[#059669] dark:text-[#10B981]' : 'text-[#DC3545] dark:text-red-400'
            }`}
          >
            {formatarValor(summary.net, hideValues)}
          </div>
          <small className="font-money text-[11px] text-[#64748B] mt-1 block">
            Rec: {formatarValor(summary.income, hideValues)} · Desp: {formatarValor(summary.expense, hideValues)}
          </small>
        </div>

        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs text-[#64748B] font-medium">Saldo em Contas</span>
          <div className="font-money text-lg sm:text-xl font-extrabold text-[#0F172A] dark:text-white mt-1">
            {formatarValor(summary.accountsBalance, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block">Liquidez imediata</small>
        </div>

        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs text-[#64748B] font-medium">Patrimônio Líquido Estimado</span>
          <div className="font-money text-lg sm:text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">
            {formatarValor(summary.netWorth, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block">Contas + Ativos − Dívidas</small>
        </div>

        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs text-[#64748B] font-medium">Boletos Pendentes</span>
          <div className="font-money text-lg sm:text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            {formatarValor(summary.pendingBoletos, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block">Obrigações em aberto</small>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
          Relatório detalhado por categoria
        </h3>
        {byCategory.length === 0 ? (
          <p className="text-xs text-[#64748B] py-4">Nenhum lançamento encontrado para este período.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {byCategory.map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() =>
                  onNavigate?.(scope === 'CNPJ' ? 'cnpj' : 'cpf', { category: item.category })
                }
                className="sf-card-interactive text-left p-3.5 flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="font-semibold text-[#0F172A] dark:text-slate-100">{item.category}</span>
                <div className="font-money text-right">
                  {item.income > 0 && (
                    <div className="font-bold text-[#059669] dark:text-[#10B981]">
                      {hideValues ? formatarValor(item.income, true) : `+ ${formatarValor(item.income, false)}`}
                    </div>
                  )}
                  {item.expense > 0 && (
                    <div className="font-bold text-red-700 dark:text-red-400">
                      {hideValues ? formatarValor(item.expense, true) : `− ${formatarValor(item.expense, false)}`}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CPF vs CNPJ Comparative */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
          Comparativo CPF vs CNPJ no período
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
            <div className="font-bold text-emerald-900 dark:text-emerald-300">Pessoal · CPF</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Receitas:</span>
              <strong className="font-money text-[#059669] dark:text-[#10B981]">
                {formatarValor(entityComparison.cpf.inc, hideValues)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Despesas:</span>
              <strong className="font-money text-red-700 dark:text-red-400">
                {formatarValor(entityComparison.cpf.exp, hideValues)}
              </strong>
            </div>
            <div className="flex justify-between pt-1 border-t border-emerald-200/70 dark:border-emerald-800">
              <span className="font-bold text-slate-700 dark:text-slate-200">Resultado:</span>
              <strong className="font-money text-[#0F172A] dark:text-white">
                {formatarValor(entityComparison.cpf.net, hideValues)}
              </strong>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-1">
            <div className="font-bold text-blue-900 dark:text-blue-300">Empresa · CNPJ / MEI</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Faturamento:</span>
              <strong className="font-money text-[#059669] dark:text-[#10B981]">
                {formatarValor(entityComparison.cnpj.inc, hideValues)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Custos / Despesas:</span>
              <strong className="font-money text-red-700 dark:text-red-400">
                {formatarValor(entityComparison.cnpj.exp, hideValues)}
              </strong>
            </div>
            <div className="flex justify-between pt-1 border-t border-blue-200/70 dark:border-blue-800">
              <span className="font-bold text-slate-700 dark:text-slate-200">Resultado Operacional:</span>
              <strong className="font-money text-[#0F172A] dark:text-white">
                {formatarValor(entityComparison.cnpj.net, hideValues)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* P3 Cash Flow Future Projection (30/60/90 days) */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="sf-icon-badge mt-0.5">
              <CalendarRange size={18} strokeWidth={2} />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                Projeção de Fluxo de Caixa Futuro ({horizonDays} dias)
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                Considera saldo realizado atual, lançamentos Pendentes/Planejados e boletos a vencer até {formatDateBR(cashFlowProjection.endDate)}.
              </p>
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 p-1 self-start">
            {([30, 60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHorizonDays(days)}
                className={`px-3 min-h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  horizonDays === days
                    ? 'bg-[#061E3E] text-white dark:bg-[#059669]'
                    : 'text-[#64748B] dark:text-slate-300'
                }`}
              >
                {days} dias
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-700">
            <span className="text-[#64748B] dark:text-slate-400 block">Saldo Inicial Real</span>
            <strong className="font-money text-base font-extrabold text-[#0F172A] dark:text-white">
              {formatarValor(cashFlowProjection.startingBalance, hideValues)}
            </strong>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <span className="text-[#059669] dark:text-emerald-300 block">Entradas Previstas</span>
            <strong className="font-money text-base font-extrabold text-[#059669] dark:text-[#10B981]">
              {hideValues ? formatarValor(cashFlowProjection.totalInflows, true) : `+ ${formatarValor(cashFlowProjection.totalInflows, false)}`}
            </strong>
          </div>
          <div className="p-3.5 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <span className="text-red-700 dark:text-red-300 block">Saídas + Boletos</span>
            <strong className="font-money text-base font-extrabold text-red-700 dark:text-red-400">
              {hideValues ? formatarValor(cashFlowProjection.totalOutflows, true) : `− ${formatarValor(cashFlowProjection.totalOutflows, false)}`}
            </strong>
          </div>
          <div
            className={`p-3.5 rounded-xl border ${
              cashFlowProjection.projectedEndBalanceCents < 0
                ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800'
                : 'bg-[#F8FAFC] dark:bg-slate-800/70 border-[#E2E8F0] dark:border-slate-700'
            }`}
          >
            <span className="text-[#64748B] dark:text-slate-400 block">Saldo Projetado ({horizonDays}d)</span>
            <strong
              className={`font-money text-base font-extrabold ${
                cashFlowProjection.projectedEndBalanceCents < 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-[#0F172A] dark:text-[#10B981]'
              }`}
            >
              {formatarValor(cashFlowProjection.projectedEndBalance, hideValues)}
            </strong>
          </div>
        </div>

        {cashFlowProjection.lowestBalanceCents < 0 && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Atenção: o saldo projetado atinge o menor ponto de{' '}
              <strong className="font-money">{formatarValor(cashFlowProjection.lowestBalance, hideValues)}</strong> em{' '}
              <strong>{formatDateBR(cashFlowProjection.lowestBalanceDate)}</strong>.
            </span>
          </div>
        )}

        {cashFlowProjection.events.length === 0 ? (
          <p className="text-xs text-[#64748B] dark:text-slate-400 py-2">
            Nenhum lançamento futuro ou boleto pendente encontrado para os próximos {horizonDays} dias.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-[#F8FAFC] dark:bg-slate-800 text-[#64748B] dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Data</th>
                  <th className="py-2.5 px-3 font-semibold">Evento previsto</th>
                  <th className="py-2.5 px-3 font-semibold">Origem</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Movimento</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Saldo Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cashFlowProjection.events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 text-[#64748B] dark:text-slate-400 whitespace-nowrap">
                      {formatDateBR(ev.date)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-100">
                      {ev.title}
                    </td>
                    <td className="py-2.5 px-3 text-[#64748B] dark:text-slate-400">
                      {ev.statusLabel}
                    </td>
                    <td
                      className={`font-money py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                        ev.direction === 'INCOME'
                          ? 'text-[#059669] dark:text-[#10B981]'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {hideValues
                        ? formatarValor(fromCents(ev.amountCents), true)
                        : `${ev.direction === 'INCOME' ? '+ ' : '− '}${formatarValor(fromCents(ev.amountCents), false)}`}
                    </td>
                    <td
                      className={`font-money py-2.5 px-3 text-right font-extrabold whitespace-nowrap ${
                        ev.runningBalanceCents < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-[#0F172A] dark:text-white'
                      }`}
                    >
                      {formatarValor(fromCents(ev.runningBalanceCents), hideValues)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
