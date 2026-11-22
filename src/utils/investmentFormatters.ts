import { InvestmentProductType } from '../types/investment';

export const PRODUCT_TYPE_LABELS: Record<InvestmentProductType, string> = {
  CDB: 'CDB (Certificado de Depósito Bancário)',
  LCI: 'LCI (Isenta de IR/IOF)',
  LCA: 'LCA (Isenta de IR/IOF)',
  POUPANCA: 'Poupança (Isenta de IR)',
  TESOURO_SELIC: 'Tesouro Selic / Pós-fixado',
};

export const PRODUCT_TAX_EXEMPT: Record<InvestmentProductType, boolean> = {
  CDB: false,
  LCI: true,
  LCA: true,
  POUPANCA: true,
  TESOURO_SELIC: false,
};

export function formatBRL(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercentBR(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function brDateToIso(brDate: string): string {
  const match = brDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return brDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function isoToBrDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatShortLabelFromBrDate(brDate: string): string {
  const match = brDate.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return brDate;
  return `${match[1]}/${match[2]}/${match[3].slice(-2)}`;
}

export function formatIsoDateTimePtBr(isoTimestamp?: string): string {
  if (!isoTimestamp) return 'Sem registro';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return isoTimestamp;
  return dt.toLocaleString('pt-BR');
}

export function countCalendarDays(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00`);
  const e = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
