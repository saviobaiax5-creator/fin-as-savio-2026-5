import React, { useMemo, useState, useDeferredValue, useRef } from 'react';
import { Transaction, Boleto, OPERATION_TYPE_LABELS, LedgerDrilldownFilter } from '../types';
import {
  filterTransactionsByPeriod,
  calculatePeriodMetricsCents,
  getTransactionAmountCents,
  toCents,
  fromCents,
  formatCurrencyBRL,
} from '../utils/financeCalculations';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { VirtualCardList, computeWindowedRange } from './VirtualList';
import { Plus, Pencil, Trash2, Search, RotateCcw, X, Eye } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface CnpjViewProps {
  transactions: Transaction[];
  boletos: Boleto[];
  period: string;
  drilldownFilter?: LedgerDrilldownFilter | null;
  onClearDrilldownFilter?: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onRestoreTransaction?: (id: string) => void;
  onTraceTransaction?: (tx: Transaction) => void;
  onNavigate: (tab: string) => void;
}

export const CnpjView: React.FC<CnpjViewProps> = ({
  transactions,
  boletos,
  period,
  drilldownFilter = null,
  onClearDrilldownFilter,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onRestoreTransaction,
  onTraceTransaction,
  onNavigate,
}) => {
  const { hideValues } = usePrivacy();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [showCancelled, setShowCancelled] = useState(false);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const cnpjTrs = useMemo(() => {
    const byEntity = transactions.filter(
      (t) => t.entityId === 'CNPJ' && (showCancelled || t.status !== 'CANCELLED')
    );
    return filterTransactionsByPeriod(byEntity, period).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, period, showCancelled]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return cnpjTrs.filter((t) => {
      const matchesSearch =
        !q ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.account.toLowerCase().includes(q) ||
        (t.counterparty || '').toLowerCase().includes(q) ||
        (t.externalId || '').toLowerCase().includes(q);
      const matchesCat = !drilldownFilter?.category || t.category === drilldownFilter.category;
      const matchesAccount = !drilldownFilter?.accountId || t.accountId === drilldownFilter.accountId;
      const matchesDirection = !drilldownFilter?.direction || t.direction === drilldownFilter.direction;
      const matchesStatus = !drilldownFilter?.status || t.status === drilldownFilter.status;
      return matchesSearch && matchesCat && matchesAccount && matchesDirection && matchesStatus;
    });
  }, [cnpjTrs, deferredSearch, drilldownFilter]);

  const tableRange = useMemo(
    () =>
      computeWindowedRange({
        totalCount: filtered.length,
        scrollTop: tableScrollTop,
        viewportHeight: tableContainerRef.current?.clientHeight || 560,
        itemHeight: 54,
        threshold: 35,
      }),
    [filtered.length, tableScrollTop]
  );

  const visibleDesktopRows = tableRange.isVirtualized
    ? filtered.slice(tableRange.startIndex, tableRange.endIndex)
    : filtered;

  const { totalCnpjIncome, totalCnpjExpense, operationalResult, pendingCnpjNet } = useMemo(() => {
    const metrics = calculatePeriodMetricsCents(cnpjTrs);
    return {
      totalCnpjIncome: fromCents(metrics.confirmedIncomeCents),
      totalCnpjExpense: fromCents(metrics.confirmedExpenseCents),
      operationalResult: fromCents(metrics.realizedNetCents),
      pendingCnpjNet: fromCents(metrics.pendingNetCents + metrics.plannedNetCents),
    };
  }, [cnpjTrs]);

  const pendingCnpjBoletos = useMemo(() => {
    return boletos.filter((b) => b.entityId === 'CNPJ' && b.status === 'PENDING');
  }, [boletos]);

  const totalPendingCnpjBoletos = useMemo(() => {
    return fromCents(pendingCnpjBoletos.reduce((acc, b) => acc + toCents(b.valorOriginal), 0));
  }, [pendingCnpjBoletos]);

  const cnpjRevenues = useMemo(() => {
    return cnpjTrs.filter(
      (t) => t.status === 'CONFIRMED' && t.direction === 'INCOME' && !t.isInternalTransfer
    );
  }, [cnpjTrs]);

  const handleDelete = (t: Transaction) => {
    onDeleteTransaction(t.id);
  };

  const renderStatusBadge = (t: Transaction) => {
    if (t.reversedTransactionId) {
      return (
        <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 rounded-md text-[10px] font-semibold">
          Estorno
        </span>
      );
    }
    if (t.reversalTransactionId) {
      return (
        <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-[10px] font-semibold">
          Estornado
        </span>
      );
    }
    if (t.status === 'PENDING') {
      return (
        <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-md text-[10px] font-semibold">
          Pendente
        </span>
      );
    }
    if (t.status === 'CANCELLED') {
      return (
        <span className="px-2 py-0.5 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-md text-[10px] font-semibold">
          Cancelado
        </span>
      );
    }
    if (t.status === 'PLANNED') {
      return (
        <span className="px-2 py-0.5 bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 rounded-md text-[10px] font-semibold">
          Planejado
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 rounded-md text-[10px] font-bold">
              EMPRESA · MEI
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
              Empresa · CNPJ
            </h2>
          </div>
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Competência: <strong className="font-semibold text-[#0F172A] dark:text-slate-200">{period === 'ALL' ? 'Todo período' : period}</strong> · Controle separado das movimentações empresariais (totais confirmados).
          </p>
        </div>
        <button
          type="button"
          onClick={onAddTransaction}
          className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Registrar movimentação CNPJ
        </button>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-xl text-xs flex items-center gap-3">
        <span>
          <strong>Regra de Separação:</strong> Transferências entre contas próprias não são somadas como faturamento.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Receita Confirmada CNPJ</span>
          <div className="font-money text-lg sm:text-2xl font-bold text-[#059669] dark:text-[#10B981] mt-1.5">
            {formatarValor(totalCnpjIncome, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block">Faturamento realizado</small>
        </div>

        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Despesas Confirmadas PJ</span>
          <div className="font-money text-lg sm:text-2xl font-bold text-[#DC3545] dark:text-red-400 mt-1.5">
            {formatarValor(totalCnpjExpense, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block">Custos e insumos pagos</small>
        </div>

        <div className="sf-card p-4 sm:p-5">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Resultado operacional</span>
          <div className="font-money text-lg sm:text-2xl font-bold text-[#0F172A] dark:text-white mt-1.5">
            {formatarValor(operationalResult, hideValues)}
          </div>
          <small className="text-[11px] text-[#64748B] mt-1 block font-money">
            {Math.abs(pendingCnpjNet) >= 0.01
              ? `Previsto adicional: ${formatarValor(pendingCnpjNet, hideValues)}`
              : 'Receitas menos despesas'}
          </small>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('boletos')}
          className="sf-card-interactive text-left p-4 sm:p-5 cursor-pointer"
        >
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Obrigações / Boletos PJ</span>
          <div className="font-money text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1.5">
            {formatarValor(totalPendingCnpjBoletos, hideValues)}
          </div>
          <small className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 block">
            {pendingCnpjBoletos.length} pendente{pendingCnpjBoletos.length !== 1 ? 's' : ''}
          </small>
        </button>
      </div>

      {/* Real revenues & obligations derived from state */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="sf-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Entradas de serviços e vendas (confirmadas)
            </h3>
            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[10px] font-bold">
              CNPJ
            </span>
          </div>
          {cnpjRevenues.length === 0 ? (
            <p className="text-xs text-[#64748B] py-4">Nenhuma receita confirmada CNPJ registrada neste período.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {cnpjRevenues.map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0F172A] dark:text-slate-100 truncate">{r.description}</p>
                    <small className="text-[#64748B]">
                      {r.date.split('-').reverse().join('/')} · {r.category}
                    </small>
                  </div>
                  <span className="font-money font-bold text-[#059669] dark:text-[#10B981] shrink-0">
                    {formatarValor(fromCents(getTransactionAmountCents(r)), hideValues)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sf-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">Boletos e guias PJ pendentes</h3>
            <button
              type="button"
              onClick={() => onNavigate('boletos')}
              className="text-xs font-semibold text-[#059669] dark:text-[#10B981] hover:underline cursor-pointer"
            >
              Ver em Boletos
            </button>
          </div>
          {pendingCnpjBoletos.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">Nenhuma guia ou boleto PJ pendente no momento.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {pendingCnpjBoletos.map((b) => (
                <li key={b.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{b.beneficiario}</p>
                    <small className="text-slate-400">
                      Vencimento: {b.vencimento.split('-').reverse().join('/')}
                    </small>
                  </div>
                  <span className="font-money px-2.5 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-md font-bold shrink-0">
                    {formatarValor(b.valorOriginal, hideValues)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Search + Transactions */}
      <div className="sf-card overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
            Movimentações empresariais ({filtered.length})
          </h3>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar movimentação PJ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50/50 dark:bg-slate-800 dark:text-white outline-none focus:border-emerald-500 min-h-11"
              />
            </div>
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-h-11 shrink-0">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
                className="accent-emerald-600"
              />
              Exibir cancelados
            </label>
          </div>
        </div>

        {drilldownFilter && (
          <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500 dark:text-slate-400">Filtro ativo:</span>
            {drilldownFilter.accountLabel && (
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold">
                Conta: {drilldownFilter.accountLabel}
              </span>
            )}
            {drilldownFilter.category && (
              <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 font-bold">
                Categoria: {drilldownFilter.category}
              </span>
            )}
            {drilldownFilter.direction && (
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                {drilldownFilter.direction === 'INCOME' ? 'Somente Receitas' : 'Somente Despesas'}
              </span>
            )}
            {onClearDrilldownFilter && (
              <button
                type="button"
                onClick={onClearDrilldownFilter}
                className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <X size={12} /> Limpar filtro
              </button>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma movimentação CNPJ encontrada no período selecionado.
          </div>
        ) : !isDesktop ? (
          <VirtualCardList
            items={filtered}
            itemHeight={156}
            getKey={(t) => t.id}
            className="divide-y divide-slate-100 dark:divide-slate-800"
            renderItem={(t) => {
              const displayAmount = fromCents(getTransactionAmountCents(t));
              const isConfirmed = t.status === 'CONFIRMED';
              const hasReversalLock = Boolean(t.reversedTransactionId || t.reversalTransactionId);
              return (
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {t.description}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.date.split('-').reverse().join('/')} · {t.account}
                      </div>
                    </div>
                    <div
                      className={`font-money text-sm font-extrabold shrink-0 ${
                        t.direction === 'INCOME'
                          ? 'text-[#059669] dark:text-[#10B981]'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {hideValues
                        ? formatarValor(displayAmount, true)
                        : `${t.direction === 'INCOME' ? '+ ' : '− '}${formatarValor(displayAmount, false)}`}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium">
                        {t.category}
                      </span>
                      {renderStatusBadge(t)}
                      {t.operationType && (
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md text-[11px] font-medium">
                          {OPERATION_TYPE_LABELS[t.operationType]}
                        </span>
                      )}
                      {t.counterparty && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                          · {t.counterparty}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {onTraceTransaction && (t.origin === 'IMPORT' || t.origin === 'OPEN_FINANCE' || Boolean(t.idempotencyKey || t.externalId)) && (
                        <button
                          type="button"
                          onClick={() => onTraceTransaction(t)}
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-[#059669] dark:text-slate-400 dark:hover:text-[#10B981] cursor-pointer"
                          aria-label={`Rastrear movimentação ${t.description}`}
                          title="Rastrear movimentação"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEditTransaction(t)}
                        className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-white cursor-pointer"
                        aria-label={`Editar ${t.description}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {t.status === 'CANCELLED' ? (
                        onRestoreTransaction && (
                          <button
                            type="button"
                            onClick={() => onRestoreTransaction(t.id)}
                            className="px-2.5 min-h-9 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                          </button>
                        )
                      ) : isConfirmed ? (
                        <button
                          type="button"
                          disabled={hasReversalLock}
                          onClick={() => handleDelete(t)}
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          aria-label={
                            hasReversalLock
                              ? `Estorno já vinculado a ${t.description}`
                              : `Estornar ${t.description}`
                          }
                          title={
                            hasReversalLock
                              ? 'Lançamento já possui estorno vinculado'
                              : 'Estornar lançamento'
                          }
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer"
                          aria-label={`Cancelar ${t.description}`}
                          title="Cancelar lançamento"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        ) : (
          <div
            ref={tableContainerRef}
            onScroll={(e) => setTableScrollTop(e.currentTarget.scrollTop)}
            className={`overflow-x-auto ${tableRange.isVirtualized ? 'max-h-[68vh] overflow-y-auto' : ''}`}
          >
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 dark:bg-slate-800/95 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-6 font-semibold">Data</th>
                  <th className="py-3 px-6 font-semibold">Descrição</th>
                  <th className="py-3 px-6 font-semibold">Categoria</th>
                  <th className="py-3 px-6 font-semibold">Conta</th>
                  <th className="py-3 px-6 font-semibold text-right">Valor</th>
                  <th className="py-3 px-6 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tableRange.topPaddingPx > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={6} style={{ height: tableRange.topPaddingPx, padding: 0 }} />
                  </tr>
                )}
                {visibleDesktopRows.map((t) => {
                  const displayAmount = fromCents(getTransactionAmountCents(t));
                  const isConfirmed = t.status === 'CONFIRMED';
                  const hasReversalLock = Boolean(t.reversedTransactionId || t.reversalTransactionId);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400">
                          {t.date.split('-').reverse().join('/')}
                        </td>
                        <td className="py-3.5 px-6 font-medium text-slate-800 dark:text-slate-100">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{t.description}</span>
                            {renderStatusBadge(t)}
                            {t.operationType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                                {OPERATION_TYPE_LABELS[t.operationType]}
                              </span>
                            )}
                            {t.isInternalTransfer && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                Transferência
                              </span>
                            )}
                          </div>
                          {(t.counterparty || t.externalId) && (
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {t.counterparty && <span>{t.counterparty}</span>}
                              {t.counterparty && t.externalId && <span> · </span>}
                              {t.externalId && <span className="font-mono">ID: {t.externalId}</span>}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-md text-[10px] font-medium">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-slate-600 dark:text-slate-300">{t.account}</td>
                        <td
                          className={`font-money py-3.5 px-6 text-right font-bold ${
                            t.direction === 'INCOME'
                              ? 'text-[#059669] dark:text-[#10B981]'
                              : 'text-red-700 dark:text-red-400'
                          }`}
                        >
                          {hideValues
                            ? formatarValor(displayAmount, true)
                            : `${t.direction === 'INCOME' ? '+ ' : '− '}${formatarValor(displayAmount, false)}`}
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <div className="inline-flex items-center gap-1">
                            {onTraceTransaction && (t.origin === 'IMPORT' || t.origin === 'OPEN_FINANCE' || Boolean(t.idempotencyKey || t.externalId)) && (
                              <button
                                type="button"
                                onClick={() => onTraceTransaction(t)}
                                className="p-2 text-slate-400 hover:text-[#059669] hover:bg-[#ECFDF5] dark:hover:bg-emerald-950/50 rounded-lg cursor-pointer"
                                aria-label={`Rastrear movimentação ${t.description}`}
                                title="Rastrear movimentação"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEditTransaction(t)}
                              className="p-2 text-slate-400 hover:text-[#0F172A] dark:hover:text-white rounded-lg cursor-pointer"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {t.status === 'CANCELLED' ? (
                              onRestoreTransaction && (
                                <button
                                  type="button"
                                  onClick={() => onRestoreTransaction(t.id)}
                                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="Restaurar lançamento cancelado"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                                </button>
                              )
                            ) : isConfirmed ? (
                              <button
                                type="button"
                                disabled={hasReversalLock}
                                onClick={() => handleDelete(t)}
                                className="p-2 text-slate-400 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg cursor-pointer"
                                title={
                                  hasReversalLock
                                    ? 'Lançamento já possui estorno vinculado'
                                    : 'Estornar lançamento'
                                }
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleDelete(t)}
                                className="p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                                title="Cancelar lançamento"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {tableRange.bottomPaddingPx > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={6} style={{ height: tableRange.bottomPaddingPx, padding: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

