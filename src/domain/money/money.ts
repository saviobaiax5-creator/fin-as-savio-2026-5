export type MoneyCents = number & {
  readonly __brand: 'MoneyCents';
};

export const ZERO_CENTS = 0 as MoneyCents;

export function cents(value: number): MoneyCents {
  if (!Number.isSafeInteger(value)) {
    throw new Error('Valor monetário inválido');
  }

  return value as MoneyCents;
}

export function toCents(value: number): MoneyCents {
  if (!Number.isFinite(value)) {
    throw new Error('Valor monetário inválido');
  }

  const result = Math.round(value * 100);

  if (!Number.isSafeInteger(result)) {
    throw new Error('Valor monetário fora do limite');
  }

  return result as MoneyCents;
}

export function fromCents(value: MoneyCents): number {
  return value / 100;
}

export function addMoney(a: MoneyCents, b: MoneyCents): MoneyCents {
  return cents(a + b);
}

export function subtractMoney(a: MoneyCents, b: MoneyCents): MoneyCents {
  return cents(a - b);
}

export function sumMoney(values: readonly MoneyCents[]): MoneyCents {
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return cents(total);
}

export function formatMoneyBRL(value: MoneyCents): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(fromCents(value));
}

export function formatMoneyNumberBRL(value: MoneyCents): string {
  return fromCents(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseMoneyInput(raw: string): MoneyCents {
  const value = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');

  if (!value) {
    throw new Error('Informe um valor');
  }

  let normalized: string;

  if (value.includes(',')) {
    normalized = value.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = value;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Formato monetário inválido');
  }

  const [integerPart, decimalPart = ''] = normalized.split('.');

  const result = Number(integerPart) * 100 + Number(decimalPart.padEnd(2, '0'));

  return cents(result);
}

export function parseSignedMoneyInput(raw: string): MoneyCents {
  const trimmed = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!trimmed) {
    throw new Error('Informe um valor');
  }

  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed;
  const absCents = parseMoneyInput(unsigned);
  return isNegative ? cents(-absCents) : absCents;
}

export function safeToCents(value: unknown, fallback: MoneyCents = ZERO_CENTS): MoneyCents {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return toCents(value);
}

export function getTransactionAmountCents(tx: {
  amountCents?: MoneyCents;
  amount: number;
}): MoneyCents {
  if (typeof tx.amountCents === 'number' && Number.isSafeInteger(tx.amountCents)) {
    return cents(tx.amountCents);
  }
  return safeToCents(tx.amount, ZERO_CENTS);
}
