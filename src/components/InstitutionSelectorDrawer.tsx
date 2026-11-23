import React, { useMemo, useState } from 'react';
import {
  ALL_INSTITUTION_CATALOG,
  type BankVisualCatalogItem,
  type InstitutionSelectorGroup,
  normalizeBankText,
} from '../domain/extractions/banksRepository';
import { InstitutionAvatar } from './InstitutionAvatar';
import { Check, ChevronDown, ChevronUp, Landmark, Search, X } from 'lucide-react';

interface InstitutionSelectorDrawerProps {
  selectedName?: string;
  selectedId?: string;
  onSelect: (institution: BankVisualCatalogItem) => void;
  defaultOpen?: boolean;
  title?: string;
}

type GroupFilter = 'Todos' | InstitutionSelectorGroup;

export const InstitutionSelectorDrawer: React.FC<InstitutionSelectorDrawerProps> = ({
  selectedName = '',
  selectedId,
  onSelect,
  defaultOpen = true,
  title = 'Selecionar Instituição',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('Todos');

  const counts = useMemo(() => {
    const digital = ALL_INSTITUTION_CATALOG.filter((i) => i.grupo === 'Digital').length;
    const coop = ALL_INSTITUTION_CATALOG.filter((i) => i.grupo === 'Cooperativa').length;
    const fisico = ALL_INSTITUTION_CATALOG.filter((i) => i.grupo === 'Fisico').length;
    return {
      total: ALL_INSTITUTION_CATALOG.length,
      digital,
      coop,
      fisico,
    };
  }, []);

  const normalizedSelectedName = normalizeBankText(selectedName);

  const filteredItems = useMemo(() => {
    const normQuery = normalizeBankText(searchTerm);
    return ALL_INSTITUTION_CATALOG.filter((item) => {
      const matchesGroup = activeGroup === 'Todos' || item.grupo === activeGroup;
      if (!matchesGroup) return false;
      if (!normQuery) return true;
      const inName = normalizeBankText(item.nome).includes(normQuery);
      const inCode = item.codigo.includes(normQuery.replace(/\D/g, '') || '__none__') && /\d/.test(normQuery);
      const inType = normalizeBankText(item.tipo).includes(normQuery);
      const inAliases = (item.aliases || []).some((a) => normalizeBankText(a).includes(normQuery));
      return inName || inCode || inType || inAliases;
    });
  }, [activeGroup, searchTerm]);

  const filterButtons: Array<{ key: GroupFilter; label: string }> = [
    { key: 'Todos', label: `Todos (${counts.total})` },
    { key: 'Digital', label: `Bancos & Carteiras (${counts.digital})` },
    { key: 'Cooperativa', label: `Cooperativas (${counts.coop})` },
    { key: 'Fisico', label: `Bancos Físicos (${counts.fisico})` },
  ];

  return (
    <div className="rounded-xl border border-[#E2E8F0] dark:border-white/15 bg-white dark:bg-[#0D134D] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="w-full min-h-12 px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-[10px] bg-[#ECFDF5] dark:bg-emerald-950/60 text-[#059669] dark:text-[#10B981] inline-flex items-center justify-center shrink-0">
            <Landmark size={16} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white truncate">
              {title}
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
              {counts.total} bancos, carteiras e cooperativas offline
            </div>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] dark:text-slate-300 shrink-0">
          <span className="hidden sm:inline">{isOpen ? 'Recolher' : 'Expandir'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {isOpen && (
        <div className="p-3 pt-2.5 border-t border-slate-100 dark:border-white/10 space-y-2.5 bg-[#F8FAFC]/70 dark:bg-[#090E3F]/60">
          {/* Search Input */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou código (ex: 99Pay, 748...)"
              aria-label="Buscar instituição por nome ou código"
              className="w-full min-h-10 pl-9 pr-9 py-2 rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-[#11185A] text-xs sm:text-sm text-[#0F172A] dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#059669]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca de instituição"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {filterButtons.map((btn) => {
              const active = activeGroup === btn.key;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setActiveGroup(btn.key)}
                  className={`min-h-8 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                    active
                      ? 'bg-[#061E3E] text-white border-[#061E3E] dark:bg-[#059669] dark:border-[#059669]'
                      : 'bg-white dark:bg-[#11185A] text-[#475569] dark:text-slate-300 border-slate-200 dark:border-white/15 hover:border-slate-300'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* 2-Column Mobile Grid (no horizontal overflow) */}
          {filteredItems.length === 0 ? (
            <div className="py-5 px-3 text-center text-xs text-[#64748B] dark:text-slate-400 bg-white dark:bg-[#11185A] rounded-xl border border-dashed border-slate-200 dark:border-white/15">
              Nenhuma instituição encontrada para &quot;{searchTerm}&quot;. Você pode digitar o nome manualmente no campo abaixo.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-0.5">
              {filteredItems.map((inst) => {
                const isSelected =
                  (selectedId && selectedId === inst.id) ||
                  (normalizedSelectedName.length > 0 &&
                    normalizedSelectedName === normalizeBankText(inst.nome));

                return (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => onSelect(inst)}
                    className={`min-h-[54px] flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'border-[#061E3E] bg-white ring-1 ring-[#061E3E] dark:border-[#10B981] dark:bg-emerald-950/40 dark:ring-[#10B981]'
                        : 'border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-[#11185A] hover:border-[#CBD5E1] dark:hover:border-white/25'
                    }`}
                  >
                    <InstitutionAvatar
                      name={inst.nome}
                      sigla={inst.sigla}
                      cor={inst.cor}
                      texto={inst.texto}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate flex items-center gap-1">
                        <span className="truncate">{inst.nome}</span>
                        {isSelected && (
                          <Check size={12} className="text-[#059669] dark:text-[#10B981] shrink-0" />
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-[#64748B] dark:text-slate-400 truncate">
                        {inst.codigo === '000' ? 'Conta Global' : `Cód. ${inst.codigo}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
