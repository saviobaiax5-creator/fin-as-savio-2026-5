import React from 'react';
import {
  Landmark,
  Smartphone,
  Wallet,
  TrendingUp,
  Globe2,
  Coins,
  CreditCard,
  Building2,
} from 'lucide-react';
import {
  INSTITUTION_CATEGORY_LABELS,
  type InstitutionCategory,
} from '../../types/extractions';

interface Props {
  category: InstitutionCategory;
  compact?: boolean;
}

const STYLE_BY_CATEGORY: Record<
  InstitutionCategory,
  { icon: React.ComponentType<{ size?: number; className?: string }>; classes: string }
> = {
  BANCO_FISICO: {
    icon: Landmark,
    classes: 'bg-[#0F172A]/8 text-[#0F172A] dark:bg-blue-950/70 dark:text-blue-200 border-[#0F172A]/20 dark:border-blue-800',
  },
  BANCO_DIGITAL: {
    icon: Smartphone,
    classes: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  CARTEIRA_DIGITAL: {
    icon: Wallet,
    classes: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  CORRETORA_NACIONAL: {
    icon: TrendingUp,
    classes: 'bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  },
  CORRETORA_INTERNACIONAL: {
    icon: Globe2,
    classes: 'bg-sky-50 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  EXCHANGE: {
    icon: Coins,
    classes: 'bg-amber-50 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  CARTAO_CREDITO: {
    icon: CreditCard,
    classes: 'bg-purple-50 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  OUTRA: {
    icon: Building2,
    classes: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
};

export const InstitutionCategoryBadge: React.FC<Props> = ({ category, compact = false }) => {
  const cfg = STYLE_BY_CATEGORY[category] || STYLE_BY_CATEGORY.OUTRA;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-md font-bold tracking-wide uppercase shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[10px]'
      } ${cfg.classes}`}
    >
      <Icon size={11} className="shrink-0" />
      <span>{INSTITUTION_CATEGORY_LABELS[category]}</span>
    </span>
  );
};
