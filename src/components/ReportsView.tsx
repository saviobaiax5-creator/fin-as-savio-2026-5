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
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
            Relatórios Gerenciais
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Consolidado real para a competência <strong>{period === 'ALL' ? 'Todo período' : period}</strong> (escopo {scope}).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" /> Exportar CSV Seguro
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Real KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-400 font-semibold">Resultado do Período</span>
          <div
            className={`text-lg sm:text-xl font-extrabold mt-1 ${
              summary.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
            }`}
          >
            R$ {formatCurrencyBRL(summary.net)}
          </div>
          <small className="text-[11px] text-slate-400 mt-1 block">
            Rec: R$ {formatCurrencyBRL(summary.income)} · Desp: R$ {formatCurrencyBRL(summary.expense)}
          </small>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-400 font-semibold">Saldo em Contas</span>
          <div className="text-lg sm:text-xl font-extrabold text-[#082B5C] dark:text-white mt-1">
            R$ {formatCurrencyBRL(summary.accountsBalance)}
          </div>
          <small className="text-[11px] text-slate-400 mt-1 block">Liquidez imediata</small>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-400 font-semibold">Patrimônio Líquido Estimado</span>
          <div className="text-lg sm:text-xl font-extrabold text-blue-700 dark:text-blue-400 mt-1">
            R$ {formatCurrencyBRL(summary.netWorth)}
          </div>
          <small className="text-[11px] text-slate-400 mt-1 block">Contas + Ativos − Dívidas</small>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xs">
          <span className="text-xs text-slate-400 font-semibold">Boletos Pendentes</span>
          <div className="text-lg sm:text-xl font-extrabold text-amber-700 dark:text-amber-400 mt-1">
            R$ {formatCurrencyBRL(summary.pendingBoletos)}
          </div>
          <small className="text-[11px] text-slate-400 mt-1 block">Obrigações em aberto</small>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
          Relatório detalhado por categoria
        </h3>
        {byCategory.length === 0 ? (
          <p className="text-xs text-slate-400 py-4">Nenhum lançamento encontrado para este período.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {byCategory.map((item) => (
              <button
                key={item.category}
                type="button"
                onClick={() =>
                  onNavigate?.(scope === 'CNPJ' ? 'cnpj' : 'cpf', { category: item.category })
                }
                className="text-left p-3.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-emerald-400 rounded-xl flex items-center justify-between gap-3 transition-colors cursor-pointer"
              >
                <span className="font-bold text-slate-800 dark:text-slate-100">{item.category}</span>
                <div className="text-right">
                  {item.income > 0 && (
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">
                      + R$ {formatCurrencyBRL(item.income)}
                    </div>
                  )}
                  {item.expense > 0 && (
                    <div className="font-bold text-red-700 dark:text-red-400">
                      − R$ {formatCurrencyBRL(item.expense)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CPF vs CNPJ Comparative */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
          Comparativo CPF vs CNPJ no período
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1">
            <div className="font-bold text-emerald-900 dark:text-emerald-300">Pessoal · CPF</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Receitas:</span>
              <strong className="text-emerald-700 dark:text-emerald-400">
                R$ {formatCurrencyBRL(entityComparison.cpf.inc)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Despesas:</span>
              <strong className="text-red-700 dark:text-red-400">
                R$ {formatCurrencyBRL(entityComparison.cpf.exp)}
              </strong>
            </div>
            <div className="flex justify-between pt-1 border-t border-emerald-200/70 dark:border-emerald-800">
              <span className="font-bold text-slate-700 dark:text-slate-200">Resultado:</span>
              <strong className="text-[#082B5C] dark:text-white">
                R$ {formatCurrencyBRL(entityComparison.cpf.net)}
              </strong>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-1">
            <div className="font-bold text-blue-900 dark:text-blue-300">Empresa · CNPJ / MEI</div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Faturamento:</span>
              <strong className="text-emerald-700 dark:text-emerald-400">
                R$ {formatCurrencyBRL(entityComparison.cnpj.inc)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-300">Custos / Despesas:</span>
              <strong className="text-red-700 dark:text-red-400">
                R$ {formatCurrencyBRL(entityComparison.cnpj.exp)}
              </strong>
            </div>
            <div className="flex justify-between pt-1 border-t border-blue-200/70 dark:border-blue-800">
              <span className="font-bold text-slate-700 dark:text-slate-200">Resultado Operacional:</span>
              <strong className="text-[#082B5C] dark:text-white">
                R$ {formatCurrencyBRL(entityComparison.cnpj.net)}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* P3 Cash Flow Future Projection (30/60/90 days) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#082B5C] dark:text-white flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-emerald-600" />
              Projeção de Fluxo de Caixa Futuro ({horizonDays} dias)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Considera saldo realizado atual, lançamentos Pendentes/Planejados e boletos a vencer até {formatDateBR(cashFlowProjection.endDate)}.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1 self-start">
            {([30, 60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHorizonDays(days)}
                className={`px-3 min-h-9 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  horizonDays === days
                    ? 'bg-[#082B5C] text-white dark:bg-[#00A65A]'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {days} dias
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 block">Saldo Inicial Real</span>
            <strong className="text-base font-extrabold text-[#082B5C] dark:text-white">
              R$ {formatCurrencyBRL(cashFlowProjection.startingBalance)}
            </strong>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <span className="text-emerald-700 dark:text-emerald-300 block">Entradas Previstas</span>
            <strong className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
              + R$ {formatCurrencyBRL(cashFlowProjection.totalInflows)}
            </strong>
          </div>
          <div className="p-3.5 rounded-xl bg-red-50/60 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <span className="text-red-700 dark:text-red-300 block">Saídas + Boletos</span>
            <strong className="text-base font-extrabold text-red-700 dark:text-red-400">
              − R$ {formatCurrencyBRL(cashFlowProjection.totalOutflows)}
            </strong>
          </div>
          <div
            className={`p-3.5 rounded-xl border ${
              cashFlowProjection.projectedEndBalanceCents < 0
                ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800'
                : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className="text-slate-500 dark:text-slate-400 block">Saldo Projetado ({horizonDays}d)</span>
            <strong
              className={`text-base font-extrabold ${
                cashFlowProjection.projectedEndBalanceCents < 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-[#082B5C] dark:text-emerald-400'
              }`}
            >
              R$ {formatCurrencyBRL(cashFlowProjection.projectedEndBalance)}
            </strong>
          </div>
        </div>

        {cashFlowProjection.lowestBalanceCents < 0 && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              Atenção: o saldo projetado atinge o menor ponto de{' '}
              <strong>R$ {formatCurrencyBRL(cashFlowProjection.lowestBalance)}</strong> em{' '}
              <strong>{formatDateBR(cashFlowProjection.lowestBalanceDate)}</strong>.
            </span>
          </div>
        )}

        {cashFlowProjection.events.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
            Nenhum lançamento futuro ou boleto pendente encontrado para os próximos {horizonDays} dias.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
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
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDateBR(ev.date)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-100">
                      {ev.title}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">
                      {ev.statusLabel}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                        ev.direction === 'INCOME'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {ev.direction === 'INCOME' ? '+ ' : '− '}
                      R$ {formatCurrencyBRL(fromCents(ev.amountCents))}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-extrabold whitespace-nowrap ${
                        ev.runningBalanceCents < 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-[#082B5C] dark:text-white'
                      }`}
                    >
                      R$ {formatCurrencyBRL(fromCents(ev.runningBalanceCents))}
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
