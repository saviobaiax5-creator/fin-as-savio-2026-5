import React, { useMemo, useState } from 'react';
import {
  MONTHS_PT_FULL,
  MONTHS_PT_SHORT,
  SALARY_CATEGORY_LABELS,
  SALARY_STATUS_LABELS,
  type SalaryRecord,
  type SalaryRecordStatus,
  type SalarySource,
} from '../../types/salary';
import type { Account } from '../../types';
import {
  calculateNetSalary,
  formatReferenceMonth,
  getMonthlyTotal,
  getSourceAnnualTotal,
  isRecordPaid,
} from '../../utils/salaryCalculations';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarNumeroBRL, formatarValor } from '../../utils/formatters';
import { todayLocal } from '../../utils/dateUtils';
import { Sheet } from '../Sheet';
import {
  CheckCircle2,
  Edit3,
  Link2,
  Plus,
  Upload,
} from 'lucide-react';

interface SalaryTableProps {
  sources: SalarySource[];
  records: SalaryRecord[];
  accounts: Account[];
  selectedYear: number;
  selectedMonth: number;
  onChangeYear: (year: number) => void;
  availableYears: number[];
  onSaveRecord: (input: {
    id?: string;
    sourceId: string;
    year: number;
    month: number;
    grossAmount?: number;
    deductions: number;
    amount: number | null;
    manualNetOverride: boolean;
    status: SalaryRecordStatus;
    expectedDate?: string;
    paymentDate?: string;
    description?: string;
    notes?: string;
  }) => void;
  onDeleteRecord: (id: string) => void;
  onLinkToTransaction: (recordId: string, accountId: string) => void;
  onBulkConfirmReceived: (year: number) => void;
  onOpenImport: () => void;
  onOpenNewSource: () => void;
}

