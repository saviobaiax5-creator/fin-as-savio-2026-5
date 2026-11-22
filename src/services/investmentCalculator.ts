import {
  CDIRate,
  InvestmentProductType,
  InvestmentResult,
  MonthlySimulationSummary,
  TaxBreakdown,
} from '../types/investment';
import {
  PRODUCT_TAX_EXEMPT,
  brDateToIso,
  formatShortLabelFromBrDate,
} from '../utils/investmentFormatters';
import { formatDateIsoLocal } from '../utils/dateUtils';

/**
 * Tabela regressiva oficial do IOF sobre rendimentos para resgates antes de 30 dias (Portaria MF / Decreto 6.306).
 * Índice 0 = 0 dias, índice 1..29 = percentual de 96% a 3%, >= 30 = 0%.
 */
const IOF_REGRESSIVE_TABLE: Record<number, number> = {
  1: 0.96,
  2: 0.93,
  3: 0.9,
  4: 0.86,
  5: 0.83,
  6: 0.8,
  7: 0.76,
  8: 0.73,
  9: 0.7,
  10: 0.66,
  11: 0.63,
  12: 0.6,
  13: 0.56,
  14: 0.53,
  15: 0.5,
  16: 0.46,
  17: 0.43,
  18: 0.4,
  19: 0.36,
  20: 0.33,
  21: 0.3,
  22: 0.26,
  23: 0.23,
  24: 0.2,
  25: 0.16,
  26: 0.13,
  27: 0.1,
  28: 0.06,
  29: 0.03,
};

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getIofRate(days: number): number {
  const safeDays = Math.max(0, Math.floor(days));
  if (safeDays === 0 || safeDays >= 30) return 0;
  return IOF_REGRESSIVE_TABLE[safeDays] ?? 0;
}

export function getIrRate(days: number): number {
  const safeDays = Math.max(0, Math.floor(days));
  if (safeDays <= 180) return 0.225;
  if (safeDays <= 360) return 0.2;
  if (safeDays <= 720) return 0.175;
  return 0.15;
}

/**
 * Converte a série textual do BCB (percentual diário, ex.: "0.055131") em fatores decimais (0.00055131).
 */
export function parseDailyCdiRates(rates: CDIRate[]): number[] {
  if (!Array.isArray(rates)) {
    throw new Error('Série de taxas CDI inválida.');
  }
  return rates.map((item, idx) => {
    if (!item || typeof item.valor !== 'string') {
      throw new Error(`Registro CDI inválido na posição ${idx}.`);
    }
    const pct = Number(item.valor);
    if (!Number.isFinite(pct) || pct < 0) {
      throw new Error(`Taxa diária CDI inválida na data ${item.data || idx}: ${item.valor}`);
    }
    return pct / 100;
  });
}

/**
 * Converte CDI anual efetivo (%) em taxa diária considerando 252 dias úteis ao ano.
 */
export function annualCdiToDailyRate(annualPercent: number): number {
  if (!Number.isFinite(annualPercent) || annualPercent < 0) {
    throw new Error('Taxa CDI anual inválida.');
  }
  return Math.pow(1 + annualPercent / 100, 1 / 252) - 1;
}

/**
 * Estima a taxa CDI anualizada (base 252 dias úteis) a partir de taxas diárias reais do BCB.
 */
export function computeEffectiveAnnualCdi(dailyRates: number[]): number {
  if (dailyRates.length === 0) return 0;
  const factor = dailyRates.reduce((acc, r) => acc * (1 + r), 1);
  const annualized = Math.pow(factor, 252 / dailyRates.length) - 1;
  return Math.round(annualized * 10000) / 100; // e.g., 14.90 (%)
}

/**
 * Capitalização composta diária sem aportes adicionais.
 * Para cada dia útil t: saldo_t = saldo_{t-1} * (1 + taxaDiaria_t * (cdiPercentage / 100)).
 */
