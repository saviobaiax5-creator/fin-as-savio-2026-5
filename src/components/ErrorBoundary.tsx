import React from 'react';
import { AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { STORAGE_KEYS, readRawKeySafe } from '../utils/storage';
import { todayLocal } from '../utils/dateLocal';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado de renderização.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary capturou erro:', error, info);
  }

  private handleEmergencyBackup = () => {
    const parseRaw = (key: string) => {
      const raw = readRawKeySafe(key);
      if (!raw) return [];
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };

    const emergencyPayload = {
      app: 'FINANCE_IA',
      emergencyBackup: true,
      exportedAt: new Date().toISOString(),
      data: {
        accounts: parseRaw(STORAGE_KEYS.accounts),
        transactions: parseRaw(STORAGE_KEYS.transactions),
        creditCards: parseRaw(STORAGE_KEYS.cards),
        boletos: parseRaw(STORAGE_KEYS.boletos),
        debts: parseRaw(STORAGE_KEYS.debts),
        assets: parseRaw(STORAGE_KEYS.assets),
        documents: parseRaw(STORAGE_KEYS.docs),
      },
    };

    const blob = new Blob([JSON.stringify(emergencyPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Savio_Financas_Emergencia_${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  private handleClearCacheAndReload = async () => {
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((k) => window.caches.delete(k)));
      }
    } catch {
      // ignore cleanup error and proceed to reload
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-dvh bg-[#F8FAFC] dark:bg-[#050B42] text-[#0F172A] dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full sf-card rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3">
            <div className="sf-icon-badge-danger">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
                Algo deu errado na exibição
              </h1>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Seus registros salvos permanecem protegidos no dispositivo.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 break-words">
            {this.state.errorMessage}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={this.handleEmergencyBackup}
              className="flex-1 min-h-12 px-4 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download size={16} />
              Baixar backup de emergência
            </button>
            <button
              type="button"
              onClick={() => void this.handleClearCacheAndReload()}
              className="flex-1 min-h-12 px-4 bg-[#061E3E] hover:bg-[#0F172A] text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw size={16} />
              Atualizar e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
