import React from 'react';
import SavioFinancasLogo from './SavioFinancasLogo';
import {
  LayoutDashboard,
  User,
  Building2,
  Wallet,
  CreditCard,
  FileText,
  Receipt,
  PieChart,
  TrendingUp,
  ArrowUpRight,
  FileSearch,
  Bot,
  Settings,
  FolderOpen,
  LineChart,
  Banknote,
  BellRing,
  LogOut,
} from 'lucide-react';
import type { AuthUserSummary } from '../services/authService';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  pendingBankNotificationsCount?: number;
  currentUser?: AuthUserSummary | null;
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  pendingBankNotificationsCount = 0,
  currentUser,
  onSignOut,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Visão executiva', icon: LayoutDashboard, section: 'GESTÃO' },
    { id: 'cpf', label: 'Pessoal · CPF', icon: User, section: 'FINANÇAS' },
    { id: 'cnpj', label: 'Empresa · CNPJ', icon: Building2, section: 'FINANÇAS' },
    { id: 'salary', label: 'Salários e Rendas', icon: Banknote, section: 'FINANÇAS' },
    { id: 'accounts', label: 'Contas bancárias', icon: Wallet, section: 'FINANÇAS' },
    { id: 'cards', label: 'Cartões de crédito', icon: CreditCard, section: 'FINANÇAS' },
    { id: 'boletos', label: 'Boletos e contas', icon: Receipt, section: 'FINANÇAS' },
    { id: 'debts', label: 'Dívidas e compromissos', icon: ArrowUpRight, section: 'FINANÇAS' },
    { id: 'planning', label: 'Planejamento 50/30/20', icon: PieChart, section: 'FINANÇAS' },
    { id: 'investments', label: 'Investimentos · CDI', icon: LineChart, section: 'FINANÇAS' },
    { id: 'assets', label: 'Patrimônio e ativos', icon: TrendingUp, section: 'FINANÇAS' },
    { id: 'documents', label: 'Leitor & Scanner IA', icon: FileSearch, section: 'INTELIGÊNCIA' },
    { id: 'imports', label: 'Extrações Financeiras', icon: FolderOpen, section: 'INTELIGÊNCIA' },
    { id: 'notifications', label: 'Notificações · Banco', icon: BellRing, section: 'INTELIGÊNCIA' },
    { id: 'ai', label: 'IA Financeira', icon: Bot, section: 'INTELIGÊNCIA' },
    { id: 'reports', label: 'Relatórios gerenciais', icon: FileText, section: 'INTELIGÊNCIA' },
    { id: 'settings', label: 'Configurações', icon: Settings, section: 'SISTEMA' },
  ];

  let lastSection = '';

  return (
    <aside className="w-64 bg-[#061B3B] dark:bg-slate-950 text-white p-5 flex flex-col flex-shrink-0 select-none shadow-xl border-r border-[#082B5C]/50">
      <div className="px-1 py-1 mb-2">
        <SavioFinancasLogo size={40} subtitle />
      </div>

      <div className="my-3 px-3 py-3 bg-[#082B5C] dark:bg-slate-900 rounded-xl flex items-center gap-3 border border-[#0b3877] dark:border-slate-800">
        <div className="w-9 h-9 rounded-full bg-[#00A65A]/20 text-[#00A65A] grid place-items-center font-bold text-sm shrink-0 border border-[#00A65A]/30">
          {(currentUser?.displayName || 'SF').slice(0, 2).toUpperCase()}
        </div>
        <div className="overflow-hidden flex-1 min-w-0">
          <p className="text-xs font-bold text-white truncate">
            {currentUser?.displayName || 'Titular CPF & CNPJ'}
          </p>
          <small className="block text-[11px] text-[#b0c4de] truncate">
            {currentUser?.email || 'Gestão consolidada'}
          </small>
        </div>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            title="Sair da conta"
            aria-label="Sair da conta"
            className="p-1.5 rounded-lg text-[#b0c4de] hover:text-white hover:bg-[#061B3B] cursor-pointer shrink-0"
          >
            <LogOut size={14} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {menuItems.map((item) => {
          const showSectionHeader = item.section !== lastSection;
          lastSection = item.section;
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <React.Fragment key={item.id}>
              {showSectionHeader && (
                <div className="text-[10px] text-[#8fa8c6] tracking-widest px-3 pt-4 pb-1 font-semibold uppercase">
                  {item.section}
                </div>
              )}
              <button
                type="button"
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#00A65A] text-white shadow-md shadow-[#00A65A]/30 font-semibold'
                    : 'text-[#d5e2f0] hover:bg-[#082B5C] dark:hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#a0b8d4]'}`} />
                <span className="truncate flex-1 text-left">{item.label}</span>
                {item.id === 'notifications' && pendingBankNotificationsCount > 0 && (
                  <span className="text-[11px] font-bold tabular-nums text-[#F5B719]">
                    {pendingBankNotificationsCount}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="mt-4 pt-3 border-t border-[#082B5C] dark:border-slate-800 text-[11px] text-[#8fa8c6] flex items-center justify-between">
        <span className="font-medium">Sávio Finanças Pro</span>
        <span className="inline-block w-2 h-2 rounded-full bg-[#00A65A] ring-2 ring-[#00A65A]/30" />
      </div>
    </aside>
  );
};
