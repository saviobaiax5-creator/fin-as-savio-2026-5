/**
 * Validates Brazilian boleto linha digitável / barcode (44, 47, or 48 digits)
 * using FEBRABAN Mod 10 and Mod 11 check digits, and extracts amount & due date.
 */
export interface BoletoValidationResult {
  isValid: boolean;
  normalizedBarcode: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD
  error?: string;
}

export function calcMod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    let prod = parseInt(digits[i], 10) * weight;
    if (prod > 9) prod = Math.floor(prod / 10) + (prod % 10);
    sum += prod;
    weight = weight === 2 ? 1 : 2;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

export function calcMod11Bank(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  const dv = 11 - mod;
  if (dv === 0 || dv === 10 || dv === 11) return 1;
  return dv;
}

export function calcMod11Arrecadacao(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod = sum % 11;
  if (mod === 0 || mod === 1) return 0;
  if (mod === 10) return 1;
  return 11 - mod;
}

function factorToDate(factor: number): string | undefined {
  if (!factor || factor <= 0) return undefined;
  // FEBRABAN base date 1997-10-07 (post-Feb-2025 reset at 1000 -> 2025-02-22)
  const base = new Date(Date.UTC(1997, 9, 7));
  base.setUTCDate(base.getUTCDate() + factor);
  return base.toISOString().split('T')[0];
}

export function validateAndParseBoleto(input: string): BoletoValidationResult {
  const clean = input.replace(/\D/g, '');
  if (![44, 47, 48].includes(clean.length)) {
    return {
      isValid: false,
      normalizedBarcode: clean,
      amount: 0,
      error: 'Código inválido: informe 44, 47 ou 48 dígitos numéricos.',
    };
  }

  if (clean.length === 47) {
    // Bank title (título bancário) linha digitável
    const c1 = clean.slice(0, 9);
    const dv1 = parseInt(clean[9], 10);
    const c2 = clean.slice(10, 20);
    const dv2 = parseInt(clean[20], 10);
    const c3 = clean.slice(21, 31);
    const dv3 = parseInt(clean[31], 10);

    if (calcMod10(c1) !== dv1 || calcMod10(c2) !== dv2 || calcMod10(c3) !== dv3) {
      return {
        isValid: false,
        normalizedBarcode: clean,
        amount: 0,
        error: 'Dígitos verificadores (Módulo 10) dos campos da linha digitável não conferem.',
      };
    }

    // Reconstruct 44-digit barcode
    const barcode =
      clean.slice(0, 4) +
      clean[32] +
      clean.slice(33, 47) +
      clean.slice(4, 9) +
      clean.slice(10, 20) +
      clean.slice(21, 31);

    const dvGeral = parseInt(barcode[4], 10);
    const barcodeWithoutDv = barcode.slice(0, 4) + barcode.slice(5);
    if (calcMod11Bank(barcodeWithoutDv) !== dvGeral) {
      return {
        isValid: false,
        normalizedBarcode: barcode,
        amount: 0,
        error: 'Dígito verificador geral (Módulo 11) do boleto inválido.',
      };
    }

    const factor = parseInt(clean.slice(33, 37), 10);
    const amountCents = parseInt(clean.slice(37, 47), 10);
    return {
      isValid: true,
      normalizedBarcode: barcode,
      amount: amountCents / 100,
      dueDate: factorToDate(factor),
    };
  }

  if (clean.length === 44) {
    const isArrecadacao = clean.startsWith('8');
    if (isArrecadacao) {
      const idValor = clean[2];
      const dvGeral = parseInt(clean[3], 10);
      const withoutDv = clean.slice(0, 3) + clean.slice(4);
      const expected = idValor === '6' || idValor === '7' ? calcMod10(withoutDv) : calcMod11Arrecadacao(withoutDv);
      if (expected !== dvGeral) {
        return {
          isValid: false,
          normalizedBarcode: clean,
          amount: 0,
          error: 'Dígito verificador de arrecadação inválido.',
        };
      }
      const amountCents = parseInt(clean.slice(4, 15), 10);
      return {
        isValid: true,
        normalizedBarcode: clean,
        amount: amountCents / 100,
      };
    } else {
      const dvGeral = parseInt(clean[4], 10);
      const withoutDv = clean.slice(0, 4) + clean.slice(5);
      if (calcMod11Bank(withoutDv) !== dvGeral) {
        return {
          isValid: false,
          normalizedBarcode: clean,
          amount: 0,
          error: 'Dígito verificador geral (Módulo 11) inválido.',
        };
      }
      const factor = parseInt(clean.slice(5, 9), 10);
      const amountCents = parseInt(clean.slice(9, 19), 10);
      return {
        isValid: true,
        normalizedBarcode: clean,
        amount: amountCents / 100,
        dueDate: factorToDate(factor),
      };
    }
  }

  // 48 digits (arrecadação / concessionária / DAS)
  const idValor = clean[2];
  const useMod10 = idValor === '6' || idValor === '7';
  const blocks = [clean.slice(0, 11), clean.slice(12, 23), clean.slice(24, 35), clean.slice(36, 47)];
  const dvs = [clean[11], clean[23], clean[35], clean[47]].map((d) => parseInt(d, 10));

  for (let i = 0; i < 4; i++) {
    const expected = useMod10 ? calcMod10(blocks[i]) : calcMod11Arrecadacao(blocks[i]);
    if (expected !== dvs[i]) {
      return {
        isValid: false,
        normalizedBarcode: clean,
        amount: 0,
        error: `Dígito verificador do bloco ${i + 1} (convênio/tributo) inválido.`,
      };
    }
  }

  const barcode = blocks.join('');
  const amountCents = parseInt(barcode.slice(4, 15), 10);
  return {
    isValid: true,
    normalizedBarcode: barcode,
    amount: amountCents / 100,
  };
}
