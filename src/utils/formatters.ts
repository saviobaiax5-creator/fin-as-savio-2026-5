import { MoneyCents, fromCents } from '../domain/money/money';

export interface FormatCurrencyOptions {
  maskStyle?: 'dots' | 'blur';
  currency?: string;
}

function toNumericCurrencyValue(
  valor: number | string | MoneyCents | undefined | null
): number {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : 0;
  }
  if (typeof valor === 'string') {
    const clean = valor.replace(/[^\d,-]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (valor && typeof valor === 'object' && 'cents' in valor) {
    return fromCents(valor as MoneyCents);
  }
  return 0;
}

export function formatCurrency(
  valor: number | string | MoneyCents | undefined | null,
  isPrivacyMode = false,
  options?: FormatCurrencyOptions
): string {
  const maskStyle = options?.maskStyle ?? 'dots';
  const currency = options?.currency || 'BRL';

  if (isPrivacyMode && maskStyle === 'dots') {
    return currency === 'BRL' ? 'R$ •••••' : `${currency} •••••`;
  }

  const numericVal = toNumericCurrencyValue(valor);
  return numericVal.toLocaleString('pt-BR', {
    style: 'currency',
    currency,
  });
}

export function formatarValor(
  valor: number | string | MoneyCents | undefined | null,
  ocultar: boolean
): string {
  return formatCurrency(valor, ocultar, { maskStyle: 'dots', currency: 'BRL' });
}

export function formatarNumeroBRL(
  valor: number | undefined | null,
  ocultar: boolean
): string {
  if (ocultar) {
    return '•••••';
  }
  const num = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
