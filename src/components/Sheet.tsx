import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  headerVariant?: 'navy' | 'plain' | 'danger';
}

/**
 * Reusable accessible bottom-sheet (mobile) / centered dialog (desktop).
 * Respects iOS/Android safe areas and Escape key dismissal.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidthClass = 'md:max-w-md',
  headerVariant = 'navy',
}) => {
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const headerClasses =
    headerVariant === 'navy'
      ? 'bg-[#061E3E] text-white'
      : headerVariant === 'danger'
      ? 'bg-red-700 text-white'
      : 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white border-b border-slate-100 dark:border-slate-800';

  const closeBtnClasses =
    headerVariant === 'plain'
      ? 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
      : 'text-slate-200 hover:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="Fechar janela"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 w-full ${maxWidthClass} bg-white dark:bg-slate-900 rounded-t-3xl md:rounded-2xl max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-fadeIn`}
      >
        <header className={`px-5 py-4 flex items-center justify-between gap-3 shrink-0 ${headerClasses}`}>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold truncate">{title}</h3>
            {subtitle && (
              <p className="text-xs opacity-80 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className={`min-w-10 min-h-10 grid place-items-center rounded-xl cursor-pointer transition-colors ${closeBtnClasses}`}
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto overscroll-contain flex-1 space-y-4 pb-[calc(20px+env(safe-area-inset-bottom))]">
          {children}
        </div>

        {footer && (
          <footer className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 shrink-0 pb-[calc(16px+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
};
