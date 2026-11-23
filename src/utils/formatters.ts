import { MoneyCents, fromCents } from '../domain/money/money';

export function formatarValor(
  valor: number | string | MoneyCents | undefined | null,
  ocultar: boolean
): string {
  if (ocultar) {
    return 'R$ •••••';
  }
  let numericVal = 0;
  if (typeof valor === 'number') {
    numericVal = Number.isFinite(valor) ? valor : 0;
  } else if (typeof valor === 'string') {
    const clean = valor.replace(/[^\d,-]/g, '').replace(',', '.');
    const parsed = parseFloat(clean);
    numericVal = Number.isFinite(parsed) ? parsed : 0;
  } else if (valor && typeof valor === 'object' && 'cents' in valor) {
    numericVal = fromCents(valor as MoneyCents);
  }

  return numericVal.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
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