export function calculateCompoundReturn(
  initialAmount: number,
  dailyRates: number[],
  cdiPercentage: number
): number {
  if (!Number.isFinite(initialAmount) || initialAmount < 0 || !Number.isFinite(cdiPercentage) || cdiPercentage < 0) {
    throw new Error('Parâmetros inválidos.');
  }

  return dailyRates.reduce((balance, rate) => {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Taxa diária inválida.');
    }
    const effectiveRate = rate * (cdiPercentage / 100);
    return balance * (1 + effectiveRate);
  }, initialAmount);
}

/**
 * Compara o CDI 100% com um CDB (% do CDI) para um mesmo capital inicial e mesma janela de taxas diárias.
 */
export function compareInvestments(
  initialAmount: number,
  dailyRates: number[],
  cdbPercentage: number
) {
  const cdi = calculateCompoundReturn(initialAmount, dailyRates, 100);
  const cdb = calculateCompoundReturn(initialAmount, dailyRates, cdbPercentage);

  return {
    cdi,
    cdb,
    difference: cdb - cdi,
    cdiProfit: cdi - initialAmount,
    cdbProfit: cdb - initialAmount,
  };
}

/**
 * Tributação estimada (IOF regressivo até 29 dias + IR regressivo sobre rendimento bruto após IOF).
 * LCI, LCA e Poupança mantêm isenção fiscal automática.
 */
export function calculateTaxation(
  grossProfit: number,
  days: number,
  productType: InvestmentProductType = 'CDB'
): TaxBreakdown {
  const safeProfit = Math.max(0, grossProfit);
  const safeDays = Math.max(0, Math.floor(days));
  const taxExempt = PRODUCT_TAX_EXEMPT[productType];

  if (taxExempt || safeProfit === 0) {
    return {
      days: safeDays,
      taxExempt,
      iofRate: 0,
      irRate: 0,
      iofAmount: 0,
      irAmount: 0,
      totalTax: 0,
      netProfit: roundMoney(safeProfit),
      note: taxExempt
        ? `${productType === 'POUPANCA' ? 'Poupança' : productType} isenta de IR/IOF para pessoa física conforme regra vigente.`
        : 'Sem rendimento tributável no período.',
    };
  }

  const iofRate = getIofRate(safeDays);
  const irRate = getIrRate(safeDays);

  const iofAmountRaw = safeProfit * iofRate;
  const irBase = Math.max(0, safeProfit - iofAmountRaw);
  const irAmountRaw = irBase * irRate;

  const iofAmount = roundMoney(iofAmountRaw);
  const irAmount = roundMoney(irAmountRaw);
  const totalTax = roundMoney(iofAmount + irAmount);
  const netProfit = roundMoney(safeProfit - totalTax);

  return {
    days: safeDays,
    taxExempt: false,
    iofRate,
    irRate,
    iofAmount,
    irAmount,
    totalTax,
    netProfit,
    note: `Estimativa com IR regressivo de ${(irRate * 100).toFixed(1).replace('.', ',')}%${
      iofRate > 0 ? ` e IOF de ${(iofRate * 100).toFixed(0)}% para ${safeDays} dia(s)` : ''
    }. Sujeito às condições do emissor e come-cotas quando aplicável.`,
  };
}

/**
 * Calcula evolução histórica usando taxas reais diárias do BCB com aportes mensais em datas reais.
 * Cada aporte só começa a render após a sua entrada (nunca soma aportes como rendimento).
 */
