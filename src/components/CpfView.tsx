import React, { useState, useMemo, useDeferredValue, useRef } from 'react';
import { Transaction, OPERATION_TYPE_LABELS, LedgerDrilldownFilter } from '../types';
import {
  filterTransactionsByPeriod,
  calculatePeriodMetricsCents,
  getTransactionAmountCents,
  fromCents,
  formatCurrencyBRL,
} from '../utils/financeCalculations';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { VirtualCardList, computeWindowedRange } from './VirtualList';
import { Search, Plus, Trash2, Pencil, RotateCcw, X, Eye } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface CpfViewProps {
  transactions: Transaction[];
  period: string;
  drilldownFilter?: LedgerDrilldownFilter | null;
  onClearDrilldownFilter?: () => void;
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onRestoreTransaction?: (id: string) => void;
  onTraceTransaction?: (tx: Transaction) => void;
}

export const CpfView: React.FC<CpfViewProps> = ({
  transactions,
  period,
  drilldownFilter = null,
  onClearDrilldownFilter,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onRestoreTransaction,
  onTraceTransaction,
}) => {
  const { hideValues } = usePrivacy();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showCancelled, setShowCancelled] = useState(false);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const cpfTrs = useMemo(() => {
    const byEntity = transactions.filter(
      (t) => t.entityId === 'CPF' && (showCancelled || t.status !== 'CANCELLED')
    );
    return filterTransactionsByPeriod(byEntity, period);
  }, [transactions, period, showCancelled]);

  const categories = useMemo(() => {
    const set = new Set<string>(cpfTrs.map((t) => t.category));
    return Array.from(set).sort();
  }, [cpfTrs]);

  const effectiveCategory = drilldownFilter?.category || selectedCategory;

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return cpfTrs
      .filter((t) => {
        const matchesSearch =
          !q ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.account.toLowerCase().includes(q) ||
          (t.counterparty || '').toLowerCase().includes(q) ||
          (t.externalId || '').toLowerCase().includes(q);
        const matchesCat = effectiveCategory === 'ALL' || t.category === effectiveCategory;
        const matchesAccount = !drilldownFilter?.accountId || t.accountId === drilldownFilter.accountId;
        const matchesDirection = !drilldownFilter?.direction || t.direction === drilldownFilter.direction;
        const matchesStatus = !drilldownFilter?.status || t.status === drilldownFilter.status;
        return matchesSearch && matchesCat && matchesAccount && matchesDirection && matchesStatus;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [cpfTrs, deferredSearch, effectiveCategory, drilldownFilter]);

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

  const { totalCpfIncome, totalCpfExpense, netCpf, pendingCpfNet, plannedCpfNet } = useMemo(() => {
    const metrics = calculatePeriodMetricsCents(cpfTrs);
    return {
      totalCpfIncome: fromCents(metrics.confirmedIncomeCents),
      totalCpfExpense: fromCents(metrics.confirmedExpenseCents),
      netCpf: fromCents(metrics.realizedNetCents),
      pendingCpfNet: fromCents(metrics.pendingNetCents),
      plannedCpfNet: fromCents(metrics.plannedNetCents),
    };
  }, [cpfTrs]);

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
            <span className="px-2 py-0.5 bg-[#ECFDF5] dark:bg-emerald-950 text-[#059669] dark:text-[#10B981] rounded-md text-[10px] font-bold">
              PESSOAL
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
              Finanças Pessoais · CPF
            </h2>
          </div>
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Competência: <strong className="font-semibold text-[#0F172A] dark:text-slate-200">{period === 'ALL' ? 'Todo período' : period}</strong> · Movimentações vinculadas à pessoa física (totais realizados confirmados).
          </p>
        </div>

        <button
          type="button"
          onClick={onAddTransaction}
          className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo lançamento pessoal
        </button>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="sf-card p-4">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Entradas Realizadas CPF</span>
          <div className="font-money text-xl font-bold text-[#059669] dark:text-[#10B981] mt-1">
            {formatarValor(totalCpfIncome, hideValues)}
          </div>
        </div>
        <div className="sf-card p-4">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Saídas Realizadas CPF</span>
          <div className="font-money text-xl font-bold text-[#DC3545] dark:text-red-400 mt-1">
            {formatarValor(totalCpfExpense, hideValues)}
          </div>
        </div>
        <div className="sf-card p-4">
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Resultado Realizado CPF</span>
          <div className="font-money text-xl font-bold text-[#0F172A] dark:text-white mt-1">
            {formatarValor(netCpf, hideValues)}
          </div>
          {(Math.abs(pendingCpfNet) >= 0.01 || Math.abs(plannedCpfNet) >= 0.01) && (
            <div className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 font-money">
              Previsto adicional: {formatarValor(pendingCpfNet + plannedCpfNet, hideValues)}
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="sf-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Buscar movimentação pessoal..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-[#E2E8F0] dark:border-slate-700 rounded-xl text-sm outline-none focus:border-[#059669] bg-[#F8FAFC] dark:bg-slate-800 dark:text-white min-h-12"
          />
        </div>

        <select
          aria-label="Filtrar por categoria"
          value={effectiveCategory}
          onChange={(e) => {
            if (drilldownFilter?.category && onClearDrilldownFilter) {
              onClearDrilldownFilter();
            }
            setSelectedCategory(e.target.value);
          }}
          className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
        >
          <option value="ALL">Todas as categorias</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer min-h-12 shrink-0">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="accent-emerald-600"
          />
          Exibir cancelados
        </label>
      </div>

      {drilldownFilter && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-500 dark:text-slate-400">Filtro ativo:</span>
          {drilldownFilter.accountLabel && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 font-bold">
              Conta: {drilldownFilter.accountLabel}
            </span>
          )}
          {drilldownFilter.category && (
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 font-bold">
              Categoria: {drilldownFilter.category}
            </span>
          )}
          {drilldownFilter.direction && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold">
              {drilldownFilter.direction === 'INCOME' ? 'Somente Receitas' : 'Somente Despesas'}
            </span>
          )}
          {onClearDrilldownFilter && (
            <button
              type="button"
              onClick={onClearDrilldownFilter}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X size={13} /> Limpar filtro
            </button>
          )}
        </div>
      )}

      {/* List / Table */}
      <div className="sf-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
            Histórico de lançamentos CPF
          </h3>
          <span className="text-xs text-[#64748B] dark:text-slate-400">{filtered.length} registros</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum lançamento encontrado para os filtros e período selecionados.
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

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md text-xs font-medium">
                        {t.category}
                      </span>
                      {renderStatusBadge(t)}
                      {t.operationType && (
                        <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-md text-[11px] font-medium">
                          {OPERATION_TYPE_LABELS[t.operationType]}
                        </span>
                      )}
                      {t.counterparty && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                          · {t.counterparty}
                        </span>
                      )}
                      {t.isInternalTransfer && (
                        <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-md text-[11px] font-medium">
                          Transferência
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {onTraceTransaction && (t.origin === 'IMPORT' || t.origin === 'OPEN_FINANCE' || Boolean(t.idempotencyKey || t.externalId)) && (
                        <button
                          type="button"
                          onClick={() => onTraceTransaction(t)}
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-[#059669] dark:text-slate-400 dark:hover:text-[#10B981] rounded-lg cursor-pointer"
                          aria-label={`Rastrear movimentação ${t.description}`}
                          title="Rastrear movimentação"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onEditTransaction(t)}
                        className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-white rounded-lg cursor-pointer"
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
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg cursor-pointer"
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
                          className="min-w-10 min-h-10 grid place-items-center text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded-lg cursor-pointer"
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
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                        <td className="py-3.5 px-6 text-slate-500 dark:text-slate-400">
                          {t.date.split('-').reverse().join('/')}
                        </td>
                        <td className="py-3.5 px-6 font-medium text-slate-800 dark:text-slate-100">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{t.description}</span>
                            {renderStatusBadge(t)}
                            {t.operationType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-semibold">
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
                          <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md text-[10px] font-medium">
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
                                className="p-2 text-slate-400 hover:text-[#059669] hover:bg-[#ECFDF5] dark:hover:bg-emerald-950/50 rounded-lg transition-colors cursor-pointer"
                                aria-label={`Rastrear movimentação ${t.description}`}
                                title="Rastrear movimentação"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEditTransaction(t)}
                              className="p-2 text-slate-400 hover:text-[#0F172A] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
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
                                className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/60 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
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
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition-colors cursor-pointer"
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

