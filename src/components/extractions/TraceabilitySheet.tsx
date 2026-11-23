import React, { useEffect, useState } from 'react';
import { Sheet } from '../Sheet';
import {
  EXTRACTION_MOVEMENT_LABELS,
  type TraceabilityLookupResult,
} from '../../types/extractions';
import { fileStorageService } from '../../services/fileStorage';
import { InstitutionCategoryBadge } from './InstitutionCategoryBadge';
import {
  ArrowRight,
  Download,
  FileText,
  History,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { formatDateBR } from '../../utils/dateUtils';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';

interface TraceabilitySheetProps {
  open: boolean;
  onClose: () => void;
  traceability: TraceabilityLookupResult | null;
}

export const TraceabilitySheet: React.FC<TraceabilitySheetProps> = ({
  open,
  onClose,
  traceability,
}) => {
  const { hideValues } = usePrivacy();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string>('');
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (!open || !traceability?.batch.fileId) {
      setPreviewUrl(null);
      return;
    }
    setFileLoading(true);
    void fileStorageService
      .getFile(traceability.batch.fileId)
      .then((rec) => {
        if (!rec) return;
        setFileMime(rec.mimeType);
        activeUrl = URL.createObjectURL(rec.blob);
        setPreviewUrl(activeUrl);
      })
      .finally(() => setFileLoading(false));

    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [open, traceability?.batch.fileId]);

  if (!traceability) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Rastrear movimentação"
        subtitle="Origem documental e auditoria do lançamento"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
          Este lançamento foi cadastrado diretamente no sistema (sem lote de extração vinculado).
        </p>
      </Sheet>
    );
  }

  const { movement, batch, institution, accountLabel } = traceability;
  const instCategory =
    institution?.category || batch.identifiedAccount.institutionCategory || 'OUTRA';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rastrear movimentação"
      subtitle="Cadeia completa da origem documental até os saldos e relatórios"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4 text-xs sm:text-sm">
        {/* Chain Overview */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/80 border border-[#E2E8F0] dark:border-white/10 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white">
              <Landmark size={16} className="text-[#059669] dark:text-[#10B981]" />
              <span>{institution?.commercialName || batch.identifiedAccount.bankName || 'Instituição identificada'}</span>
            </div>
            <InstitutionCategoryBadge category={instCategory} compact />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
            <span>Instituição</span>
            <ArrowRight size={11} />
            <span>{accountLabel}</span>
            <ArrowRight size={11} />
            <span>{batch.fileName}</span>
            <ArrowRight size={11} />
            <span>Lote {batch.id.slice(-8)}</span>
            <ArrowRight size={11} />
            <span className="font-bold text-[#059669] dark:text-[#10B981]">
              {movement.integratedModule || 'Sistema Financeiro'}
            </span>
          </div>
        </div>

        {/* Movement Snapshot */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400">Descrição Original</span>
            <div className="font-bold text-slate-900 dark:text-white break-words">
              {movement.originalDescription}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Data: {formatDateBR(movement.date)} · Tipo: {EXTRACTION_MOVEMENT_LABELS[movement.movementType]}
            </div>
            {movement.bankTransactionId && (
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
                ID Bancário: {movement.bankTransactionId}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400">Valor & Integração</span>
            <div className="font-money text-lg font-extrabold text-[#0F172A] dark:text-white">
              {movement.currency === 'BRL'
                ? formatarValor(movement.amount, hideValues)
                : `${movement.currency} ${hideValues ? '•••••' : formatCurrencyBRL(movement.amount)}`}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Categoria: <strong>{movement.suggestedCategory}</strong> · Titular:{' '}
              <strong>{movement.entityId || 'Não informado'}</strong>
            </div>
            {movement.integratedTransactionId && (
              <div className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                Lançamento integrado: {movement.integratedTransactionId}
              </div>
            )}
          </div>
        </div>

        {/* File & Period Metadata */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white">
              <FileText size={15} />
              <span>Documento Original ({batch.format})</span>
            </div>
            {previewUrl && (
              <a
                href={previewUrl}
                download={batch.fileName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#061E3E] hover:bg-[#0F172A] text-white text-xs font-bold transition-colors"
              >
                <Download size={13} /> Baixar original
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div>
              <span className="block text-slate-400">Importado em</span>
              <strong className="text-slate-700 dark:text-slate-200">
                {new Date(batch.importedAt).toLocaleString('pt-BR')}
              </strong>
            </div>
            <div>
              <span className="block text-slate-400">Período extrato</span>
              <strong className="text-slate-700 dark:text-slate-200">
                {batch.periodStart ? formatDateBR(batch.periodStart) : '—'} a{' '}
                {batch.periodEnd ? formatDateBR(batch.periodEnd) : '—'}
              </strong>
            </div>
            <div>
              <span className="block text-slate-400">Aprovação</span>
              <strong className="text-slate-700 dark:text-slate-200">
                {movement.approvedAt ? new Date(movement.approvedAt).toLocaleString('pt-BR') : 'Manual'}
              </strong>
            </div>
            <div>
              <span className="block text-slate-400">Conta / Titular</span>
              <strong className="text-slate-700 dark:text-slate-200">
                {batch.identifiedAccount.maskedAccountNumber || '—'}{' '}
                {batch.identifiedAccount.maskedDocument || ''}
              </strong>
            </div>
          </div>

          {fileLoading && (
            <div className="text-[11px] text-slate-400">Carregando prévia do arquivo preservado...</div>
          )}

          {previewUrl && fileMime.startsWith('image/') && (
            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 max-h-60 flex items-center justify-center">
              <img
                src={previewUrl}
                alt={`Comprovante original ${batch.fileName}`}
                className="max-h-60 object-contain"
              />
            </div>
          )}

          {previewUrl && !fileMime.startsWith('image/') && (
            <div className="flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-300 pt-1">
              <Eye size={13} />
              <span>Arquivo original preservado no cofre local IndexedDB ({(batch.fileSizeBytes / 1024).toFixed(1)} KB).</span>
            </div>
          )}
        </div>

        {/* Raw Row Snapshot */}
        {Object.keys(movement.rawRowSnapshot).length > 0 && (
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Registro bruto extraído do documento
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg overflow-x-auto">
              {Object.entries(movement.rawRowSnapshot).map(([k, v]) => (
                <div key={k} className="truncate">
                  <span className="text-slate-400">{k}:</span>{' '}
                  <span className="text-slate-800 dark:text-slate-200">{String(v ?? '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lineage Timeline */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-white/10 space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#0F172A] dark:text-white">
            <History size={15} />
            <span>Trilha completa de auditoria</span>
          </div>
          <div className="space-y-2">
            {movement.lineage.map((ev, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <CheckCircle2 size={14} className="text-[#059669] dark:text-[#10B981] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#0F172A] dark:text-white">{ev.stage}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(ev.timestamp).toLocaleString('pt-BR')} · {ev.actor}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 break-words">
                    {ev.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 text-xs">
          <ShieldCheck size={16} className="shrink-0" />
          <span>Dados bancários sensíveis são exibidos mascarados conforme diretriz de proteção de dados.</span>
        </div>
      </div>
    </Sheet>
  );
};
