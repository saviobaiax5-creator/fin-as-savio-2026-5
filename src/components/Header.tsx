import React, { useEffect, useRef, useState } from 'react';
import { EntityScope, Boleto } from '../types';
import { calculateCountdown } from '../utils/countdown';
import { PeriodOption } from '../utils/dateUtils';
import { PWAInstallButton } from './PWAInstallButton';
import SavioFinancasLogo from './SavioFinancasLogo';
import {
  Bell,
  ShieldCheck,
  UserCheck,
  Building,
  Sun,
  Moon,
  Plus,
  X,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  Share2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { SyncStatus } from '../services/cloudSyncService';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface HeaderProps {
  currentTab: string;
  scope: EntityScope;
  setScope: (scope: EntityScope) => void;
  period: string;
  setPeriod: (period: string) => void;
  periodOptions: PeriodOption[];
  onOpenNewTransaction: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  boletos: Boleto[];
  onNavigate: (tab: string) => void;
  syncStatus?: SyncStatus;
  pendingSyncCount?: number;
  onOpenShare?: () => void;
  hideValues?: boolean;
  onToggleHideValues?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  scope,
  setScope,
  period,
  setPeriod,
  periodOptions,
  onOpenNewTransaction,
  theme,
  onToggleTheme,
  boletos,
  onNavigate,
  syncStatus = 'IDLE',
  pendingSyncCount = 0,
  onOpenShare,
  hideValues: propHideValues,
  onToggleHideValues: propToggleHideValues,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const {
    hideValues: ctxHideValues,
    toggleHideValues: ctxToggleHideValues,
    showScopeBar,
    toggleScopeBar,
    sidebarOpen,
    toggleSidebar,
  } = usePrivacy();

  const hideValues = propHideValues ?? ctxHideValues;
  const onToggleHideValues = propToggleHideValues ?? ctxToggleHideValues;

  useEffect(() => {
    if (!notifOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen]);

  const tabTitles: Record<string, string> = {
    dashboard: 'Visão executiva',
    cpf: 'Finanças pessoais · CPF',
    cnpj: 'Empresa · CNPJ / MEI',
    salary: 'Salários e Evolução da Renda',
    accounts: 'Contas bancárias',
    cards: 'Cartões de crédito',
    boletos: 'Boletos e contas a pagar',
    debts: 'Dívidas e compromissos',
    planning: 'Planejamento 50/30/20',
    investments: 'Investimentos · CDI & Simulador',
    assets: 'Patrimônio e investimentos',
    documents: 'Central de Documentos & Leitura',
    imports: 'Central de Extrações Financeiras',
    extractions: 'Central de Extrações Financeiras',
    notifications: 'Central de Notificações Bancárias',
    ai: 'Inteligência Artificial',
    reports: 'Relatórios gerenciais',
    settings: 'Configurações',
  };

  const alertBoletos = boletos.filter((b) => {
    if (b.status === 'PAID') return false;
    const c = calculateCountdown(b.vencimento, false);
    return c.status === 'OVERDUE' || c.status === 'DUE_TODAY' || c.status === 'UPCOMING';
  });

  const renderSyncIcon = () => (
    <>
      {syncStatus === 'SYNCING' && (
        <RefreshCw size={17} className="text-sky-600 dark:text-sky-400 animate-spin" />
      )}
      {syncStatus === 'SYNCED' && (
        <Cloud size={17} className="text-[#00A65A] dark:text-[#00A65A]" />
      )}
      {(syncStatus === 'PENDING_OFFLINE' || syncStatus === 'IDLE') && (
        <CloudOff size={17} className="text-amber-600 dark:text-amber-400" />
      )}
      {(syncStatus === 'CONFLICT' || syncStatus === 'UNVERIFIED_EMAIL' || syncStatus === 'ERROR') && (
        <AlertTriangle size={17} className="text-[#DC3545] dark:text-[#DC3545]" />
      )}
      {pendingSyncCount > 0 && (
        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
          {pendingSyncCount}
        </span>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-[var(--sf-border)] dark:border-slate-800 shadow-xs px-3 sm:px-4 md:px-8 select-none">
      {/* Row 1: Brand + Primary Quick Actions (never overflows on narrow viewports) */}
      <div className="min-h-14 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Minimizar menu lateral' : 'Expandir menu lateral'}
            title={sidebarOpen ? 'Minimizar menu lateral' : 'Expandir menu lateral'}
            className="hidden md:grid min-w-9 min-h-9 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="shrink-0">
            <SavioFinancasLogo size={30} showName={false} />
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-[#082B5C] dark:text-[#F5B719] font-bold block truncate">
              Sávio Finanças
            </span>
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-[#082B5C] dark:text-white truncate">
              {tabTitles[currentTab] || 'Dashboard'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Desktop toolbar items */}
          <div className="hidden md:flex items-center gap-1.5">
            <select
              aria-label="Período de referência"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-[#00A65A] cursor-pointer min-h-10"
            >
              {periodOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              title="Ver status de sincronização e backup"
              aria-label="Status da sincronização com a nuvem"
              className="min-w-10 min-h-10 px-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            >
              {renderSyncIcon()}
            </button>

            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="flex items-center gap-1.5 bg-[#082B5C] hover:bg-[#061B3B] dark:bg-[#00A65A] dark:hover:bg-[#00A65A]/90 text-white px-4 min-h-10 rounded-xl text-sm font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus size={18} />
              Novo lançamento
            </button>

            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                aria-label="Compartilhar ou abrir no celular"
                title="Compartilhar link e QR Code para celular"
                className="min-w-10 min-h-10 grid place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <Share2 size={18} />
              </button>
            )}

            <button
              type="button"
              onClick={toggleScopeBar}
              aria-label={showScopeBar ? 'Esconder abas Consolidado/CPF/CNPJ' : 'Mostrar abas Consolidado/CPF/CNPJ'}
              title={showScopeBar ? 'Esconder barra de abas' : 'Mostrar barra de abas'}
              className={`min-h-10 px-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                showScopeBar
                  ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
              }`}
            >
              {showScopeBar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              <span>Abas</span>
            </button>
          </div>

          {/* Always-visible compact icons (Mobile & PC) */}
          <button
            type="button"
            onClick={onToggleHideValues}
            aria-label={hideValues ? 'Mostrar valores monetários' : 'Ocultar valores monetários'}
            title={hideValues ? 'Valores ocultos (Clique para exibir)' : 'Ocultar valores (Modo privacidade)'}
            className={`min-w-9 min-h-9 sm:min-w-10 sm:min-h-10 grid place-items-center rounded-xl transition-colors cursor-pointer ${
              hideValues
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            className="min-w-9 min-h-9 sm:min-w-10 sm:min-h-10 grid place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun size={18} className="text-[#F5B719]" /> : <Moon size={18} />}
          </button>

          <div className="relative shrink-0" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="Notificações de vencimentos"
              aria-expanded={notifOpen}
              className="min-w-9 min-h-9 sm:min-w-10 sm:min-h-10 grid place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer relative shrink-0"
            >
              <Bell size={18} />
              {alertBoletos.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#DC3545] ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-4 z-50">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-bold text-[#082B5C] dark:text-white">
                    Alertas de vencimento ({alertBoletos.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    aria-label="Fechar notificações"
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {alertBoletos.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    Nenhum boleto vencido ou próximo do vencimento.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {alertBoletos.map((b) => {
                      const c = calculateCountdown(b.vencimento, false);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onNavigate('boletos');
                          }}
                          className="w-full text-left p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-xs font-bold text-[#082B5C] dark:text-white truncate">
                              {b.beneficiario}
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0">
                              {formatarValor(b.valorOriginal, hideValues)}
                            </span>
                          </div>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${c.badgeColor}`}>
                            {c.shortLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2 (Mobile-Only): Period, Cloud, Share & Explicit Hide/Show Tabs control */}
      <div className="flex md:hidden items-center justify-between gap-1.5 pb-2 pt-0.5 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            aria-label="Período de referência"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border border-slate-200 dark:border-slate-700 py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-[#00A65A] cursor-pointer min-h-9 max-w-[120px] truncate"
          >
            {periodOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <PWAInstallButton compact />

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            title="Ver status de sincronização e backup"
            aria-label="Status da sincronização com a nuvem"
            className="min-w-9 min-h-9 px-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 text-xs font-semibold cursor-pointer shrink-0"
          >
            {renderSyncIcon()}
          </button>

          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              aria-label="Compartilhar ou abrir no celular"
              title="Compartilhar link e QR Code para celular"
              className="min-w-9 min-h-9 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer shrink-0"
            >
              <Share2 size={16} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleScopeBar}
          aria-expanded={showScopeBar}
          aria-label={showScopeBar ? 'Esconder barra de abas' : 'Mostrar barra de abas'}
          className={`min-h-9 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
            showScopeBar
              ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
          }`}
        >
          {showScopeBar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{showScopeBar ? 'Esconder abas' : 'Mostrar abas'}</span>
        </button>
      </div>

      {/* Row 3: Collapsible Scope Bar (Consolidado / CPF / CNPJ) */}
      {showScopeBar && (
        <div className="flex items-center justify-between gap-2 pb-2.5 pt-1">
          <div
            className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex items-center gap-1 border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none"
            role="group"
            aria-label="Seletor de titularidade e visão"
          >
            <button
              type="button"
              aria-pressed={scope === 'CONSOLIDATED' && currentTab === 'dashboard'}
              onClick={() => {
                setScope('CONSOLIDATED');
                onNavigate('dashboard');
              }}
              className={`flex-1 sm:flex-none min-h-9 px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CONSOLIDATED' && currentTab === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-[#082B5C] dark:text-white shadow-xs border border-slate-200/60 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="truncate">Consolidado</span>
            </button>
            <button
              type="button"
              aria-pressed={scope === 'CPF' && currentTab === 'cpf'}
              onClick={() => {
                setScope('CPF');
                onNavigate('cpf');
              }}
              className={`flex-1 sm:flex-none min-h-9 px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CPF' && currentTab === 'cpf'
                  ? 'bg-white dark:bg-slate-900 text-[#082B5C] dark:text-white shadow-xs border border-slate-200/60 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <UserCheck className="w-4 h-4 text-[#00A65A] shrink-0" />
              <span>CPF</span>
            </button>
            <button
              type="button"
              aria-pressed={scope === 'CNPJ' && currentTab === 'cnpj'}
              onClick={() => {
                setScope('CNPJ');
                onNavigate('cnpj');
              }}
              className={`flex-1 sm:flex-none min-h-9 px-2.5 sm:px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CNPJ' && currentTab === 'cnpj'
                  ? 'bg-white dark:bg-slate-900 text-[#082B5C] dark:text-white shadow-xs border border-slate-200/60 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Building className="w-4 h-4 text-[#F5B719] shrink-0" />
              <span>CNPJ</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleScopeBar}
            aria-label="Esconder barra de abas"
            title="Minimizar/Esconder barra de abas"
            className="min-h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <ChevronUp size={15} />
            <span className="hidden sm:inline">Esconder</span>
          </button>
        </div>
      )}
    </header>
  );
};
