import React from 'react';
import { Sheet } from './Sheet';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface ConfirmDeleteSheetProps {
  open: boolean;
  title: string;
  itemLabel: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDeleteSheet: React.FC<ConfirmDeleteSheetProps> = ({
  open,
  title,
  itemLabel,
  description,
  confirmLabel = 'Excluir registro',
  onConfirm,
  onCancel,
}) => {
  return (
    <Sheet
      open={open}
      onClose={onCancel}
      title={title}
      subtitle="Ação destrutiva — revise antes de confirmar"
      headerVariant="danger"
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="space-y-1">
            <div className="font-bold text-sm">{itemLabel}</div>
            {description && <p className="opacity-90 leading-relaxed">{description}</p>}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[1.4] min-h-12 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 size={16} /> {confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
