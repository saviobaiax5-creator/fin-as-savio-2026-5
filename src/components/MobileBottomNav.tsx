import React, { useEffect, useState } from 'react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import {
  Home,
  ArrowLeftRight,
  Plus,
  Receipt,
  Menu,
  X,
  Wallet,
  CreditCard,
  Landmark,
  ChartNoAxesCombined,
  FileText,
  Brain,
  Settings,
  Package,
  CalendarDays,
  TrendingUp,
  Banknote,
  BellRing,
  ChevronRight,
  Building2,
} from 'lucide-react';

import { EntityScope } from '../types';

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  scope: EntityScope;
  onOpenNew: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  scope,
  onOpenNew,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);

  useLockBodyScroll(moreOpen);

  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  const moduleGroups = [
    {
      title: 'Finanças & Contas',
      items: [
        { id: 'salary', label: 'Salários e Rendas', icon: Banknote },
        { id: 'accounts', label: 'Contas bancárias', icon: Landmark },
        { id: 'cards', label: 'Cartões de crédito', icon: CreditCard },
        { id: 'cnpj', label: 'Empresa · CNPJ', icon: Building2 },
        { id: 'debts', label: 'Dívidas e compromissos', icon: Wallet },
      ],
    },
    {
      title: 'Patrimônio & Planejamento',
      items: [
        { id: 'planning', label: 'Planejamento 50/30/20', icon: CalendarDays },
        { id: 'investments', label: 'Investimentos · CDI', icon: TrendingUp },
        { id: 'assets', label: 'Patrimônio e ativos', icon: Package },
      ],
    },
    {
      title: 'Inteligência & Sistema',
      items: [
        { id: 'documents', label: 'Documentos e Scanner', icon: FileText },
        { id: 'imports', label: 'Extrações Financeiras', icon: Receipt },
        { id: 'notifications', label: 'Notificações · Banco', icon: BellRing },
        { id: 'ai', label: 'Inteligência Artificial', icon: Brain },
        { id: 'reports', label: 'Relatórios gerenciais', icon: ChartNoAxesCombined },
        { id: 'settings', label: 'Configurações', icon: Settings },
      ],
    },
  ];

  const navigate = (tab: string) => {
    setCurrentTab(tab);
    setMoreOpen(false);
  };

  const movimTarget = scope === 'CNPJ' ? 'cnpj' : 'cpf';

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#0B1252] border-t border-[#E2E8F0] dark:border-white/10 grid grid-cols-5 items-center px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(15,23,42,0.05)] select-none"
        aria-label="Navegação principal"
      >
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'dashboard'
              ? 'text-[#059669] dark:text-[#10B981] font-semibold'
              : 'text-[#64748B] dark:text-slate-300'
          }`}
        >
          <Home size={20} strokeWidth={1.75} />
          <span className="font-sans text-xs font-medium">Início</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(movimTarget)}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'cpf' || currentTab === 'cnpj'
              ? 'text-[#059669] dark:text-[#10B981] font-semibold'
              : 'text-[#64748B] dark:text-slate-300'
          }`}
          title={scope === 'CNPJ' ? 'Movimentações CNPJ' : 'Movimentações CPF'}
        >
          <ArrowLeftRight size={20} strokeWidth={1.75} />
          <span className="font-sans text-xs font-medium">Movim.</span>
        </button>

        <button
          type="button"
          onClick={onOpenNew}
          className="w-14 h-14 -mt-5 mx-auto rounded-full bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] text-white shadow-[0_4px_14px_rgba(6,30,62,0.22)] grid place-items-center active:scale-95 transition cursor-pointer ring-4 ring-white dark:ring-[#0B1252]"
          aria-label="Adicionar lançamento"
        >
          <Plus size={24} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={() => navigate('boletos')}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'boletos'
              ? 'text-[#059669] dark:text-[#10B981] font-semibold'
              : 'text-[#64748B] dark:text-slate-300'
          }`}
        >
          <Receipt size={20} strokeWidth={1.75} />
          <span className="font-sans text-xs font-medium">Boletos</span>
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            moreOpen
              ? 'text-[#059669] dark:text-[#10B981] font-semibold'
              : 'text-[#64748B] dark:text-slate-300'
          }`}
          aria-label="Abrir outros módulos"
          aria-expanded={moreOpen}
        >
          <Menu size={20} strokeWidth={1.75} />
          <span className="font-sans text-xs font-medium">Mais</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setMoreOpen(false)}
            aria-label="Fechar menu"
          />

          <section
            className="absolute bottom-0 inset-x-0 bg-[#F8FAFC] dark:bg-[#050B42] rounded-t-3xl p-5 pb-[calc(24px+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto overscroll-contain shadow-2xl border-t border-[#E2E8F0] dark:border-white/15"
            role="dialog"
            aria-modal="true"
            aria-label="Mais funcionalidades"
          >
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
                  Mais funcionalidades
                </h2>
                <p className="font-sans text-xs text-[#64748B] dark:text-slate-300">
                  Módulos e ferramentas do sistema
                </p>
              </div>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="min-w-10 min-h-10 grid place-items-center rounded-full text-[#64748B] dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Fechar"
              >
                <X size={20} strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-5">
              {moduleGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="font-sans text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-300 px-1 mb-2">
                    {group.title}
                  </h3>
                  <div className="sf-grouped-card sf-grouped-divider">
                    {group.items.map((module) => {
                      const Icon = module.icon;
                      const active = currentTab === module.id;
                      return (
                        <button
                          key={module.id}
                          type="button"
                          onClick={() => navigate(module.id)}
                          className={`w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-3 text-left transition-colors active:bg-slate-50 dark:active:bg-white/5 cursor-pointer ${
                            active ? 'bg-[#ECFDF5]/60 dark:bg-white/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="sf-icon-badge !w-9 !h-9">
                              <Icon size={18} strokeWidth={1.75} />
                            </span>
                            <span className="font-sans text-sm font-semibold text-[#0F172A] dark:text-white truncate">
                              {module.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {active && (
                              <span className="w-2 h-2 rounded-full bg-[#059669] dark:bg-[#10B981]" />
                            )}
                            <ChevronRight
                              size={16}
                              strokeWidth={1.75}
                              className="text-[#94A3B8] dark:text-slate-400"
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
