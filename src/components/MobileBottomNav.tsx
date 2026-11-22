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

  const modules = [
    { id: 'salary', label: 'Salários e Rendas', icon: Banknote },
    { id: 'accounts', label: 'Contas bancárias', icon: Landmark },
    { id: 'cards', label: 'Cartões de crédito', icon: CreditCard },
    { id: 'cnpj', label: 'Empresa · CNPJ', icon: Package },
    { id: 'debts', label: 'Dívidas', icon: Wallet },
    { id: 'planning', label: 'Planejamento', icon: CalendarDays },
    { id: 'investments', label: 'Investimentos · CDI', icon: TrendingUp },
    { id: 'assets', label: 'Patrimônio', icon: Package },
    { id: 'documents', label: 'Documentos e Scanner', icon: FileText },
    { id: 'imports', label: 'Extratos e Open Finance', icon: Receipt },
    { id: 'notifications', label: 'Notificações · Banco', icon: BellRing },
    { id: 'ai', label: 'Inteligência Artificial', icon: Brain },
    { id: 'reports', label: 'Relatórios', icon: ChartNoAxesCombined },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  const navigate = (tab: string) => {
    setCurrentTab(tab);
    setMoreOpen(false);
  };

  const movimTarget = scope === 'CNPJ' ? 'cnpj' : 'cpf';

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(0,0,0,0.06)] select-none"
        aria-label="Navegação principal"
      >
        <button
          type="button"
          onClick={() => navigate('dashboard')}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'dashboard'
              ? 'text-[#082B5C] dark:text-[#00A65A] font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home size={22} />
          <span className="text-xs font-medium">Início</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(movimTarget)}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'cpf' || currentTab === 'cnpj'
              ? 'text-[#082B5C] dark:text-[#00A65A] font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
          title={scope === 'CNPJ' ? 'Movimentações CNPJ' : 'Movimentações CPF'}
        >
          <ArrowLeftRight size={22} />
          <span className="text-xs font-medium">Movim.</span>
        </button>

        <button
          type="button"
          onClick={onOpenNew}
          className="w-14 h-14 -mt-5 mx-auto rounded-full bg-[#082B5C] hover:bg-[#061B3B] dark:bg-[#00A65A] text-white shadow-lg grid place-items-center active:scale-95 transition cursor-pointer ring-4 ring-white dark:ring-slate-900"
          aria-label="Adicionar lançamento"
        >
          <Plus size={27} />
        </button>

        <button
          type="button"
          onClick={() => navigate('boletos')}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            currentTab === 'boletos'
              ? 'text-[#082B5C] dark:text-[#00A65A] font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Receipt size={22} />
          <span className="text-xs font-medium">Boletos</span>
        </button>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`min-h-12 flex flex-col items-center justify-center gap-1 cursor-pointer ${
            moreOpen
              ? 'text-[#082B5C] dark:text-[#00A65A] font-bold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
          aria-label="Abrir outros módulos"
          aria-expanded={moreOpen}
        >
          <Menu size={22} />
          <span className="text-xs font-medium">Mais</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            onClick={() => setMoreOpen(false)}
            aria-label="Fechar menu"
          />

          <section
            className="absolute bottom-0 inset-x-0 bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-[calc(24px+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto overscroll-contain shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Mais funcionalidades"
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-[#082B5C] dark:text-white">
                Mais funcionalidades
              </h2>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="min-w-11 min-h-11 grid place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {modules.map((module) => {
                const Icon = module.icon;
                const active = currentTab === module.id;
                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => navigate(module.id)}
                    className={`min-h-16 p-3 border rounded-xl flex items-center gap-3 text-left transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'border-[#00A65A] bg-[#00A65A]/10 text-[#082B5C] dark:text-[#00A65A] font-semibold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[#061B3B] dark:text-slate-100'
                    }`}
                  >
                    <Icon size={22} className="text-[#00A65A] shrink-0" />
                    <span className="text-sm font-medium leading-tight">{module.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
};
