import React, { useEffect, useMemo, useState } from 'react';
import { Transaction, EntityScope } from '../types';
import {
  filterTransactionsByPeriod,
  fromCents,
  getTransactionAmountCents,
} from '../utils/financeCalculations';
import { formatDateBR, todayLocal } from '../utils/dateUtils';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface FinancialCalendarWidgetProps {
  transactions: Transaction[];
  scope: EntityScope;
  period: string;
  onEditTransaction?: (tx: Transaction) => void;
}

type WidgetTab = 'despesas' | 'receitas' | 'transf' | 'extrato' | 'agenda';
type AgendaFilter = 'all' | 'expense' | 'income' | 'transfer';

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const FinancialCalendarWidget: React.FC<FinancialCalendarWidgetProps> = ({
  transactions,
  scope,
  period,
  onEditTransaction,
}) => {
  const { hideValues } = usePrivacy();
  const [activeTab, setActiveTab] = useState<WidgetTab>('agenda');
  const [agendaFilter, setAgendaFilter] = useState<AgendaFilter>('all');

  const initialDate = useMemo(() => {
    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  }, [period]);

  const [currentDate, setCurrentDate] = useState<Date>(initialDate);
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(() => todayLocal());

  useEffect(() => {
    setCurrentDate(initialDate);
    const today = todayLocal();
    const ym = `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}`;
    if (today.startsWith(ym)) {
      setSelectedDateStr(today);
    } else {
      setSelectedDateStr(null);
    }
  }, [initialDate]);

  const scopedTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.status === 'CANCELLED') return false;
      if (scope === 'CPF' && t.entityId !== 'CPF') return false;
      if (scope === 'CNPJ' && t.entityId !== 'CNPJ') return false;
      return true;
    });
  }, [transactions, scope]);

  const periodTransactions = useMemo(() => {
    return filterTransactionsByPeriod(scopedTransactions, period)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [scopedTransactions, period]);

  const despesasList = useMemo(
    () => periodTransactions.filter((t) => t.direction === 'EXPENSE' && !t.isInternalTransfer),
    [periodTransactions]
  );

  const receitasList = useMemo(
    () => periodTransactions.filter((t) => t.direction === 'INCOME' && !t.isInternalTransfer),
    [periodTransactions]
  );

  const transferenciasList = useMemo(
    () => periodTransactions.filter((t) => Boolean(t.isInternalTransfer)),
    [periodTransactions]
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: Array<{ dayNumber: number | null; dateStr: string | null }> = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateStr: null });
    }

    for (let d = 1; d <= totalDays; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      days.push({ dayNumber: d, dateStr });
    }

    return days;
  }, [year, month]);

  const txByDateMap = useMemo(() => {
    const map = new Map<
      string,
      Array<{
        tx: Transaction;
        tipo: 'income' | 'expense' | 'transfer';
        amount: number;
      }>
    >();

    for (const t of scopedTransactions) {
      if (!t.date) continue;
      const dateKey = t.date.slice(0, 10);
      const tipo: 'income' | 'expense' | 'transfer' = t.isInternalTransfer
        ? 'transfer'
        : t.direction === 'INCOME'
        ? 'income'
        : 'expense';

      if (agendaFilter !== 'all' && tipo !== agendaFilter) continue;

      const list = map.get(dateKey) || [];
      list.push({
        tx: t,
        tipo,
        amount: fromCents(getTransactionAmountCents(t)),
      });
      map.set(dateKey, list);
    }
    return map;
  }, [scopedTransactions, agendaFilter]);

  const handlePrevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDateStr(null);
  };

  const handleNextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDateStr(null);
  };

  const selectedDayMovs = useMemo(() => {
    if (!selectedDateStr) return [];
    return txByDateMap.get(selectedDateStr) || [];
  }, [selectedDateStr, txByDateMap]);

  const renderTransactionRows = (items: Transaction[], emptyMessage: string) => {
    const totalAmount = items.reduce(
      (acc, t) => acc + fromCents(getTransactionAmountCents(t)),
      0
    );

    if (items.length === 0) {
      return (
        <div className="p-6 text-center text-xs text-slate-400">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-500 dark:text-slate-400 font-medium">
            {items.length} lançamento{items.length !== 1 ? 's' : ''} no período
          </span>
          <span className="font-bold text-[#082B5C] dark:text-white">
            Total: {formatarValor(totalAmount, hideValues)}
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 max-h-80 overflow-y-auto">
          {items.map((tx) => {
            const amt = fromCents(getTransactionAmountCents(tx));
            const isTransfer = Boolean(tx.isInternalTransfer);
            const isIncome = tx.direction === 'INCOME';
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onEditTransaction?.(tx)}
                className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    {tx.description}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                    <span>{formatDateBR(tx.date)}</span>
                    <span>·</span>
                    <span className="truncate">{tx.category}</span>
                    {tx.account && (
                      <>
                        <span>·</span>
                        <span className="truncate">{tx.account}</span>
                      </>
                    )}
                  </div>
                </div>
                <div
                  className={`text-xs sm:text-sm font-extrabold shrink-0 ${
                    isTransfer
                      ? 'text-blue-600 dark:text-blue-400'
                      : isIncome
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {hideValues
                    ? formatarValor(amt, true)
                    : `${isTransfer ? '' : isIncome ? '+ ' : '− '}${formatarValor(amt, false)}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const tabs: Array<{ id: WidgetTab; label: string }> = [
    { id: 'despesas', label: 'Despesas' },
    { id: 'receitas', label: 'Receitas' },
    { id: 'transf', label: 'Transf.' },
    { id: 'extrato', label: 'Extrato' },
    { id: 'agenda', label: '📅 Agenda' },
  ];

  const filterButtons: Array<{ id: AgendaFilter; label: string; dotClass?: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'expense', label: 'Pagamentos', dotClass: 'bg-[#ef4444]' },
    { id: 'income', label: 'Receitas', dotClass: 'bg-[#10b981]' },
    { id: 'transfer', label: 'Transferências', dotClass: 'bg-[#3b82f6]' },
  ];

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
      {/* Top 5-Tab Bar */}
      <div
        className="grid grid-cols-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Abas de transações e agenda"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 text-[11px] sm:text-xs font-bold border-b-2 transition-colors whitespace-nowrap truncate cursor-pointer ${
                isActive
                  ? 'text-red-600 dark:text-red-400 border-red-600 dark:border-red-400 bg-red-50/40 dark:bg-red-950/20'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="p-3 sm:p-4 bg-slate-50/50 dark:bg-slate-900/50">
        {activeTab === 'despesas' &&
          renderTransactionRows(despesasList, 'Nenhuma despesa registrada neste período e escopo.')}

        {activeTab === 'receitas' &&
          renderTransactionRows(receitasList, 'Nenhuma receita registrada neste período e escopo.')}

        {activeTab === 'transf' &&
          renderTransactionRows(transferenciasList, 'Nenhuma transferência interna neste período e escopo.')}

        {activeTab === 'extrato' &&
          renderTransactionRows(periodTransactions, 'Nenhuma movimentação encontrada para este período e escopo.')}

        {activeTab === 'agenda' && (
          <div className="space-y-3">
            {/* Quick Filters inside Agenda */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {filterButtons.map((fb) => {
                const isSelected = agendaFilter === fb.id;
                return (
                  <button
                    key={fb.id}
                    type="button"
                    onClick={() => setAgendaFilter(fb.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#082B5C] dark:bg-emerald-600 text-white border-[#082B5C] dark:border-emerald-600'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {fb.dotClass && <span className={`w-2 h-2 rounded-full ${fb.dotClass}`} />}
                    <span>{fb.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Minimizable Calendar Drawer */}
            <details
              className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
              open
            >
              <summary className="px-3.5 py-2.5 text-xs font-bold text-[#082B5C] dark:text-white flex items-center justify-between cursor-pointer select-none">
                <span>📅 Minimizar / Expandir Calendário</span>
                <span className="text-[10px] text-slate-400 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>

              <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                {/* Month Navigation */}
                <div className="flex justify-between items-center py-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-8 h-8 text-sm font-bold flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                    aria-label="Mês anterior"
                  >
                    ‹
                  </button>
                  <strong className="text-xs sm:text-sm font-extrabold text-[#082B5C] dark:text-white">
                    {MONTH_NAMES[month]} {year}
                  </strong>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg w-8 h-8 text-sm font-bold flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                    aria-label="Próximo mês"
                  >
                    ›
                  </button>
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10b981] inline-block" /> Receita
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444] inline-block" /> Pagamento
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3b82f6] inline-block" /> Transferência
                  </span>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 text-center gap-1">
                  {WEEKDAY_LABELS.map((w, idx) => (
                    <div key={idx} className="text-[11px] font-bold text-slate-400 pb-0.5">
                      {w}
                    </div>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 text-center gap-1">
                  {daysInMonth.map((item, idx) => {
                    if (!item.dayNumber || !item.dateStr) {
                      return <div key={`empty-${idx}`} className="h-10" />;
                    }

                    const dayMovs = txByDateMap.get(item.dateStr) || [];
                    const hasIncome = dayMovs.some((m) => m.tipo === 'income');
                    const hasExpense = dayMovs.some((m) => m.tipo === 'expense');
                    const hasTransfer = dayMovs.some((m) => m.tipo === 'transfer');
                    const isSelected = selectedDateStr === item.dateStr;

                    return (
                      <button
                        key={item.dateStr}
                        type="button"
                        onClick={() => setSelectedDateStr(item.dateStr)}
                        className={`h-10 rounded-lg p-1 text-xs font-semibold flex flex-col items-center justify-between transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-[#082B5C] dark:border-blue-400 bg-blue-50 dark:bg-blue-950/60 shadow-xs'
                            : 'border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500'
                        }`}
                      >
                        <span className="text-slate-800 dark:text-slate-200">{item.dayNumber}</span>
                        <div className="flex gap-1 h-1.5 items-center">
                          {hasIncome && <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />}
                          {hasExpense && <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />}
                          {hasTransfer && <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>

            {/* Selected Day Movements */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs space-y-2">
              {!selectedDateStr ? (
                <p className="text-slate-400 text-center py-2">
                  Toque em um dia marcado no calendário para ver os lançamentos.
                </p>
              ) : selectedDayMovs.length === 0 ? (
                <p className="text-slate-400 text-center py-2">
                  Nenhuma movimentação em {selectedDateStr.split('-').reverse().join('/')}.
                </p>
              ) : (
                <div className="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="font-bold text-slate-700 dark:text-slate-300 pb-1">
                    Movimentações de {selectedDateStr.split('-').reverse().join('/')}:
                  </div>
                  {selectedDayMovs.map((m) => {
                    const badgeCls =
                      m.tipo === 'income'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : m.tipo === 'expense'
                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
                    const labelName =
                      m.tipo === 'income'
                        ? 'Receita'
                        : m.tipo === 'expense'
                        ? 'Pagamento'
                        : 'Transferência';

                    return (
                      <button
                        key={m.tx.id}
                        type="button"
                        onClick={() => onEditTransaction?.(m.tx)}
                        className="w-full text-left pt-2 flex justify-between items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-1 py-1 transition-colors cursor-pointer"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <strong className="block text-slate-900 dark:text-white truncate">
                            {m.tx.description}
                          </strong>
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeCls}`}>
                            {labelName}
                          </span>
                        </div>
                        <strong
                          className={`shrink-0 ${
                            m.tipo === 'income'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : m.tipo === 'expense'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {hideValues
                            ? formatarValor(m.amount, true)
                            : `${m.tipo === 'income' ? '+ ' : m.tipo === 'expense' ? '− ' : ''}${formatarValor(m.amount, false)}`}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
