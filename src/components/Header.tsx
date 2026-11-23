import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EntityScope, Boleto, Account } from '../types';
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
  PanelLeftClose,
  PanelLeftOpen,
  Filter,
  Camera,
  FolderOpen,
  Building2,
  ChevronRight,
  SlidersHorizontal,
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
  accounts?: Account[];
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
  accounts = [],
  onNavigate,
  syncStatus = 'IDLE',
  pendingSyncCount = 0,
  onOpenShare,
  hideValues: propHideValues,
  onToggleHideValues: propToggleHideValues,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const {
    isPrivacyMode: ctxPrivacyMode,
    togglePrivacyMode: ctxTogglePrivacyMode,
    hideValues: ctxHideValues,
    toggleHideValues: ctxToggleHideValues,
    showScopeBar,
    toggleScopeBar,
    sidebarOpen,
    toggleSidebar,
  } = usePrivacy();

  const hideValues = propHideValues ?? ctxPrivacyMode ?? ctxHideValues;
  const onToggleHideValues = propToggleHideValues ?? ctxTogglePrivacyMode ?? ctxToggleHideValues;

  const scopedAccounts = useMemo(
    () => accounts.filter((a) => (scope === 'CONSOLIDATED' ? true : a.entityId === scope)),
    [accounts, scope]
  );

  useEffect(() => {
    if (!notifOpen && !filterOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (notifOpen && notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (filterOpen && filterRef.current && !filterRef.current.contains(target)) {
        setFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notifOpen, filterOpen]);

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
        <RefreshCw size={17} strokeWidth={1.75} className="text-sky-600 dark:text-sky-400 animate-spin" />
      )}
      {syncStatus === 'SYNCED' && (
        <Cloud size={17} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981]" />
      )}
      {(syncStatus === 'PENDING_OFFLINE' || syncStatus === 'IDLE') && (
        <CloudOff size={17} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400" />
      )}
      {(syncStatus === 'CONFLICT' || syncStatus === 'UNVERIFIED_EMAIL' || syncStatus === 'ERROR') && (
        <AlertTriangle size={17} strokeWidth={1.75} className="text-[#DC3545] dark:text-red-400" />
      )}
      {pendingSyncCount > 0 && (
        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
          {pendingSyncCount}
        </span>
      )}
    </>
  );

  const handleSelectScope = (nextScope: EntityScope, targetTab: string) => {
    setScope(nextScope);
    onNavigate(targetTab);
  };

  return (
    <header
      ref={filterRef}
      className="sticky top-0 z-30 bg-white dark:bg-[#0B1252] border-b border-[#E2E8F0] dark:border-white/10 shadow-[0_1px_3px_rgba(15,23,42,0.04)] px-3 sm:px-4 md:px-8 select-none"
    >
      {/* Row 1: Brand + Primary Quick Actions */}
      <div className="min-h-14 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Minimizar menu lateral' : 'Expandir menu lateral'}
            title={sidebarOpen ? 'Minimizar menu lateral' : 'Expandir menu lateral'}
            className="hidden md:grid min-w-9 min-h-9 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white transition-colors cursor-pointer shrink-0"
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} strokeWidth={1.75} />
            ) : (
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            )}
          </button>

          <div className="shrink-0">
            <SavioFinancasLogo size={30} showName={false} />
          </div>

          <div className="min-w-0 flex-1">
            <span className="font-sans text-[10px] sm:text-[11px] uppercase tracking-wider text-[#64748B] dark:text-[#F5B719] font-semibold block truncate">
              Sávio Finanças
            </span>
            <h2 className="font-display text-sm sm:text-base md:text-lg font-bold text-[#0F172A] dark:text-white truncate">
              {tabTitles[currentTab] || 'Dashboard'}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Desktop toolbar items */}
          <div className="hidden md:flex items-center gap-1.5">
            <div className="flex items-center gap-1 bg-[#F8FAFC] dark:bg-[#11185A] border border-[#E2E8F0] dark:border-white/15 rounded-full p-1">
              <select
                aria-label="Período de referência"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="sf-compact-select bg-transparent pl-3 pr-2 py-1 rounded-full text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-white outline-none cursor-pointer h-8"
              >
                {periodOptions.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-white text-[#0F172A] dark:bg-[#11185A] dark:text-white"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setNotifOpen(false);
                  setFilterOpen((o) => !o);
                }}
                aria-expanded={filterOpen}
                aria-label="Filtros avançados e resumo por instituição"
                title="Filtros avançados, ações e contas"
                className={`w-8 h-8 rounded-full grid place-items-center transition-colors cursor-pointer shrink-0 ${
                  filterOpen
                    ? 'bg-[#059669] text-white'
                    : 'hover:bg-slate-200/70 dark:hover:bg-white/10 text-[#0F172A] dark:text-white'
                }`}
              >
                <Filter size={15} strokeWidth={1.75} />
              </button>
            </div>

            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              title="Ver status de sincronização e backup"
              aria-label="Status da sincronização com a nuvem"
              className="min-w-9 min-h-9 px-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            >
              {renderSyncIcon()}
            </button>

            <button
              type="button"
              onClick={onOpenNewTransaction}
              className="flex items-center gap-1.5 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-600 text-white px-3 lg:px-4 min-h-9 rounded-full text-xs sm:text-sm font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus size={16} strokeWidth={2} />
              <span className="hidden lg:inline">Novo lançamento</span>
              <span className="lg:hidden">Novo</span>
            </button>

            {onOpenShare && (
              <button
                type="button"
                onClick={onOpenShare}
                aria-label="Compartilhar ou abrir no celular"
                title="Compartilhar link e QR Code para celular"
                className="min-w-9 min-h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white transition-colors cursor-pointer"
              >
                <Share2 size={17} strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/* Always-visible compact icons (Mobile & PC) */}
          <button
            type="button"
            onClick={onToggleHideValues}
            aria-label={hideValues ? 'Mostrar valores monetários' : 'Ocultar valores monetários'}
            title={hideValues ? 'Valores ocultos (Clique para exibir)' : 'Ocultar valores (Modo privacidade)'}
            className={`min-w-9 min-h-9 grid place-items-center rounded-full transition-colors cursor-pointer ${
              hideValues
                ? 'bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-400/30'
                : 'hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white'
            }`}
          >
            {hideValues ? <EyeOff size={18} strokeWidth={1.75} /> : <Eye size={18} strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            className="min-w-9 min-h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun size={18} strokeWidth={1.75} className="text-[#F5B719]" />
            ) : (
              <Moon size={18} strokeWidth={1.75} />
            )}
          </button>

          <div className="relative shrink-0" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen(false);
                setNotifOpen((o) => !o);
              }}
              aria-label="Notificações de vencimentos"
              aria-expanded={notifOpen}
              className="min-w-9 min-h-9 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white transition-colors cursor-pointer relative shrink-0"
            >
              <Bell size={18} strokeWidth={1.75} />
              {alertBoletos.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#DC3545] ring-2 ring-white dark:ring-[#0B1252]" />
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#11185A] border border-[#E2E8F0] dark:border-white/15 rounded-2xl shadow-[0_12px_32px_rgba(15,23,42,0.18)] p-4 z-50">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F1F5F9] dark:border-white/10">
                  <span className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                    Alertas de vencimento ({alertBoletos.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    aria-label="Fechar notificações"
                    className="p-1 text-slate-400 hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
                  >
                    <X size={16} strokeWidth={1.75} />
                  </button>
                </div>

                {alertBoletos.length === 0 ? (
                  <p className="text-xs text-[#64748B] dark:text-slate-300 py-3">
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
                          className="w-full text-left p-2.5 rounded-xl bg-[#F8FAFC] dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-xs font-semibold text-[#0F172A] dark:text-white truncate">
                              {b.beneficiario}
                            </span>
                            <span className="font-money text-xs font-bold text-[#0F172A] dark:text-white shrink-0">
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

      {/* Row 2 (Mobile-Only): Clean Period Pill + Funnel Filter + Quick Cloud & Share */}
      <div className="flex md:hidden items-center justify-between gap-2 pb-2.5 pt-1.5 border-t border-[#F1F5F9] dark:border-white/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <select
            aria-label="Período de referência"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="sf-compact-select h-8 pl-3 pr-2 rounded-full border border-[#E2E8F0] dark:border-white/15 bg-[#F8FAFC] dark:bg-[#11185A] text-xs font-semibold text-[#0F172A] dark:text-white outline-none focus:border-[#059669] cursor-pointer max-w-[132px] truncate"
          >
            {periodOptions.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                className="bg-white text-[#0F172A] dark:bg-[#11185A] dark:text-white"
              >
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setFilterOpen((o) => !o);
            }}
            aria-expanded={filterOpen}
            aria-label="Filtros avançados e resumo por instituição"
            className={`w-8 h-8 rounded-full border grid place-items-center transition-colors cursor-pointer shrink-0 ${
              filterOpen
                ? 'bg-[#059669] border-[#059669] text-white'
                : 'bg-[#F8FAFC] dark:bg-[#11185A] border-[#E2E8F0] dark:border-white/15 text-[#0F172A] dark:text-white'
            }`}
          >
            <Filter size={14} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            title="Ver status de sincronização e backup"
            aria-label="Status da sincronização com a nuvem"
            className="w-8 h-8 px-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center gap-1 text-xs font-semibold cursor-pointer shrink-0"
          >
            {renderSyncIcon()}
          </button>

          {onOpenShare && (
            <button
              type="button"
              onClick={onOpenShare}
              aria-label="Compartilhar ou abrir no celular"
              title="Compartilhar link e QR Code para celular"
              className="w-8 h-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-[#0F172A] dark:text-white transition-colors cursor-pointer shrink-0"
            >
              <Share2 size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Row 3: Rounded Pill Segmented Scope Control (Consolidado | CPF | CNPJ) */}
      {showScopeBar && (
        <div className="pb-2.5 pt-0.5 flex items-center justify-between gap-2">
          <div
            className="bg-[#F1F5F9] dark:bg-[#050B42] p-1 rounded-full grid grid-cols-3 sm:inline-flex items-center gap-1 border border-[#E2E8F0] dark:border-white/10 w-full sm:w-auto"
            role="group"
            aria-label="Seletor de titularidade e visão"
          >
            <button
              type="button"
              aria-pressed={scope === 'CONSOLIDATED' && currentTab === 'dashboard'}
              onClick={() => handleSelectScope('CONSOLIDATED', 'dashboard')}
              className={`min-h-8 sm:min-h-9 px-2.5 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CONSOLIDATED' && currentTab === 'dashboard'
                  ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0] dark:border-white/15'
                  : 'text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-transparent'
              }`}
            >
              <ShieldCheck size={15} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981] shrink-0" />
              <span className="truncate">Consolidado</span>
            </button>

            <button
              type="button"
              aria-pressed={scope === 'CPF' && currentTab === 'cpf'}
              onClick={() => handleSelectScope('CPF', 'cpf')}
              className={`min-h-8 sm:min-h-9 px-2.5 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CPF' && currentTab === 'cpf'
                  ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0] dark:border-white/15'
                  : 'text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-transparent'
              }`}
            >
              <UserCheck size={15} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981] shrink-0" />
              <span>CPF</span>
            </button>

            <button
              type="button"
              aria-pressed={scope === 'CNPJ' && currentTab === 'cnpj'}
              onClick={() => handleSelectScope('CNPJ', 'cnpj')}
              className={`min-h-8 sm:min-h-9 px-2.5 sm:px-4 py-1 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scope === 'CNPJ' && currentTab === 'cnpj'
                  ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white shadow-[0_1px_3px_rgba(15,23,42,0.08)] border border-[#E2E8F0] dark:border-white/15'
                  : 'text-[#64748B] dark:text-slate-300 hover:text-[#0F172A] dark:hover:text-white border border-transparent'
              }`}
            >
              <Building size={15} strokeWidth={1.75} className="text-[#F5B719] shrink-0" />
              <span>CNPJ</span>
            </button>
          </div>
        </div>
      )}

      {/* Compact Funnel Filter & Institution Summary Popover */}
      {filterOpen && (
        <div className="relative">
          <div className="absolute left-0 md:left-auto md:right-0 mt-1 w-full sm:w-96 bg-white dark:bg-[#11185A] border border-[#E2E8F0] dark:border-white/15 rounded-2xl shadow-[0_14px_36px_rgba(15,23,42,0.22)] p-4 z-50 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#F1F5F9] dark:border-white/10">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981]" />
                <span className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                  Filtros e Ações Rápidas
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                aria-label="Fechar filtros"
                className="p-1 text-slate-400 hover:text-[#0F172A] dark:hover:text-white cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            {/* Scope preference */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#64748B] dark:text-slate-300">
                  Escopo ativo: <strong className="text-[#0F172A] dark:text-white">{scope}</strong>
                </span>
                <button
                  type="button"
                  onClick={toggleScopeBar}
                  className="text-xs font-semibold text-[#059669] dark:text-[#10B981] hover:underline cursor-pointer"
                >
                  {showScopeBar ? 'Ocultar pílula no topo' : 'Mostrar pílula no topo'}
                </button>
              </div>
            </div>

            {/* Quick Data Actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(false);
                  onNavigate('documents');
                }}
                className="min-h-10 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 text-xs font-semibold text-[#0F172A] dark:text-white hover:border-[#CBD5E1] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera size={15} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981]" />
                Scanner & Docs
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(false);
                  onNavigate('imports');
                }}
                className="min-h-10 px-3 py-2 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FolderOpen size={15} strokeWidth={1.75} />
                Importar Extrato
              </button>
            </div>

            {/* Institutions Summary */}
            <div className="space-y-2 pt-2 border-t border-[#F1F5F9] dark:border-white/10">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                  <Building2 size={14} strokeWidth={1.75} className="text-[#059669] dark:text-[#10B981]" />
                  Instituições ({scopedAccounts.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterOpen(false);
                    onNavigate('accounts');
                  }}
                  className="text-[11px] font-semibold text-[#059669] dark:text-[#10B981] flex items-center gap-0.5 hover:underline cursor-pointer"
                >
                  Gerenciar <ChevronRight size={13} strokeWidth={1.75} />
                </button>
              </div>

              {scopedAccounts.length === 0 ? (
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Nenhuma conta cadastrada neste escopo.
                </p>
              ) : (
                <div className="sf-grouped-card sf-grouped-divider max-h-44 overflow-y-auto">
                  {scopedAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="flex justify-between items-center px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-display font-bold text-[#0F172A] dark:text-white truncate">
                          {acc.institutionName}
                        </div>
                        <div className="text-[11px] text-[#64748B] dark:text-slate-300 truncate">
                          {acc.accountName}
                        </div>
                      </div>
                      <div className="font-money font-bold text-[#059669] dark:text-white shrink-0">
                        {formatarValor(acc.balance, hideValues)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
