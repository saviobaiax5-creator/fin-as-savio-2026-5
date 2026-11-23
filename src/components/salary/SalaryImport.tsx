import React, { useMemo, useState } from 'react';
import { importSalaryExcel } from '../../services/salaryExcelImport';
import {
  MONTHS_PT_SHORT,
  SALARY_CATEGORY_LABELS,
  type SalaryCategory,
  type SalaryImportResult,
  type SalaryRecord,
  type SalaryRecordStatus,
  type SalarySource,
} from '../../types/salary';
import {
  detectSalaryImportDuplicates,
  normalizeSourceNameKey,
} from '../../utils/salaryCalculations';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';

interface SalaryImportProps {
  existingSources: SalarySource[];
  existingRecords: SalaryRecord[];
  onImport: (
    data: SalaryImportResult,
    options: { skipDuplicates: boolean }
  ) => Promise<void> | void;
  onCancel?: () => void;
}

export default function SalaryImport({
  existingSources,
  existingRecords,
  onImport,
  onCancel,
}: SalaryImportProps) {
  const { hideValues } = usePrivacy();
  const [preview, setPreview] = useState<SalaryImportResult | null>(null);
  const [excludedSourceIds, setExcludedSourceIds] = useState<Set<string>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function handleFile(file?: File) {
    if (!file) return;

    setLoading(true);
    setError('');
    setPreview(null);
    setExcludedSourceIds(new Set());
    setFileName(file.name);

    try {
      const result = await importSalaryExcel(file);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler a planilha.');
    } finally {
      setLoading(false);
    }
  }

  const duplicateInfo = useMemo(() => {
    if (!preview) return null;
    return detectSalaryImportDuplicates(
      preview.sources,
      preview.records,
      existingSources,
      existingRecords
    );
  }, [preview, existingSources, existingRecords]);

  const toggleSourceIncluded = (sourceId: string) => {
    setExcludedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const updatePreviewSourceCategory = (sourceId: string, category: SalaryCategory) => {
    if (!preview) return;
    setPreview({
      ...preview,
      sources: preview.sources.map((s) => (s.id === sourceId ? { ...s, category } : s)),
    });
  };

  const updatePreviewRecordAmount = (recordId: string, rawVal: string) => {
    if (!preview) return;
    const parsed = Number(rawVal.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    setPreview({
      ...preview,
      records: preview.records.map((r) =>
        r.id === recordId ? { ...r, amount: parsed, updatedAt: new Date().toISOString() } : r
      ),
    });
  };

  const updatePreviewRecordStatus = (recordId: string, status: SalaryRecordStatus) => {
    if (!preview) return;
    setPreview({
      ...preview,
      records: preview.records.map((r) =>
        r.id === recordId ? { ...r, status, updatedAt: new Date().toISOString() } : r
      ),
    });
  };

  const markAllAsStatus = (status: SalaryRecordStatus) => {
    if (!preview) return;
    setPreview({
      ...preview,
      records: preview.records.map((r) => ({ ...r, status, updatedAt: new Date().toISOString() })),
    });
  };

  const existingSourceNames = useMemo(
    () => new Set(existingSources.map((s) => normalizeSourceNameKey(s.name))),
    [existingSources]
  );

  async function confirmImport() {
    if (!preview) return;

    const filteredSources = preview.sources.filter((s) => !excludedSourceIds.has(s.id));
    const allowedSourceIds = new Set(filteredSources.map((s) => s.id));
    const filteredRecords = preview.records.filter((r) => allowedSourceIds.has(r.sourceId));

    setLoading(true);
    setError('');
    try {
      await onImport(
        {
          ...preview,
          sources: filteredSources,
          records: filteredRecords,
        },
        { skipDuplicates }
      );
      setPreview(null);
      setFileName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar os dados.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-5 sf-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="sf-icon-badge shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
              Importar salários do Excel (Planilha1 · A1:N24)
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
              Lê exclusivamente o bloco salarial (A:N), ignora totais da coluna O, preserva células vazias como ausentes e apresenta prévia editável antes de salvar.
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-9 px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-slate-700 text-xs font-semibold cursor-pointer"
          >
            Fechar
          </button>
        )}
      </div>

      <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[#CBD5E1] dark:border-slate-700 hover:border-[#059669] transition-colors cursor-pointer bg-[#F8FAFC] dark:bg-slate-800/40">
        <Upload className="w-6 h-6 text-[#059669]" />
        <span className="text-sm font-semibold text-[#0F172A] dark:text-white">
          {fileName ? `Arquivo selecionado: ${fileName}` : 'Clique para selecionar arquivo .xlsx ou .xls'}
        </span>
        <span className="text-xs text-[#64748B] dark:text-slate-400">
          Os lançamentos entram inicialmente como &ldquo;A confirmar&rdquo; para sua validação.
        </span>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </label>

      {loading && (
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
          Processando planilha...
        </p>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 font-semibold">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700">
              <span className="text-[#64748B] dark:text-slate-400 block">Ano identificado</span>
              <strong className="font-money text-base text-[#0F172A] dark:text-white">
                {preview.year}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700">
              <span className="text-[#64748B] dark:text-slate-400 block">Fontes encontradas</span>
              <strong className="font-money text-base text-[#0F172A] dark:text-white">
                {preview.sources.length - excludedSourceIds.size} de {preview.sources.length}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700">
              <span className="text-[#64748B] dark:text-slate-400 block">Lançamentos mensais</span>
              <strong className="font-money text-base text-[#0F172A] dark:text-white">
                {preview.records.length}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700">
              <span className="text-[#64748B] dark:text-slate-400 block">Duplicidades detectadas</span>
              <strong className="font-money text-base text-amber-700 dark:text-amber-400">
                {duplicateInfo?.duplicateCount ?? 0}
              </strong>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 space-y-1">
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Avisos da leitura
              </div>
              {preview.warnings.map((warning, idx) => (
                <p key={idx} className="text-xs text-amber-800 dark:text-amber-300">
                  {warning}
                </p>
              ))}
            </div>
          )}

          {/* Review Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
              />
              Ignorar meses já cadastrados (não sobrescrever dados existentes)
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => markAllAsStatus('received')}
                className="min-h-9 px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-50 cursor-pointer"
              >
                Marcar prévia como Recebido
              </button>
              <button
                type="button"
                onClick={() => markAllAsStatus('unknown')}
                className="min-h-9 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Manter como A confirmar
              </button>
            </div>
          </div>

          {/* Sources + Sample Monthly Review Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-[380px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-10">
                <tr>
                  <th className="p-2.5 text-left font-bold">Incluir</th>
                  <th className="p-2.5 text-left font-bold">Fonte / Instituição</th>
                  <th className="p-2.5 text-left font-bold">Categoria</th>
                  <th className="p-2.5 text-left font-bold">Meses encontrados (clique no valor para corrigir)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.sources.map((src) => {
                  const included = !excludedSourceIds.has(src.id);
                  const srcRecords = preview.records.filter((r) => r.sourceId === src.id);
                  const isExisting = existingSourceNames.has(normalizeSourceNameKey(src.name));

                  return (
                    <tr
                      key={src.id}
                      className={included ? '' : 'opacity-50 bg-slate-50 dark:bg-slate-900'}
                    >
                      <td className="p-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => toggleSourceIncluded(src.id)}
                          aria-label={`Incluir ${src.name}`}
                        />
                      </td>
                      <td className="p-2.5 align-top min-w-[160px]">
                        <div className="font-bold text-[#0F172A] dark:text-white">{src.name}</div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                          {isExisting ? 'Já existe no cadastro' : 'Nova fonte'} · {srcRecords.length} mês(es)
                        </div>
                      </td>
                      <td className="p-2.5 align-top">
                        <select
                          aria-label={`Categoria de ${src.name}`}
                          value={src.category}
                          onChange={(e) =>
                            updatePreviewSourceCategory(src.id, e.target.value as SalaryCategory)
                          }
                          className="min-h-8 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                        >
                          {Object.entries(SALARY_CATEGORY_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5 align-top">
                        <div className="flex flex-wrap gap-2">
                          {srcRecords.map((rec) => {
                            const isDup = duplicateInfo?.duplicateKeys.has(rec.id);
                            return (
                              <div
                                key={rec.id}
                                className={`p-2 rounded-lg border text-[11px] space-y-1 ${
                                  isDup
                                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30'
                                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold">
                                    {MONTHS_PT_SHORT[rec.month - 1]}
                                    {isDup ? ' (duplicado)' : ''}
                                  </span>
                                  <select
                                    aria-label={`Status ${src.name} ${MONTHS_PT_SHORT[rec.month - 1]}`}
                                    value={rec.status}
                                    onChange={(e) =>
                                      updatePreviewRecordStatus(
                                        rec.id,
                                        e.target.value as SalaryRecordStatus
                                      )
                                    }
                                    className="px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px]"
                                  >
                                    <option value="unknown">A confirmar</option>
                                    <option value="received">Recebido</option>
                                    <option value="expected">Previsto</option>
                                  </select>
                                </div>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  defaultValue={rec.amount !== null ? String(rec.amount) : ''}
                                  onBlur={(e) => updatePreviewRecordAmount(rec.id, e.target.value)}
                                  className="w-24 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold tabular-nums"
                                  title={`Original: ${formatarValor(rec.amount ?? 0, hideValues)}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="min-h-10 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Limpar prévia
            </button>
            <button
              type="button"
              disabled={loading || preview.errors.length > 0}
              onClick={confirmImport}
              className="min-h-10 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 size={15} />
              Confirmar importação
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