export function buildHistoricalComparisonWithContributions(params: {
  initialAmount: number;
  monthlyContribution: number;
  cdiPercentage: number;
  rates: CDIRate[];
  productType?: InvestmentProductType;
}): MonthlySimulationSummary {
  const {
    initialAmount,
    monthlyContribution,
    cdiPercentage,
    rates,
    productType = 'CDB',
  } = params;

  if (
    !Number.isFinite(initialAmount) ||
    initialAmount < 0 ||
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0 ||
    !Number.isFinite(cdiPercentage) ||
    cdiPercentage < 0
  ) {
    throw new Error('Parâmetros financeiros inválidos para simulação.');
  }

  const dailyRates = parseDailyCdiRates(rates);
  if (rates.length === 0) {
    const emptyTax = calculateTaxation(0, 0, productType);
    return {
      initialAmount: roundMoney(initialAmount),
      totalContributions: 0,
      investedValue: roundMoney(initialAmount),
      grossValue: roundMoney(initialAmount),
      grossProfit: 0,
      cdi100GrossValue: roundMoney(initialAmount),
      cdi100GrossProfit: 0,
      differenceVsCdiGross: 0,
      cumulativeYieldPct: 0,
      tax: emptyTax,
      netValue: roundMoney(initialAmount),
      netProfit: 0,
      timeline: [],
    };
  }

  let cdiBalance = initialAmount;
  let cdbBalance = initialAmount;
  let invested = initialAmount;
  let totalContributions = 0;

  let prevMonthKey = brDateToIso(rates[0].data).slice(0, 7);
  const firstDate = new Date(`${brDateToIso(rates[0].data)}T00:00:00`);
  const lastDate = new Date(`${brDateToIso(rates[rates.length - 1].data)}T00:00:00`);
  const calendarDays = Math.max(
    1,
    Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  const timeline: InvestmentResult[] = [];

  for (let i = 0; i < rates.length; i++) {
    const rateItem = rates[i];
    const isoDate = brDateToIso(rateItem.data);
    const monthKey = isoDate.slice(0, 7);
    const dailyRate = dailyRates[i];

    // Rentabiliza o saldo anterior antes de somar eventual novo aporte na virada do mês
    cdiBalance = cdiBalance * (1 + dailyRate);
    cdbBalance = cdbBalance * (1 + dailyRate * (cdiPercentage / 100));

    if (monthlyContribution > 0 && i > 0 && monthKey !== prevMonthKey) {
      cdiBalance += monthlyContribution;
      cdbBalance += monthlyContribution;
      invested += monthlyContribution;
      totalContributions += monthlyContribution;
    }
    prevMonthKey = monthKey;

    const currentDate = new Date(`${isoDate}T00:00:00`);
    const elapsedDays = Math.max(
      1,
      Math.round((currentDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    const pointGrossProfit = Math.max(0, cdbBalance - invested);
    const pointTax = calculateTaxation(pointGrossProfit, elapsedDays, productType);

    timeline.push({
      date: isoDate,
      label: formatShortLabelFromBrDate(rateItem.data),
      investedAmount: roundMoney(invested),
      cdiValue: roundMoney(cdiBalance),
      cdbValue: roundMoney(cdbBalance),
      grossProfit: roundMoney(pointGrossProfit),
      netValue: roundMoney(invested + pointTax.netProfit),
      netProfit: pointTax.netProfit,
      taxAmount: pointTax.totalTax,
    });
  }

  const grossValue = roundMoney(cdbBalance);
  const investedValue = roundMoney(invested);
  const grossProfit = roundMoney(grossValue - investedValue);
  const cdi100GrossValue = roundMoney(cdiBalance);
  const cdi100GrossProfit = roundMoney(cdi100GrossValue - investedValue);
  const tax = calculateTaxation(grossProfit, calendarDays, productType);

  return {
    initialAmount: roundMoney(initialAmount),
    totalContributions: roundMoney(totalContributions),
    investedValue,
    grossValue,
    grossProfit,
    cdi100GrossValue,
    cdi100GrossProfit,
    differenceVsCdiGross: roundMoney(grossValue - cdi100GrossValue),
    cumulativeYieldPct: investedValue > 0 ? roundMoney((grossProfit / investedValue) * 100) : 0,
    tax,
    netValue: roundMoney(investedValue + tax.netProfit),
    netProfit: tax.netProfit,
    timeline,
  };
}

/**
 * Simulador financeiro para horizonte em meses utilizando capitalização diária (21 dias úteis/mês)
 * baseada em uma taxa CDI anual real de referência (ou taxa informada pelo usuário).
 * Aportes mensais entram ao fim de cada mês e só rendem nos meses subsequentes.
 */
export function simulateProjectedInvestment(params: {
  initialAmount: number;
  monthlyContribution: number;
  cdiPercentage: number;
  annualCdiPercent: number;
  months: number;
  productType?: InvestmentProductType;
  startDateIso?: string;
}): MonthlySimulationSummary {
  const {
    initialAmount,
    monthlyContribution,
    cdiPercentage,
    annualCdiPercent,
    months,
    productType = 'CDB',
    startDateIso,
  } = params;

  if (
    !Number.isFinite(initialAmount) ||
    initialAmount < 0 ||
    !Number.isFinite(monthlyContribution) ||
    monthlyContribution < 0 ||
    !Number.isFinite(cdiPercentage) ||
    cdiPercentage < 0 ||
    !Number.isFinite(annualCdiPercent) ||
    annualCdiPercent < 0 ||
    !Number.isFinite(months) ||
    months < 1 ||
    months > 600
  ) {
    throw new Error('Parâmetros inválidos na simulação.');
  }

  const baseDailyRate = annualCdiToDailyRate(annualCdiPercent);
  const businessDaysPerMonth = 21;
  const startBase = startDateIso ? new Date(`${startDateIso}T00:00:00`) : new Date();
  const baseDate = Number.isNaN(startBase.getTime()) ? new Date() : startBase;

  let cdiBalance = initialAmount;
  let cdbBalance = initialAmount;
  let invested = initialAmount;
  let totalContributions = 0;

  const timeline: InvestmentResult[] = [
    {
      date: formatDateIsoLocal(baseDate),
      label: 'Mês 0',
      investedAmount: roundMoney(invested),
      cdiValue: roundMoney(cdiBalance),
      cdbValue: roundMoney(cdbBalance),
      grossProfit: 0,
      netValue: roundMoney(invested),
      netProfit: 0,
      taxAmount: 0,
    },
  ];

  const cdiMonthFactor = Math.pow(1 + baseDailyRate, businessDaysPerMonth);
  const cdbMonthFactor = Math.pow(
    1 + baseDailyRate * (cdiPercentage / 100),
    businessDaysPerMonth
  );

  for (let month = 1; month <= Math.round(months); month++) {
    // Primeiro aplica rendimento composto sobre o saldo acumulado até o mês anterior
    cdiBalance = cdiBalance * cdiMonthFactor;
    cdbBalance = cdbBalance * cdbMonthFactor;

    // Aporte do mês entra ao final deste ciclo e renderá a partir do mês seguinte
    if (monthlyContribution > 0) {
      cdiBalance += monthlyContribution;
      cdbBalance += monthlyContribution;
      invested += monthlyContribution;
      totalContributions += monthlyContribution;
    }

    const elapsedCalendarDays = Math.round(month * 30.4167);
    const grossProfitPoint = Math.max(0, cdbBalance - invested);
    const pointTax = calculateTaxation(grossProfitPoint, elapsedCalendarDays, productType);

    const stepDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + month, baseDate.getDate());
    timeline.push({
      date: formatDateIsoLocal(stepDate),
      label: `Mês ${month}`,
      investedAmount: roundMoney(invested),
      cdiValue: roundMoney(cdiBalance),
      cdbValue: roundMoney(cdbBalance),
      grossProfit: roundMoney(grossProfitPoint),
      netValue: roundMoney(invested + pointTax.netProfit),
      netProfit: pointTax.netProfit,
      taxAmount: pointTax.totalTax,
    });
  }

  const totalCalendarDays = Math.round(Math.round(months) * 30.4167);
  const grossValue = roundMoney(cdbBalance);
  const investedValue = roundMoney(invested);
  const grossProfit = roundMoney(grossValue - investedValue);
  const cdi100GrossValue = roundMoney(cdiBalance);
  const cdi100GrossProfit = roundMoney(cdi100GrossValue - investedValue);
  const tax = calculateTaxation(grossProfit, totalCalendarDays, productType);

  return {
    initialAmount: roundMoney(initialAmount),
    totalContributions: roundMoney(totalContributions),
    investedValue,
    grossValue,
    grossProfit,
    cdi100GrossValue,
    cdi100GrossProfit,
    differenceVsCdiGross: roundMoney(grossValue - cdi100GrossValue),
    cumulativeYieldPct: investedValue > 0 ? roundMoney((grossProfit / investedValue) * 100) : 0,
    tax,
    netValue: roundMoney(investedValue + tax.netProfit),
    netProfit: tax.netProfit,
    timeline,
  };
}
