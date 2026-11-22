import React, { useMemo, useState } from 'react';
import {
  MONTHS_PT_FULL,
  MONTHS_PT_SHORT,
  SALARY_CATEGORY_GROUPS,
  SALARY_CATEGORY_LABELS,
  SALARY_STATUS_LABELS,
  type PaymentFrequency,
  type SalaryAdjustment,
  type SalaryCategory,
  type SalaryDataset,
  type SalaryImportResult,
  type SalaryRecord,
  type SalaryRecordStatus,
  type SalarySource,
} from '../../types/salary';
import type { Account } from '../../types';
import {
  calculateSalaryAdjustment,
  compareYearsSamePeriod,
  formatReferenceMonth,
  getAnnualTotal,
  getSourceAnnualTotal,
  normalizeSourceNameKey,
} from '../../utils/salaryCalculations';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { todayLocal } from '../../utils/dateUtils';
import { sanitizeCellForSheet } from '../../utils/sheetGuard';
import { generateEntityId } from '../../domain/common/id';
import { SalaryDashboard } from './SalaryDashboard';
import { SalaryTable } from './SalaryTable';
import { SalaryCharts } from './SalaryCharts';
import SalaryImport from './SalaryImport';
import { Sheet } from '../Sheet';
import {
  Archive,
  ArchiveRestore,
  Award,
  BarChart3,
  Briefcase,
  CalendarPlus,
  Download,
  Edit3,
  FileSpreadsheet,
  LayoutDashboard,
  Plus,
  Table2,
  TrendingUp,
} from 'lucide-react';

type SalaryAreaTab =
  | 'overview'
  | 'sources'
  | 'monthly'
  | 'evolution'
  | 'adjustments'
  | 'extras'
  | 'reports';

interface SalaryViewProps {
  dataset: SalaryDataset;
  accounts: Account[];
  theme?: 'light' | 'dark';
  onUpdateDataset: (updater: (prev: SalaryDataset) => SalaryDataset) => void;
  onBackupBeforeImport: () => void;
  onLinkSalaryToTransaction: (recordId: string, accountId: string) => void;
  onNotifyUndo?: (label: string, restore: () => void) => void;
}

function makeId(prefix: string): string {
  return generateEntityId(prefix);
}