export const SalaryTable: React.FC<SalaryTableProps> = ({
  sources,
  records,
  accounts,
  selectedYear,
  selectedMonth,
  onChangeYear,
  availableYears,
  onSaveRecord,
  onDeleteRecord,
  onLinkToTransaction,
  onBulkConfirmReceived,
  onOpenImport,
  onOpenNewSource,
}) => {
  const { hideValues } = usePrivacy();
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [showArchived, setShowArchived] = useState(false);

  // Sheet editor state for a cell (source + month)
  const [editingCell, setEditingCell] = useState<{
    source: SalarySource;
    month: number;
    existing: SalaryRecord | null;
  } | null>(null);

  const [formGross, setFormGross] = useState('');
  const [formDeductions, setFormDeductions] = useState('');
  const [formManualNet, setFormManualNet] = useState('');
  const [formManualOverride, setFormManualOverride] = useState(false);
  const [formStatus, setFormStatus] = useState<SalaryRecordStatus>('received');
  const [formExpectedDate, setFormExpectedDate] = useState('');
  const [formPaymentDate, setFormPaymentDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Account picker sheet for linking received salary to bank transaction
  const [linkingRecord, setLinkingRecord] = useState<SalaryRecord | null>(null);
  const [selectedLinkAccountId, setSelectedLinkAccountId] = useState('');

  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived),
    [accounts]
  );

  const visibleSources = useMemo(() => {
    return sources.filter((s) => {
      if (!showArchived && !s.active) return false;
      if (filterCategory !== 'ALL' && s.category !== filterCategory) return false;
      return true;
    });
  }, [sources, showArchived, filterCategory]);

  const recordMap = useMemo(() => {
    const map = new Map<string, SalaryRecord>();
    for (const r of records) {
      if (r.year === selectedYear) {
        map.set(`${r.sourceId}::${r.month}`, r);
      }
    }
    return map;
  }, [records, selectedYear]);

  const unconfirmedCount = useMemo(
    () =>
      records.filter(
        (r) => r.year === selectedYear && r.status === 'unknown' && r.amount !== null
      ).length,
    [records, selectedYear]
  );

  const openCellEditor = (source: SalarySource, month: number) => {
    const existing = recordMap.get(`${source.id}::${month}`) ?? null;
    setEditingCell({ source, month, existing });
    setFormGross(
      existing?.grossAmount !== undefined ? String(existing.grossAmount) : ''
    );
    setFormDeductions(
      existing?.deductions !== undefined ? String(existing.deductions) : '0'
    );
    setFormManualNet(
      existing?.amount !== null && existing?.amount !== undefined
        ? String(existing.amount)
        : ''
    );
    setFormManualOverride(Boolean(existing?.manualNetOverride) || existing?.grossAmount === undefined);
    setFormStatus(existing?.status ?? 'received');
    setFormExpectedDate(existing?.expectedDate ?? `${selectedYear}-${String(month).padStart(2, '0')}-05`);
    setFormPaymentDate(existing?.paymentDate ?? todayLocal());
    setFormNotes(existing?.notes ?? '');
    setFormError('');
  };

  const parseOptionalNumber = (raw: string): number | undefined => {
    const trimmed = raw.trim().replace(',', '.');
    if (!trimmed) return undefined;
    const val = Number(trimmed);
    return Number.isFinite(val) ? val : NaN;
  };

  const previewNet = useMemo(() => {
    const g = parseOptionalNumber(formGross);
    const d = parseOptionalNumber(formDeductions) ?? 0;
    const m = parseOptionalNumber(formManualNet);
    return calculateNetSalary({
      grossAmount: Number.isNaN(g) ? undefined : g,
      deductions: Number.isNaN(d) ? 0 : d,
      manualNetAmount: m === undefined || Number.isNaN(m) ? null : m,
      manualNetOverride: formManualOverride,
    });
  }, [formGross, formDeductions, formManualNet, formManualOverride]);

  const handleSaveCell = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCell) return;

    const grossParsed = parseOptionalNumber(formGross);
    const deductionsParsed = parseOptionalNumber(formDeductions) ?? 0;
    const manualParsed = parseOptionalNumber(formManualNet);

    if (Number.isNaN(grossParsed) || Number.isNaN(deductionsParsed) || Number.isNaN(manualParsed)) {
      setFormError('Informe apenas valores numéricos válidos.');
      return;
    }

    if (
      (grossParsed !== undefined && grossParsed < 0) ||
      deductionsParsed < 0
    ) {
      setFormError('Salário bruto e descontos não podem ser negativos.');
      return;
    }

    const { netAmount } = calculateNetSalary({
      grossAmount: grossParsed,
      deductions: deductionsParsed,
      manualNetAmount: manualParsed ?? null,
      manualNetOverride: formManualOverride,
    });

    if (netAmount === null && formStatus !== 'cancelled') {
      setFormError('Informe o valor líquido ou preencha o salário bruto para calcular.');
      return;
    }

    onSaveRecord({
      id: editingCell.existing?.id,
      sourceId: editingCell.source.id,
      year: selectedYear,
      month: editingCell.month,
      grossAmount: grossParsed,
      deductions: deductionsParsed,
      amount: netAmount,
      manualNetOverride: formManualOverride,
      status: formStatus,
      expectedDate: formExpectedDate || undefined,
      paymentDate: isRecordPaid(formStatus) ? formPaymentDate || todayLocal() : undefined,
      notes: formNotes.trim() || undefined,
    });

    setEditingCell(null);
  };

  const openLinkSheet = (record: SalaryRecord) => {
    setLinkingRecord(record);
    setSelectedLinkAccountId(activeAccounts[0]?.id || '');
  };

  const confirmLinkTransaction = () => {
    if (!linkingRecord || !selectedLinkAccountId) return;
    onLinkToTransaction(linkingRecord.id, selectedLinkAccountId);
    setLinkingRecord(null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="sf-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#F8FAFC] dark:bg-slate-800 p-1 rounded-xl border border-[#E2E8F0] dark:border-slate-700">
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onChangeYear(yr)}
                className={`min-h-9 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedYear === yr
                    ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white border border-[#E2E8F0] dark:border-slate-700'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          <select
            aria-label="Filtrar por categoria"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="min-h-10 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <option value="ALL">Todas as categorias</option>
            {Object.entries(SALARY_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 px-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            Exibir arquivadas
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unconfirmedCount > 0 && (
            <button
              type="button"
              onClick={() => onBulkConfirmReceived(selectedYear)}
              className="min-h-10 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <CheckCircle2 size={15} />
              Confirmar {unconfirmedCount} registro(s) como recebido(s)
            </button>
          )}
          <button
            type="button"
            onClick={onOpenImport}
            className="min-h-10 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload size={15} />
            Importar Excel
          </button>
          <button
            type="button"
            onClick={onOpenNewSource}
            className="min-h-10 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus size={15} />
            Nova fonte
          </button>
        </div>
      </div>

      {/* Desktop Matrix Table (hidden on small mobile) */}
      <div className="hidden md:block sf-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] dark:bg-slate-800/80 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B] dark:text-slate-300">
                <th className="text-left font-bold py-3 px-4 sticky left-0 bg-[#F8FAFC] dark:bg-slate-800/95 min-w-[190px] z-10 border-r border-[#E2E8F0] dark:border-slate-700">
                  Fonte de renda ({selectedYear})
                </th>
                {MONTHS_PT_SHORT.map((mLabel, idx) => (
                  <th
                    key={mLabel}
                    className={`text-right font-bold py-3 px-2.5 min-w-[96px] ${
                      idx + 1 === selectedMonth ? 'text-[#059669] dark:text-[#10B981]' : ''
                    }`}
                  >
                    {mLabel}
                  </th>
                ))}
                <th className="text-right font-extrabold py-3 px-4 min-w-[116px] bg-slate-100/70 dark:bg-slate-800 border-l border-[#E2E8F0] dark:border-slate-700">
                  Total recebido
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleSources.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-10 text-center text-[#64748B]">
                    Nenhuma fonte de renda encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                visibleSources.map((source) => {
                  const rowTotal = getSourceAnnualTotal(records, source.id, selectedYear);
                  return (
                    <tr
                      key={source.id}
                      className="hover:bg-[#F8FAFC] dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-4 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800">
                        <div className="font-bold text-[#0F172A] dark:text-white truncate max-w-[180px]">
                          {source.name}
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                          {SALARY_CATEGORY_LABELS[source.category]}
                          {!source.active ? ' · Arquivada' : ''}
                        </div>
                      </td>

                      {MONTHS_PT_SHORT.map((mLabel, mIdx) => {
                        const monthNum = mIdx + 1;
                        const rec = recordMap.get(`${source.id}::${monthNum}`);
                        const hasAmount = rec && rec.amount !== null;

                        return (
                          <td key={`${source.id}-${mLabel}`} className="p-1 text-right align-top">
                            <button
                              type="button"
                              onClick={() => openCellEditor(source, monthNum)}
                              className={`w-full min-h-[44px] px-2 py-1.5 rounded-lg text-right transition-colors cursor-pointer flex flex-col items-end justify-center ${
                                !hasAmount
                                  ? 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  : rec.status === 'received' || rec.status === 'partially_received'
                                  ? 'text-[#0F172A] dark:text-slate-100 hover:bg-[#ECFDF5] dark:hover:bg-emerald-950/40'
                                  : rec.status === 'expected'
                                  ? 'text-blue-700 dark:text-blue-300 bg-blue-50/40 dark:bg-blue-950/20 hover:bg-blue-50'
                                  : rec.status === 'cancelled'
                                  ? 'text-slate-400 line-through hover:bg-slate-100 dark:hover:bg-slate-800'
                                  : 'text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50'
                              }`}
                              title={
                                hasAmount
                                  ? `${source.name} · ${MONTHS_PT_FULL[mIdx]}/${selectedYear} · ${SALARY_STATUS_LABELS[rec.status]}`
                                  : `Registrar ${source.name} em ${MONTHS_PT_FULL[mIdx]}/${selectedYear}`
                              }
                            >
                              {hasAmount ? (
                                <>
                                  <span className="font-money font-semibold whitespace-nowrap">
                                    {formatarNumeroBRL(rec.amount ?? 0, hideValues)}
                                  </span>
                                  <span className="text-[10px] opacity-80 flex items-center gap-1 whitespace-nowrap">
                                    {rec.linkedTransactionId && <Link2 size={9} className="text-[#059669]" />}
                                    {rec.status === 'received'
                                      ? 'Recebido'
                                      : SALARY_STATUS_LABELS[rec.status]}
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs font-normal">—</span>
                              )}
                            </button>
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-4 text-right font-money font-extrabold text-[#0F172A] dark:text-white bg-[#F8FAFC] dark:bg-slate-800/50 border-l border-slate-100 dark:border-slate-800 whitespace-nowrap">
                        {formatarValor(rowTotal, hideValues)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {visibleSources.length > 0 && (
              <tfoot>
                <tr className="bg-[#F8FAFC] dark:bg-slate-800/90 border-t-2 border-[#E2E8F0] dark:border-slate-700 font-extrabold text-[#0F172A] dark:text-white">
                  <td className="py-3 px-4 sticky left-0 bg-[#F8FAFC] dark:bg-slate-800 z-10 border-r border-[#E2E8F0] dark:border-slate-700">
                    Total recebido líquido (sem empréstimos)
                  </td>
                  {MONTHS_PT_SHORT.map((mLabel, mIdx) => {
                    const mTotal = getMonthlyTotal(records, selectedYear, mIdx + 1, sources);
                    return (
                      <td
                        key={`total-${mLabel}`}
                        className="py-3 px-2.5 text-right font-money whitespace-nowrap"
                      >
                        {mTotal > 0 ? formatarNumeroBRL(mTotal, hideValues) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-3 px-4 text-right font-money text-[#059669] dark:text-[#10B981] border-l border-[#E2E8F0] dark:border-slate-700 whitespace-nowrap">
                    {formatarValor(
                      MONTHS_PT_SHORT.reduce(
                        (sum, _l, idx) =>
                          sum + getMonthlyTotal(records, selectedYear, idx + 1, sources),
                        0
                      ),
                      hideValues
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Mobile Card List (no horizontal overflow) */}
      <div className="md:hidden space-y-3">
        <div className="sf-card p-4 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold text-[#64748B]">Mês visualizado:</div>
          <span className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
            {MONTHS_PT_FULL[selectedMonth - 1]} / {selectedYear}
          </span>
        </div>

        {visibleSources.map((source) => {
          const rec = recordMap.get(`${source.id}::${selectedMonth}`);
          const annual = getSourceAnnualTotal(records, source.id, selectedYear);

          return (
            <div
              key={source.id}
              className="sf-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display font-bold text-sm text-[#0F172A] dark:text-white">{source.name}</h4>
                  <p className="font-money text-xs text-[#64748B] dark:text-slate-400">
                    {SALARY_CATEGORY_LABELS[source.category]} · Anual: {formatarValor(annual, hideValues)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openCellEditor(source, selectedMonth)}
                  className="min-h-10 px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold text-[#0F172A] dark:text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Edit3 size={13} /> {rec ? 'Editar' : 'Registrar'}
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-[#64748B]">
                  {rec ? SALARY_STATUS_LABELS[rec.status] : 'Sem pagamento informado'}
                </span>
                <span className="font-money text-base font-extrabold text-[#0F172A] dark:text-white">
                  {rec && rec.amount !== null ? formatarValor(rec.amount, hideValues) : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sheet Modal for Cell Edit */}
      <Sheet
        open={Boolean(editingCell)}
        onClose={() => setEditingCell(null)}
        title={
          editingCell
            ? `${editingCell.source.name} · ${MONTHS_PT_FULL[editingCell.month - 1]}/${selectedYear}`
            : ''
        }
        subtitle="Informe salário bruto, descontos ou defina manualmente o valor líquido recebido."
      >
        {editingCell && (
          <form onSubmit={handleSaveCell} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Salário bruto (R$) — opcional
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formGross}
                  onChange={(e) => setFormGross(e.target.value)}
                  placeholder="Ex.: 4500.00"
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Descontos (INSS/IR/outros)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formDeductions}
                  onChange={(e) => setFormDeductions(e.target.value)}
                  placeholder="0.00"
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formManualOverride}
                  onChange={(e) => setFormManualOverride(e.target.checked)}
                />
                Informar salário líquido manualmente (sem cálculo automático bruto − descontos)
              </label>

              {formManualOverride ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Salário líquido informado manualmente (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formManualNet}
                    onChange={(e) => setFormManualNet(e.target.value)}
                    placeholder="Ex.: 3924.87"
                    className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold tabular-nums"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Salário líquido calculado:</span>
                  <strong className="text-base text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {previewNet.netAmount !== null
                      ? formatarValor(previewNet.netAmount, hideValues)
                      : 'Informe o bruto acima'}
                  </strong>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Situação do pagamento
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as SalaryRecordStatus)}
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  <option value="received">Recebido</option>
                  <option value="expected">Previsto</option>
                  <option value="partially_received">Recebido parcial</option>
                  <option value="unknown">A confirmar</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Data prevista
                </label>
                <input
                  type="date"
                  value={formExpectedDate}
                  onChange={(e) => setFormExpectedDate(e.target.value)}
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Data efetiva
                </label>
                <input
                  type="date"
                  value={formPaymentDate}
                  onChange={(e) => setFormPaymentDate(e.target.value)}
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Observações ({formatReferenceMonth(selectedYear, editingCell.month)})
              </label>
              <textarea
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Detalhes sobre adicionais, descontos ou férias..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            {editingCell.existing &&
              isRecordPaid(editingCell.existing.status) &&
              (editingCell.existing.amount ?? 0) > 0 && (
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    {editingCell.existing.linkedTransactionId ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                        <Link2 size={14} /> Vinculado ao extrato bancário (sem duplicidade)
                      </span>
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300">
                        Deseja lançar este recebimento no extrato bancário?
                      </span>
                    )}
                  </div>
                  {!editingCell.existing.linkedTransactionId && (
                    <button
                      type="button"
                      onClick={() => {
                        const rec = editingCell.existing!;
                        setEditingCell(null);
                        openLinkSheet(rec);
                      }}
                      className="min-h-9 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Criar entrada na conta
                    </button>
                  )}
                </div>
              )}

            {formError && (
              <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{formError}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {editingCell.existing ? (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteRecord(editingCell.existing!.id);
                    setEditingCell(null);
                  }}
                  className="min-h-10 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 text-xs font-semibold cursor-pointer"
                >
                  Remover valor do mês
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Salvar registro
                </button>
              </div>
            </div>
          </form>
        )}
      </Sheet>

      {/* Link Salary to Bank Transaction Sheet */}
      <Sheet
        open={Boolean(linkingRecord)}
        onClose={() => setLinkingRecord(null)}
        title="Vincular salário à conta bancária"
        subtitle="Cria uma única transação de receita vinculada a este mês salarial sem duplicidade."
      >
        {linkingRecord && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
              <div className="text-slate-500">Valor a lançar como receita confirmada</div>
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatarValor(linkingRecord.amount ?? 0, hideValues)}
              </div>
            </div>

            {activeAccounts.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Nenhuma conta ativa encontrada. Cadastre uma conta em Contas Bancárias primeiro.
              </p>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Conta de destino do salário
                </label>
                <select
                  value={selectedLinkAccountId}
                  onChange={(e) => setSelectedLinkAccountId(e.target.value)}
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {activeAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.institutionName} · {acc.accountName} ({acc.entityId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLinkingRecord(null)}
                className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedLinkAccountId}
                onClick={confirmLinkTransaction}
                className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                Lançar e vincular
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
