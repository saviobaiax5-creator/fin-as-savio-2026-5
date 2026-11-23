import React, { useEffect, useMemo, useState } from 'react';
import { Transaction, EntityScope } from '../types';
import {
  filterTransactionsByPeriod,
  fromCents,
  getTransactionAmountCents,
} from '../utils/financeCalculations';
import { formatDateBR, todayLocal } from '../utils/dateUtils';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
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
        <div className="p-6 text-center text-xs text-[#64748B] dark:text-slate-300">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="font-sans text-[#64748B] dark:text-slate-300 font-medium">
            {items.length} lançamento{items.length !== 1 ? 's' : ''} no período
          </span>
          <span className="font-money font-bold text-[#0F172A] dark:text-white">
            Total: {formatarValor(totalAmount, hideValues)}
          </span>
        </div>

        <div className="sf-grouped-card sf-grouped-divider max-h-80 overflow-y-auto">
          {items.map((tx) => {
            const amt = fromCents(getTransactionAmountCents(tx));
            const isTransfer = Boolean(tx.isInternalTransfer);
            const isIncome = tx.direction === 'INCOME';
            return (
              <button
                key={tx.id}
                type="button"
                onClick={() => onEditTransaction?.(tx)}
                className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-white truncate">
                    {tx.description}
                  </div>
                  <div className="text-[11px] text-[#64748B] dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`font-money text-xs sm:text-sm font-bold ${
                      isTransfer
                        ? 'text-blue-600 dark:text-white'
                        : isIncome
                        ? 'text-[#059669] dark:text-white'
                        : 'text-[#DC3545] dark:text-white'
                    }`}
                  >
                    {hideValues
                      ? formatarValor(amt, true)
                      : `${isTransfer ? '' : isIncome ? '+ ' : '− '}${formatarValor(amt, false)}`}
                  </span>
                  <ChevronRight size={14} strokeWidth={1.75} className="text-[#94A3B8] dark:text-slate-400" />
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
    { id: 'agenda', label: 'Agenda' },
  ];

  const filterButtons: Array<{ id: AgendaFilter; label: string; dotClass?: string }> = [
    { id: 'all', label: 'Todos' },
    { id: 'expense', label: 'Pagamentos', dotClass: 'bg-[#EF4444]' },
    { id: 'income', label: 'Receitas', dotClass: 'bg-[#10B981]' },
    { id: 'transfer', label: 'Transferências', dotClass: 'bg-[#3B82F6]' },
  ];

  return (
    <section className="sf-card overflow-hidden">
      {/* Top 5-Tab Bar (Equal 5-col grid prevents horizontal clipping & truncation on mobile) */}
      <div
        className="grid grid-cols-5 bg-white dark:bg-[#11185A] border-b border-[#E2E8F0] dark:border-white/10"
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
              className={`py-3 px-0.5 sm:px-3 text-[11.5px] sm:text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap text-center cursor-pointer ${
                isActive
                  ? 'text-[#DC2626] dark:text-white border-[#DC2626] dark:border-[#10B981] bg-red-50/40 dark:bg-white/10'
                  : 'text-[#64748B] dark:text-slate-300 border-transparent hover:text-[#0F172A] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div className="p-3 sm:p-4 bg-[#F8FAFC]/80 dark:bg-[#0B1252]/60">
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
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterButtons.map((fb) => {
                const isSelected = agendaFilter === fb.id;
                return (
                  <button
                    key={fb.id}
                    type="button"
                    onClick={() => setAgendaFilter(fb.id)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#061E3E] dark:bg-[#059669] text-white border-[#061E3E] dark:border-[#059669]'
                        : 'bg-white dark:bg-[#11185A] text-[#64748B] dark:text-slate-200 border-[#E2E8F0] dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {fb.dotClass && <span className={`w-2 h-2 rounded-full ${fb.dotClass}`} />}
                    <span>{fb.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Minimizable Calendar Drawer */}
            <details className="group sf-card overflow-hidden" open>
              <summary className="px-3.5 py-2.5 font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white flex items-center justify-between cursor-pointer select-none">
                <span className="flex items-center gap-2.5">
                  <span className="sf-icon-badge">
                    <CalendarDays size={18} strokeWidth={1.75} />
                  </span>
                  <span>Calendário de Movimentações</span>
                </span>
                <ChevronDown
                  size={16}
                  strokeWidth={1.75}
                  className="text-[#64748B] dark:text-slate-300 group-open:rotate-180 transition-transform"
                />
              </summary>

              <div className="px-3 pb-3 pt-1 border-t border-[#F1F5F9] dark:border-white/10 space-y-2.5">
                {/* Month Navigation */}
                <div className="flex justify-between items-center py-1">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white"
                    aria-label="Mês anterior"
                  >
                    <ChevronLeft size={16} strokeWidth={1.75} />
                  </button>
                  <strong className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white">
                    {MONTH_NAMES[month]} {year}
                  </strong>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white"
                    aria-label="Próximo mês"
                  >
                    <ChevronRight size={16} strokeWidth={1.75} />
                  </button>
                </div>

                {/* Legend */}
                <div className="flex justify-center gap-4 text-[11px] text-[#64748B] dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" /> Receita
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#EF4444] inline-block" /> Pagamento
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6] inline-block" /> Transferência
                  </span>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 text-center gap-1">
                  {WEEKDAY_LABELS.map((w, idx) => (
                    <div key={idx} className="text-[11px] font-bold text-[#64748B] dark:text-slate-400 pb-0.5">
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
                            ? 'border-[#061E3E] dark:border-[#10B981] bg-blue-50 dark:bg-[#059669]/25'
                            : 'border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-[#0B1252] hover:border-[#059669]'
                        }`}
                      >
                        <span className="text-[#0F172A] dark:text-white">{item.dayNumber}</span>
                        <div className="flex gap-1 h-1.5 items-center">
                          {hasIncome && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
                          {hasExpense && <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />}
                          {hasTransfer && <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>

            {/* Selected Day Movements (Grouped Fintech Container) */}
            <div className="sf-grouped-card p-3 text-xs space-y-2">
              {!selectedDateStr ? (
                <p className="text-[#64748B] dark:text-slate-300 text-center py-2">
                  Toque em um dia marcado no calendário para ver os lançamentos.
                </p>
              ) : selectedDayMovs.length === 0 ? (
                <p className="text-[#64748B] dark:text-slate-300 text-center py-2">
                  Nenhuma movimentação em {selectedDateStr.split('-').reverse().join('/')}.
                </p>
              ) : (
                <div className="sf-grouped-divider">
                  <div className="font-display font-bold text-[#0F172A] dark:text-white pb-2">
                    Movimentações de {selectedDateStr.split('-').reverse().join('/')}
                  </div>
                  {selectedDayMovs.map((m) => {
                    const badgeCls =
                      m.tipo === 'income'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                        : m.tipo === 'expense'
                        ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200';
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
                        className="w-full text-left py-2.5 flex justify-between items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 px-1 transition-colors cursor-pointer"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <strong className="block text-[#0F172A] dark:text-white truncate">
                            {m.tx.description}
                          </strong>
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${badgeCls}`}>
                            {labelName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <strong
                            className={`font-money ${
                              m.tipo === 'income'
                                ? 'text-[#059669] dark:text-white'
                                : m.tipo === 'expense'
                                ? 'text-[#DC3545] dark:text-white'
                                : 'text-blue-600 dark:text-white'
                            }`}
                          >
                            {hideValues
                              ? formatarValor(m.amount, true)
                              : `${m.tipo === 'income' ? '+ ' : m.tipo === 'expense' ? '− ' : ''}${formatarValor(m.amount, false)}`}
                          </strong>
                          <ChevronRight size={14} strokeWidth={1.75} className="text-[#94A3B8] dark:text-slate-400" />
                        </div>
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
