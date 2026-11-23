import React from 'react';
import { AlertTriangle, Cloud, HardDrive, GitMerge } from 'lucide-react';
import { Sheet } from './Sheet';
import type {
  ConflictResolutionStrategy,
  SyncConflictState,
} from '../services/cloudSyncService';

interface SyncConflictSheetProps {
  conflict: SyncConflictState | null;
  busy: boolean;
  onResolve: (strategy: ConflictResolutionStrategy) => void;
  onDismissLater: () => void;
}

export const SyncConflictSheet: React.FC<SyncConflictSheetProps> = ({
  conflict,
  busy,
  onResolve,
  onDismissLater,
}) => {
  const isCloudEmpty = Boolean(
    conflict &&
      conflict.cloudCounts.accounts +
        conflict.cloudCounts.transactions +
        conflict.cloudCounts.creditCards +
        conflict.cloudCounts.boletos +
        conflict.cloudCounts.debts +
        conflict.cloudCounts.assets +
        conflict.cloudCounts.documents +
        (conflict.cloudCounts.salaryRecords ?? 0) ===
        0
  );

  return (
    <Sheet
      open={Boolean(conflict)}
      onClose={onDismissLater}
      title={
        isCloudEmpty
          ? 'Nova conta vazia · Dados locais encontrados'
          : 'Divergência entre este dispositivo e a nuvem'
      }
      subtitle="Seus dados estão protegidos. Um backup automático será salvo antes de aplicar sua escolha."
      headerVariant="navy"
    >
      {conflict && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              {isCloudEmpty
                ? 'Esta conta ainda não possui dados na nuvem, mas há registros salvos neste aparelho (de uma sessão anterior). Escolha se deseja começar esta conta do zero ou importar os dados locais:'
                : 'Encontramos registros locais e registros salvos na nuvem que diferem entre si. Para evitar sobrescrita silenciosa, escolha como consolidar:'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 space-y-1.5">
              <div className="font-display font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                <HardDrive size={14} className="text-[#059669]" /> Este dispositivo (Local)
              </div>
              <div className="font-money text-[#64748B] dark:text-slate-300 space-y-0.5">
                <div>Contas: {conflict.localCounts.accounts}</div>
                <div>Lançamentos: {conflict.localCounts.transactions}</div>
                <div>Boletos: {conflict.localCounts.boletos} · Cartões: {conflict.localCounts.creditCards}</div>
                <div>Salários: {conflict.localCounts.salaryRecords ?? 0}</div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 space-y-1.5">
              <div className="font-display font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                <Cloud size={14} className="text-blue-600" /> Nuvem (Conta atual)
              </div>
              <div className="font-money text-[#64748B] dark:text-slate-300 space-y-0.5">
                <div>Contas: {conflict.cloudCounts.accounts}</div>
                <div>Lançamentos: {conflict.cloudCounts.transactions}</div>
                <div>Boletos: {conflict.cloudCounts.boletos} · Cartões: {conflict.cloudCounts.creditCards}</div>
                <div>Salários: {conflict.cloudCounts.salaryRecords ?? 0}</div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            {isCloudEmpty ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve('USE_CLOUD')}
                  className="w-full min-h-12 px-4 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <Cloud size={16} /> Começar esta conta do zero (salva backup antes)
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve('KEEP_LOCAL')}
                  className="w-full min-h-11 px-4 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#0F172A] dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <HardDrive size={15} /> Importar dados locais para esta nova conta
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve('MERGE_BOTH')}
                  className="w-full min-h-12 px-4 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <GitMerge size={16} /> Mesclar os dois conjuntos (preserva todos os IDs)
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve('KEEP_LOCAL')}
                  className="w-full min-h-11 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <HardDrive size={15} /> Manter dados deste dispositivo e enviar à nuvem
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onResolve('USE_CLOUD')}
                  className="w-full min-h-11 px-4 rounded-xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#0F172A] dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <Cloud size={15} /> Usar dados da nuvem neste dispositivo
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
};