export const SalaryView: React.FC<SalaryViewProps> = ({
  dataset,
  accounts,
  theme = 'light',
  onUpdateDataset,
  onBackupBeforeImport,
  onLinkSalaryToTransaction,
  onNotifyUndo,
}) => {
  const now = new Date();
  const currentYearDefault = now.getFullYear();
  const currentMonthDefault = now.getMonth() + 1;

  const [areaTab, setAreaTab] = useState<SalaryAreaTab>('overview');
  const [selectedYear, setSelectedYear] = useState<number>(currentYearDefault);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonthDefault);
  const [customYears, setCustomYears] = useState<number[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Source CRUD sheet
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<SalarySource | null>(null);
  const [srcName, setSrcName] = useState('');
  const [srcInstitution, setSrcInstitution] = useState('');
  const [srcCategory, setSrcCategory] = useState<SalaryCategory>('salary');
  const [srcFrequency, setSrcFrequency] = useState<PaymentFrequency>('monthly');
  const [srcStartDate, setSrcStartDate] = useState(todayLocal());
  const [srcError, setSrcError] = useState('');

  // Quick Record Sheet (used from Overview / Extras)
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);
  const [qrSourceId, setQrSourceId] = useState('');
  const [qrYear, setQrYear] = useState(currentYearDefault);
  const [qrMonth, setQrMonth] = useState(currentMonthDefault);
  const [qrAmount, setQrAmount] = useState('');
  const [qrStatus, setQrStatus] = useState<SalaryRecordStatus>('received');
  const [qrNotes, setQrNotes] = useState('');
  const [qrError, setQrError] = useState('');

  // Adjustment Form
  const [adjSourceId, setAdjSourceId] = useState('');
  const [adjOldAmount, setAdjOldAmount] = useState('');
  const [adjNewAmount, setAdjNewAmount] = useState('');
  const [adjDate, setAdjDate] = useState(todayLocal());
  const [adjDesc, setAdjDesc] = useState('');
  const [adjError, setAdjError] = useState('');

  // Add Year Sheet
  const [yearSheetOpen, setYearSheetOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState(String(currentYearDefault + 1));

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYearDefault, ...customYears]);
    for (const r of dataset.records) years.add(r.year);
    return Array.from(years).sort((a, b) => a - b);
  }, [dataset.records, currentYearDefault, customYears]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 5000);
  };

  // Source handlers
  const openNewSourceSheet = (presetCategory: SalaryCategory = 'salary') => {
    setEditingSource(null);
    setSrcName('');
    setSrcInstitution('');
    setSrcCategory(presetCategory);
    setSrcFrequency(
      presetCategory === 'thirteenth' ||
        presetCategory === 'vacation' ||
        presetCategory === 'occasional'
        ? 'occasional'
        : 'monthly'
    );
    setSrcStartDate(todayLocal());
    setSrcError('');
    setSourceSheetOpen(true);
  };

  const openEditSourceSheet = (src: SalarySource) => {
    setEditingSource(src);
    setSrcName(src.name);
    setSrcInstitution(src.institution ?? src.name);
    setSrcCategory(src.category);
    setSrcFrequency(src.paymentFrequency ?? 'monthly');
    setSrcStartDate(src.startDate ?? todayLocal());
    setSrcError('');
    setSourceSheetOpen(true);
  };

  const handleSaveSource = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = srcName.trim();
    if (!cleanName) {
      setSrcError('Informe o nome da fonte de renda.');
      return;
    }

    const nowIso = new Date().toISOString();
    if (editingSource) {
      onUpdateDataset((prev) => ({
        ...prev,
        sources: prev.sources.map((s) =>
          s.id === editingSource.id
            ? {
                ...s,
                name: cleanName,
                institution: srcInstitution.trim() || cleanName,
                category: srcCategory,
                paymentFrequency: srcFrequency,
                startDate: srcStartDate,
                updatedAt: nowIso,
              }
            : s
        ),
      }));
      showToast(`Fonte "${cleanName}" atualizada.`);
    } else {
      const duplicate = dataset.sources.some(
        (s) => normalizeSourceNameKey(s.name) === normalizeSourceNameKey(cleanName)
      );
      if (duplicate) {
        setSrcError('Já existe uma fonte cadastrada com esse nome.');
        return;
      }
      const created: SalarySource = {
        id: makeId('src'),
        name: cleanName,
        institution: srcInstitution.trim() || cleanName,
        category: srcCategory,
        paymentFrequency: srcFrequency,
        active: true,
        startDate: srcStartDate,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      onUpdateDataset((prev) => ({
        ...prev,
        sources: [...prev.sources, created],
      }));
      showToast(`Fonte "${cleanName}" adicionada.`);
    }
    setSourceSheetOpen(false);
  };

  const handleToggleArchiveSource = (sourceId: string) => {
    onUpdateDataset((prev) => ({
      ...prev,
      sources: prev.sources.map((s) =>
        s.id === sourceId
          ? {
              ...s,
              active: !s.active,
              endDate: s.active ? todayLocal() : undefined,
              updatedAt: new Date().toISOString(),
            }
          : s
      ),
    }));
  };

  // Record handlers
  const handleSaveRecord = (input: {
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
  }) => {
    const nowIso = new Date().toISOString();
    onUpdateDataset((prev) => {
      const existingMatch = input.id
        ? prev.records.find((r) => r.id === input.id)
        : prev.records.find(
            (r) =>
              r.sourceId === input.sourceId &&
              r.year === input.year &&
              r.month === input.month
          );

      if (existingMatch) {
        return {
          ...prev,
          records: prev.records.map((r) =>
            r.id === existingMatch.id
              ? {
                  ...r,
                  grossAmount: input.grossAmount,
                  deductions: input.deductions,
                  amount: input.amount,
                  manualNetOverride: input.manualNetOverride,
                  status: input.status,
                  expectedDate: input.expectedDate,
                  paymentDate: input.paymentDate,
                  description: input.description,
                  notes: input.notes,
                  updatedAt: nowIso,
                }
              : r
          ),
        };
      }

      const created: SalaryRecord = {
        id: makeId('salrec'),
        sourceId: input.sourceId,
        year: input.year,
        month: input.month,
        referenceMonth: formatReferenceMonth(input.year, input.month),
        grossAmount: input.grossAmount,
        deductions: input.deductions,
        amount: input.amount,
        manualNetOverride: input.manualNetOverride,
        status: input.status,
        expectedDate: input.expectedDate,
        paymentDate: input.paymentDate,
        description: input.description,
        notes: input.notes,
        origin: 'manual',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      return {
        ...prev,
        records: [...prev.records, created],
      };
    });
    showToast('Registro salarial salvo.');
  };

  const handleDeleteRecord = (recordId: string) => {
    const removed = dataset.records.find((r) => r.id === recordId);
    onUpdateDataset((prev) => ({
      ...prev,
      records: prev.records.filter((r) => r.id !== recordId),
    }));
    if (removed && onNotifyUndo) {
      onNotifyUndo('Registro mensal removido.', () => {
        onUpdateDataset((prev) => ({
          ...prev,
          records: prev.records.some((r) => r.id === removed.id)
            ? prev.records
            : [...prev.records, removed],
        }));
      });
    }
  };

  const handleBulkConfirmReceived = (year: number) => {
    const nowIso = new Date().toISOString();
    const prevSnapshot = dataset.records;
    onUpdateDataset((prev) => ({
      ...prev,
      records: prev.records.map((r) =>
        r.year === year && r.status === 'unknown'
          ? { ...r, status: 'received', updatedAt: nowIso }
          : r
      ),
    }));
    if (onNotifyUndo) {
      onNotifyUndo(`Registros de ${year} marcados como recebidos.`, () => {
        onUpdateDataset((prev) => ({ ...prev, records: prevSnapshot }));
      });
    }
  };

  // Excel import merge (non-destructive, respects duplicate protection & preserves existing data)
  const handleExcelImportCommit = async (
    imported: SalaryImportResult,
    options: { skipDuplicates: boolean }
  ) => {
    onBackupBeforeImport();
    const nowIso = new Date().toISOString();

    let addedRecordsCount = 0;
    let addedSourcesCount = 0;

    onUpdateDataset((prev) => {
      const mergedSources = [...prev.sources];
      const nameToId = new Map(
        mergedSources.map((s) => [normalizeSourceNameKey(s.name), s.id])
      );
      const importedSourceIdMap = new Map<string, string>();

      for (const src of imported.sources) {
        const norm = normalizeSourceNameKey(src.name);
        const existingId = nameToId.get(norm);
        if (existingId) {
          importedSourceIdMap.set(src.id, existingId);
        } else {
          mergedSources.push(src);
          nameToId.set(norm, src.id);
          importedSourceIdMap.set(src.id, src.id);
          addedSourcesCount += 1;
        }
      }

      const mergedRecords = [...prev.records];
      const existingKeys = new Map<string, number>();
      mergedRecords.forEach((r, idx) => {
        existingKeys.set(`${r.sourceId}::${r.year}::${r.month}`, idx);
      });

      for (const rec of imported.records) {
        const mappedSourceId = importedSourceIdMap.get(rec.sourceId) || rec.sourceId;
        const compositeKey = `${mappedSourceId}::${rec.year}::${rec.month}`;
        const existingIndex = existingKeys.get(compositeKey);

        if (existingIndex !== undefined) {
          if (!options.skipDuplicates) {
            mergedRecords[existingIndex] = {
              ...mergedRecords[existingIndex],
              amount: rec.amount,
              status: rec.status,
              updatedAt: nowIso,
            };
          }
          continue;
        }

        mergedRecords.push({
          ...rec,
          sourceId: mappedSourceId,
        });
        existingKeys.set(compositeKey, mergedRecords.length - 1);
        addedRecordsCount += 1;
      }

      return {
        ...prev,
        sources: mergedSources,
        records: mergedRecords,
      };
    });

    setSelectedYear(imported.year);
    setShowImportPanel(false);
    setAreaTab('monthly');
    showToast(
      `Importação concluída (${imported.year}): ${addedSourcesCount} nova(s) fonte(s) e ${addedRecordsCount} registro(s) mensal(is) importado(s).`
    );
  };

  // Quick record creation
  const openQuickRecordModal = (presetCategory?: SalaryCategory) => {
    const candidateSources = presetCategory
      ? dataset.sources.filter((s) => s.active && s.category === presetCategory)
      : dataset.sources.filter((s) => s.active);
    setQrSourceId(candidateSources[0]?.id || dataset.sources[0]?.id || '');
    setQrYear(selectedYear);
    setQrMonth(selectedMonth);
    setQrAmount('');
    setQrStatus('received');
    setQrNotes('');
    setQrError('');
    setQuickRecordOpen(true);
  };

  const submitQuickRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrSourceId) {
      setQrError('Selecione ou cadastre uma fonte de renda primeiro.');
      return;
    }
    const val = Number(qrAmount.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      setQrError('Informe um valor líquido válido.');
      return;
    }

    handleSaveRecord({
      sourceId: qrSourceId,
      year: qrYear,
      month: qrMonth,
      deductions: 0,
      amount: val,
      manualNetOverride: true,
      status: qrStatus,
      paymentDate: qrStatus === 'received' ? todayLocal() : undefined,
      notes: qrNotes.trim() || undefined,
    });
    setQuickRecordOpen(false);
  };

  // Adjustment registration (never alters past monthly records)
  const previewAdjPct = useMemo(() => {
    const o = Number(adjOldAmount.replace(',', '.'));
    const n = Number(adjNewAmount.replace(',', '.'));
    if (!Number.isFinite(o) || !Number.isFinite(n)) return null;
    return calculateSalaryAdjustment(o, n);
  }, [adjOldAmount, adjNewAmount]);

  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjSourceId) {
      setAdjError('Selecione a instituição do reajuste.');
      return;
    }
    const oldVal = Number(adjOldAmount.replace(',', '.'));
    const newVal = Number(adjNewAmount.replace(',', '.'));
    if (!Number.isFinite(oldVal) || oldVal <= 0 || !Number.isFinite(newVal) || newVal < 0) {
      setAdjError('Informe valores válidos (valor anterior maior que zero).');
      return;
    }

    const pct = calculateSalaryAdjustment(oldVal, newVal);
    const created: SalaryAdjustment = {
      id: makeId('adj'),
      sourceId: adjSourceId,
      previousAmount: oldVal,
      newAmount: newVal,
      percentage: pct,
      effectiveDate: adjDate,
      description: adjDesc.trim() || 'Reajuste salarial',
      createdAt: new Date().toISOString(),
    };

    onUpdateDataset((prev) => ({
      ...prev,
      adjustments: [created, ...prev.adjustments],
    }));

    setAdjOldAmount('');
    setAdjNewAmount('');
    setAdjDesc('');
    setAdjError('');
    showToast('Reajuste registrado no histórico sem alterar meses passados.');
  };

  // Extra income / 13º / Vacation filtered view
  const extraordinarySources = useMemo(
    () =>
      dataset.sources.filter(
        (s) => SALARY_CATEGORY_GROUPS[s.category] === 'extraordinary'
      ),
    [dataset.sources]
  );

  const extraordinaryRecords = useMemo(() => {
    const extraIds = new Set(extraordinarySources.map((s) => s.id));
    return dataset.records
      .filter((r) => extraIds.has(r.sourceId) && r.year === selectedYear && r.amount !== null)
      .sort((a, b) => a.month - b.month);
  }, [dataset.records, extraordinarySources, selectedYear]);

  // CSV export for Salários e Rendas
  const handleExportSalaryCsv = () => {
    const sourceMap = new Map(dataset.sources.map((s) => [s.id, s]));
    const header = [
      'Ano',
      'Mês',
      'Fonte de Renda',
      'Categoria',
      'Situação',
      'Valor Bruto',
      'Descontos',
      'Valor Líquido',
      'Conciliado Extrato',
      'Observações',
    ];

    const rows = dataset.records
      .filter((r) => r.year === selectedYear && r.amount !== null)
      .sort((a, b) => a.month - b.month)
      .map((r) => {
        const src = sourceMap.get(r.sourceId);
        return [
          String(r.year),
          MONTHS_PT_FULL[r.month - 1] || String(r.month),
          sanitizeCellForSheet(src?.name || 'Fonte removida'),
          sanitizeCellForSheet(src ? SALARY_CATEGORY_LABELS[src.category] : 'Outro'),
          sanitizeCellForSheet(SALARY_STATUS_LABELS[r.status]),
          r.grossAmount !== undefined ? r.grossAmount.toFixed(2).replace('.', ',') : '',
          (r.deductions ?? 0).toFixed(2).replace('.', ','),
          (r.amount ?? 0).toFixed(2).replace('.', ','),
          r.linkedTransactionId ? 'Sim' : 'Não',
          sanitizeCellForSheet(r.notes || ''),
        ];
      });

    const csv =
      '\uFEFF' +
      [header, ...rows]
        .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Savio_Financas_Salarios_${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const areaTabs: Array<{ id: SalaryAreaTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'sources', label: 'Cadastro de salários', icon: Briefcase },
    { id: 'monthly', label: 'Histórico mensal', icon: Table2 },
    { id: 'evolution', label: 'Evolução anual', icon: TrendingUp },
    { id: 'adjustments', label: 'Reajustes salariais', icon: Award },
    { id: 'extras', label: 'Outras fontes de renda', icon: Plus },
    { id: 'reports', label: 'Relatórios e comparativos', icon: BarChart3 },
  ];

  const sourceMap = useMemo(
    () => new Map(dataset.sources.map((s) => [s.id, s])),
    [dataset.sources]
  );

  const yearlyComparison = useMemo(() => {
    const prevYr = availableYears.includes(selectedYear - 1) ? selectedYear - 1 : selectedYear;
    return compareYearsSamePeriod(dataset.records, dataset.sources, prevYr, selectedYear);
  }, [dataset.records, dataset.sources, availableYears, selectedYear]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
            Salários e Evolução da Renda
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Histórico estruturado por instituição, evolução anual, reajustes, 13º, férias e integração controlada com o extrato.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Ano de referência"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="min-h-10 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-[#082B5C] dark:text-white cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                Ano {yr}
              </option>
            ))}
          </select>

          <select
            aria-label="Mês de referência"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="min-h-10 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            {MONTHS_PT_FULL.map((mName, idx) => (
              <option key={mName} value={idx + 1}>
                {mName}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setYearSheetOpen(true)}
            className="min-h-10 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <CalendarPlus size={15} />
            Novo ano
          </button>

          <button
            type="button"
            onClick={() => setShowImportPanel((o) => !o)}
            className="min-h-10 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet size={15} />
            {showImportPanel ? 'Fechar importador' : 'Importar Excel'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          {feedback}
        </div>
      )}

      {showImportPanel && (
        <SalaryImport
          existingSources={dataset.sources}
          existingRecords={dataset.records}
          onImport={handleExcelImportCommit}
          onCancel={() => setShowImportPanel(false)}
        />
      )}

      {/* 7 Sub-Areas Segmented Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {areaTabs.map((tab) => {
          const Icon = tab.icon;
          const active = areaTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAreaTab(tab.id)}
              className={`min-h-10 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#082B5C] dark:bg-emerald-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* AREA 1: VISÃO GERAL */}
      {areaTab === 'overview' && (
        <SalaryDashboard
          sources={dataset.sources}
          records={dataset.records}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          availableYears={availableYears}
          onOpenImport={() => setShowImportPanel(true)}
          onOpenNewRecord={() => openQuickRecordModal()}
          onGoToArea={(target) => setAreaTab(target)}
        />
      )}

      {/* AREA 2: CADASTRO DE SALÁRIOS */}
      {areaTab === 'sources' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
                Fontes de renda e instituições ({dataset.sources.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exemplos comuns: Câmara Municipal, UNIP, UNIGRANDE, CEI, SENAR, serviços extras. Arquivar preserva o histórico completo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNewSourceSheet('salary')}
              className="min-h-10 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus size={15} /> Cadastrar nova fonte
            </button>
          </div>

          {dataset.sources.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
              Nenhuma fonte de renda cadastrada. Clique em &ldquo;Cadastrar nova fonte&rdquo; ou importe sua planilha Excel.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dataset.sources.map((src) => {
                const yearTotal = getSourceAnnualTotal(dataset.records, src.id, selectedYear);
                return (
                  <div
                    key={src.id}
                    className={`rounded-2xl border p-5 space-y-3 bg-white dark:bg-slate-900 ${
                      src.active
                        ? 'border-slate-200 dark:border-slate-800'
                        : 'border-slate-200/70 dark:border-slate-800/60 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-[#082B5C] dark:text-white truncate">
                          {src.name}
                        </h4>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {SALARY_CATEGORY_LABELS[src.category]} ·{' '}
                          {src.active ? 'Ativa' : 'Arquivada'}
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-[#082B5C] dark:text-white tabular-nums shrink-0">
                        R$ {formatCurrencyBRL(yearTotal)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Total recebido em {selectedYear} · Início: {src.startDate || src.createdAt.slice(0, 10)}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => openEditSourceSheet(src)}
                        className="flex-1 min-h-9 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit3 size={13} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveSource(src.id)}
                        className="flex-1 min-h-9 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {src.active ? (
                          <>
                            <Archive size={13} /> Arquivar
                          </>
                        ) : (
                          <>
                            <ArchiveRestore size={13} /> Reativar
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AREA 3: HISTÓRICO MENSAL (TABELA EDITÁVEL) */}
      {areaTab === 'monthly' && (
        <SalaryTable
          sources={dataset.sources}
          records={dataset.records}
          accounts={accounts}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onChangeYear={setSelectedYear}
          availableYears={availableYears}
          onSaveRecord={handleSaveRecord}
          onDeleteRecord={handleDeleteRecord}
          onLinkToTransaction={onLinkSalaryToTransaction}
          onBulkConfirmReceived={handleBulkConfirmReceived}
          onOpenImport={() => setShowImportPanel(true)}
          onOpenNewSource={() => openNewSourceSheet('salary')}
        />
      )}

      {/* AREA 4: EVOLUÇÃO ANUAL (GRÁFICOS RECHARTS) */}
      {areaTab === 'evolution' && (
        <SalaryCharts
          sources={dataset.sources}
          records={dataset.records}
          selectedYear={selectedYear}
          availableYears={availableYears}
          theme={theme}
        />
      )}

      {/* AREA 5: REAJUSTES SALARIAIS */}
      {areaTab === 'adjustments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form
            onSubmit={handleAddAdjustment}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 lg:col-span-1"
          >
            <div>
              <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
                Registrar reajuste salarial
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mantém histórico dos aumentos sem alterar registros salariais de meses anteriores.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Instituição / Fonte
              </label>
              <select
                value={adjSourceId}
                onChange={(e) => setAdjSourceId(e.target.value)}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="">Selecione...</option>
                {dataset.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Valor anterior (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={adjOldAmount}
                  onChange={(e) => setAdjOldAmount(e.target.value)}
                  placeholder="3924.87"
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Novo valor (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={adjNewAmount}
                  onChange={(e) => setAdjNewAmount(e.target.value)}
                  placeholder="4029.02"
                  className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Percentual de reajuste calculado:</span>
              <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                {previewAdjPct === null ? '—' : `${previewAdjPct >= 0 ? '+' : ''}${previewAdjPct.toFixed(2)}%`}
              </strong>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Data de vigência
              </label>
              <input
                type="date"
                value={adjDate}
                onChange={(e) => setAdjDate(e.target.value)}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Descrição / Motivo
              </label>
              <input
                type="text"
                value={adjDesc}
                onChange={(e) => setAdjDesc(e.target.value)}
                placeholder="Ex.: Dissídio anual / progressão funcional"
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            {adjError && <p className="text-xs text-red-600 font-semibold">{adjError}</p>}

            <button
              type="submit"
              className="w-full min-h-11 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Salvar reajuste no histórico
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 lg:col-span-2">
            <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
              Histórico de reajustes ({dataset.adjustments.length})
            </h3>
            {dataset.adjustments.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Nenhum reajuste registrado ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {dataset.adjustments.map((adj) => {
                  const src = sourceMap.get(adj.sourceId);
                  return (
                    <div
                      key={adj.id}
                      className="py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-[#082B5C] dark:text-white">
                          {src?.name || 'Fonte'} · {adj.description}
                        </div>
                        <div className="text-slate-400 mt-0.5">
                          Vigência: {adj.effectiveDate}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className="font-bold text-[#082B5C] dark:text-white">
                          R$ {formatCurrencyBRL(adj.previousAmount)} → R$ {formatCurrencyBRL(adj.newAmount)}
                        </div>
                        <div className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {adj.percentage !== null
                            ? `${adj.percentage >= 0 ? '+' : ''}${adj.percentage.toFixed(2)}%`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AREA 6: OUTRAS FONTES (13º, FÉRIAS E RENDAS EXTRAS) */}
      {areaTab === 'extras' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
                Décimo terceiro, férias e rendas extraordinárias ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Controlados em categoria própria para não distorcer a média do salário mensal recorrente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openNewSourceSheet('thirteenth')}
                className="min-h-10 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                + Fonte 13º / Férias
              </button>
              <button
                type="button"
                onClick={() => openQuickRecordModal('occasional')}
                className="min-h-10 px-4 py-2 rounded-xl bg-[#082B5C] dark:bg-emerald-600 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                Lançar renda extra
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            {extraordinaryRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum lançamento de 13º salário, férias, bonificação ou serviço extra em {selectedYear}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {extraordinaryRecords.map((rec) => {
                  const src = sourceMap.get(rec.sourceId);
                  return (
                    <div
                      key={rec.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-[#082B5C] dark:text-white">
                          {src?.name || 'Fonte extraordinária'}
                        </div>
                        <div className="text-slate-400">
                          {MONTHS_PT_FULL[rec.month - 1]}/{rec.year} ·{' '}
                          {src ? SALARY_CATEGORY_LABELS[src.category] : 'Extraordinária'} ·{' '}
                          {SALARY_STATUS_LABELS[rec.status]}
                        </div>
                      </div>
                      <div className="text-sm font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
                        R$ {formatCurrencyBRL(rec.amount ?? 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AREA 7: RELATÓRIOS E COMPARATIVOS */}
      {areaTab === 'reports' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#082B5C] dark:text-white">
                Relatório comparativo de rendas ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Totais recalculados diretamente dos lançamentos mensais, evitando contagem dupla com o extrato.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportSalaryCsv}
              className="min-h-10 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download size={15} /> Exportar CSV ({selectedYear})
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2 text-xs">
              <div className="font-bold text-sm text-[#082B5C] dark:text-white">
                Comparativo {yearlyComparison.yearA} × {yearlyComparison.yearB}
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 tabular-nums">
                <span className="text-slate-500">Total anual {yearlyComparison.yearA}:</span>
                <strong>R$ {formatCurrencyBRL(yearlyComparison.totalYearA)}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 tabular-nums">
                <span className="text-slate-500">Total anual {yearlyComparison.yearB}:</span>
                <strong>R$ {formatCurrencyBRL(yearlyComparison.totalYearB)}</strong>
              </div>
              <div className="flex justify-between py-1 tabular-nums">
                <span className="text-slate-500">Crescimento (mesmos meses em comum):</span>
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {yearlyComparison.samePeriodGrowthPct === null
                    ? '—'
                    : `${yearlyComparison.samePeriodGrowthPct >= 0 ? '+' : ''}${yearlyComparison.samePeriodGrowthPct.toFixed(1)}%`}
                </strong>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2 text-xs">
              <div className="font-bold text-sm text-[#082B5C] dark:text-white">
                Resumo consolidado por ano cadastrado
              </div>
              {availableYears.map((yr) => (
                <div
                  key={`rep-${yr}`}
                  className="flex justify-between py-1 border-b last:border-0 border-slate-100 dark:border-slate-800 tabular-nums"
                >
                  <span className="text-slate-500">Ano {yr}:</span>
                  <strong>
                    R$ {formatCurrencyBRL(getAnnualTotal(dataset.records, yr, dataset.sources))}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SHEET: ADD / EDIT SALARY SOURCE */}
      <Sheet
        open={sourceSheetOpen}
        onClose={() => setSourceSheetOpen(false)}
        title={editingSource ? 'Editar fonte de renda' : 'Cadastrar fonte de renda'}
        subtitle="Defina instituição, natureza (salário, docência, 13º, férias, extra) e periodicidade."
      >
        <form onSubmit={handleSaveSource} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Nome da fonte / atividade
            </label>
            <input
              type="text"
              value={srcName}
              onChange={(e) => setSrcName(e.target.value)}
              placeholder="Ex.: Câmara Municipal de Paragominas, UNIP, SENAR..."
              className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Categoria
              </label>
              <select
                value={srcCategory}
                onChange={(e) => setSrcCategory(e.target.value as SalaryCategory)}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                {Object.entries(SALARY_CATEGORY_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Periodicidade
              </label>
              <select
                value={srcFrequency}
                onChange={(e) => setSrcFrequency(e.target.value as PaymentFrequency)}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="monthly">Mensal</option>
                <option value="weekly">Semanal</option>
                <option value="occasional">Eventual</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Data de início
            </label>
            <input
              type="date"
              value={srcStartDate}
              onChange={(e) => setSrcStartDate(e.target.value)}
              className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          {srcError && <p className="text-xs text-red-600 font-semibold">{srcError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSourceSheetOpen(false)}
              className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Salvar fonte
            </button>
          </div>
        </form>
      </Sheet>

      {/* SHEET: QUICK RECORD */}
      <Sheet
        open={quickRecordOpen}
        onClose={() => setQuickRecordOpen(false)}
        title="Registrar salário ou renda mensal"
        subtitle="Adiciona ou atualiza o valor recebido/previsto de uma fonte no mês selecionado."
      >
        <form onSubmit={submitQuickRecord} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Fonte de renda
            </label>
            <select
              value={qrSourceId}
              onChange={(e) => setQrSourceId(e.target.value)}
              className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="">Selecione...</option>
              {dataset.sources
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({SALARY_CATEGORY_LABELS[s.category]})
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Ano
              </label>
              <input
                type="number"
                value={qrYear}
                onChange={(e) => setQrYear(Number(e.target.value))}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Mês
              </label>
              <select
                value={qrMonth}
                onChange={(e) => setQrMonth(Number(e.target.value))}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              >
                {MONTHS_PT_SHORT.map((lbl, idx) => (
                  <option key={lbl} value={idx + 1}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Valor líquido (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
                placeholder="3924.87"
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Situação
              </label>
              <select
                value={qrStatus}
                onChange={(e) => setQrStatus(e.target.value as SalaryRecordStatus)}
                className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="received">Recebido</option>
                <option value="expected">Previsto</option>
                <option value="partially_received">Recebido parcial</option>
                <option value="unknown">A confirmar</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Observação
            </label>
            <input
              type="text"
              value={qrNotes}
              onChange={(e) => setQrNotes(e.target.value)}
              placeholder="Opcional"
              className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          {qrError && <p className="text-xs text-red-600 font-semibold">{qrError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setQuickRecordOpen(false)}
              className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Salvar lançamento
            </button>
          </div>
        </form>
      </Sheet>

      {/* SHEET: ADD NEW YEAR */}
      <Sheet
        open={yearSheetOpen}
        onClose={() => setYearSheetOpen(false)}
        title="Adicionar ano ao histórico"
        subtitle="Permite consultar e lançar salários de anos anteriores ou futuros (ex.: 2024, 2025, 2027)."
      >
        <div className="space-y-4">
          <input
            type="number"
            min={2000}
            max={2100}
            value={newYearInput}
            onChange={(e) => setNewYearInput(e.target.value)}
            className="w-full min-h-11 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setYearSheetOpen(false)}
              className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const yr = Number(newYearInput);
                if (Number.isInteger(yr) && yr >= 2000 && yr <= 2100) {
                  setCustomYears((prev) => (prev.includes(yr) ? prev : [...prev, yr]));
                  setSelectedYear(yr);
                  setYearSheetOpen(false);
                }
              }}
              className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Abrir ano {newYearInput}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
