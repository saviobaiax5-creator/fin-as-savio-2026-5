import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  annualCdiToDailyRate,
  buildHistoricalComparisonWithContributions,
  calculateCompoundReturn,
  calculateTaxation,
  compareInvestments,
  computeEffectiveAnnualCdi,
  getIofRate,
  getIrRate,
  parseDailyCdiRates,
  simulateProjectedInvestment,
} from '../../services/investmentCalculator';
import { fetchCDIHistory, fetchCdiWithCache, validateCdiArray } from '../../services/cdiService';
import {
  normalizeBcbDateParam,
  validateBcbSeries,
} from '../../../server/routes/investmentRoutes';
import {
  brDateToIso,
  countCalendarDays,
  isoToBrDate,
} from '../investmentFormatters';
import { CDIRate } from '../../types/investment';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Conversão e validação da série CDI (BCB SGS 12)', () => {
  it('converte corretamente taxas diárias textuais em decimais', () => {
    const rates: CDIRate[] = [
      { data: '02/01/2026', valor: '0.055131' },
      { data: '05/01/2026', valor: '0.055131' },
    ];
    const daily = parseDailyCdiRates(rates);
    expect(daily[0]).toBeCloseTo(0.00055131, 8);
    expect(daily[1]).toBeCloseTo(0.00055131, 8);
  });

  it('calcula CDI anualizado a partir de 252 dias úteis e converte anual em diária', () => {
    const dailyFromAnnual = annualCdiToDailyRate(14.9);
    const annualizedBack = computeEffectiveAnnualCdi(Array(252).fill(dailyFromAnnual));
    expect(annualizedBack).toBeCloseTo(14.9, 1);
  });

  it('rejeita registros CDI inválidos ou taxas negativas', () => {
    expect(() => parseDailyCdiRates([{ data: '01/01/2026', valor: 'abc' }])).toThrow();
    expect(() => parseDailyCdiRates([{ data: '01/01/2026', valor: '-0.02' }])).toThrow();
    expect(() => validateCdiArray({ erro: 'não é array' })).toThrow();
    expect(() => validateBcbSeries([{ data: 123, valor: '0.05' }])).toThrow();
  });
});

describe('Capitalização composta e comparador CDI × CDB', () => {
  const sampleDailyRates = Array(252).fill(0.0005); // ~0,05% ao dia útil

  it('calcula capitalização composta para CDI 100%, CDB 110%, 115% e 120%', () => {
    const initial = 10000;
    const cdi100 = calculateCompoundReturn(initial, sampleDailyRates, 100);
    const cdb110 = calculateCompoundReturn(initial, sampleDailyRates, 110);
    const cdb115 = calculateCompoundReturn(initial, sampleDailyRates, 115);
    const cdb120 = calculateCompoundReturn(initial, sampleDailyRates, 120);

    expect(cdi100).toBeCloseTo(initial * Math.pow(1.0005, 252), 4);
    expect(cdb110).toBeCloseTo(initial * Math.pow(1 + 0.0005 * 1.1, 252), 4);
    expect(cdb115).toBeCloseTo(initial * Math.pow(1 + 0.0005 * 1.15, 252), 4);
    expect(cdb120).toBeCloseTo(initial * Math.pow(1 + 0.0005 * 1.2, 252), 4);

    // Critério obrigatório: CDB 115% CDI > CDI 100% com taxas positivas
    expect(cdb115).toBeGreaterThan(cdi100);
    expect(cdb120).toBeGreaterThan(cdb115);
    expect(cdb115).toBeGreaterThan(cdb110);
  });

  it('compara CDI 100% × CDB 115% retornando diferença e rendimentos brutos corretos', () => {
    const res = compareInvestments(5000, sampleDailyRates, 115);
    expect(res.cdb).toBeGreaterThan(res.cdi);
    expect(res.difference).toBeCloseTo(res.cdb - res.cdi, 6);
    expect(res.cdbProfit).toBeGreaterThan(res.cdiProfit);
  });

  it('rejeita capital inicial ou percentual CDI negativo', () => {
    expect(() => calculateCompoundReturn(-100, sampleDailyRates, 100)).toThrow();
    expect(() => calculateCompoundReturn(1000, sampleDailyRates, -10)).toThrow();
  });
});

describe('Aportes mensais e separação aporte vs lucro', () => {
  it('não soma aportes mensais como rendimento e rentabiliza cada aporte apenas após sua entrada', () => {
    const rates: CDIRate[] = [
      { data: '02/01/2026', valor: '0.050000' },
      { data: '03/01/2026', valor: '0.050000' },
      { data: '02/02/2026', valor: '0.050000' }, // virada de mês: entra aporte de 500
      { data: '03/02/2026', valor: '0.050000' },
    ];

    const summary = buildHistoricalComparisonWithContributions({
      initialAmount: 1000,
      monthlyContribution: 500,
      cdiPercentage: 115,
      rates,
      productType: 'CDB',
    });

    expect(summary.initialAmount).toBe(1000);
    expect(summary.totalContributions).toBe(500);
    expect(summary.investedValue).toBe(1500);
    expect(summary.grossProfit).toBeCloseTo(summary.grossValue - summary.investedValue, 2);
    expect(summary.grossProfit).toBeLessThan(10); // Apenas 4 dias úteis de rendimento real, nunca 500 de aporte
    expect(summary.grossValue).toBeGreaterThan(summary.cdi100GrossValue);
  });

  it('projeta cenários mensais corretamente sem misturar aporte com lucro', () => {
    const sim115 = simulateProjectedInvestment({
      initialAmount: 1000,
      monthlyContribution: 200,
      cdiPercentage: 115,
      annualCdiPercent: 12,
      months: 12,
      productType: 'CDB',
      startDateIso: '2026-01-01',
    });

    expect(sim115.investedValue).toBe(1000 + 12 * 200);
    expect(sim115.grossProfit).toBeGreaterThan(0);
    expect(sim115.grossValue).toBeGreaterThan(sim115.cdi100GrossValue);
    expect(sim115.netValue).toBeLessThan(sim115.grossValue); // CDB paga IR
    expect(sim115.timeline).toHaveLength(13);
  });
});

describe('Tributação regressiva: IR, IOF e isenções', () => {
  it('aplica faixas regressivas corretas do Imposto de Renda', () => {
    expect(getIrRate(90)).toBe(0.225);
    expect(getIrRate(180)).toBe(0.225);
    expect(getIrRate(181)).toBe(0.2);
    expect(getIrRate(360)).toBe(0.2);
    expect(getIrRate(361)).toBe(0.175);
    expect(getIrRate(720)).toBe(0.175);
    expect(getIrRate(721)).toBe(0.15);
  });

  it('aplica tabela regressiva do IOF para resgates antes de 30 dias e zera a partir de 30 dias', () => {
    expect(getIofRate(1)).toBe(0.96);
    expect(getIofRate(15)).toBe(0.5);
    expect(getIofRate(29)).toBe(0.03);
    expect(getIofRate(30)).toBe(0);

    const tax15 = calculateTaxation(1000, 15, 'CDB');
    expect(tax15.iofAmount).toBe(500); // 50% de 1000
    expect(tax15.irAmount).toBe(112.5); // 22.5% sobre (1000 - 500)
    expect(tax15.totalTax).toBe(612.5);
    expect(tax15.netProfit).toBe(387.5);
  });

  it('mantém LCI, LCA e Poupança isentos de IR e IOF', () => {
    const lciTax = calculateTaxation(1000, 10, 'LCI');
    const lcaTax = calculateTaxation(1000, 90, 'LCA');
    const poupTax = calculateTaxation(1000, 365, 'POUPANCA');

    expect(lciTax.taxExempt).toBe(true);
    expect(lciTax.totalTax).toBe(0);
    expect(lciTax.netProfit).toBe(1000);
    expect(lcaTax.totalTax).toBe(0);
    expect(poupTax.totalTax).toBe(0);
  });
});

describe('Datas, períodos e tratamento de indisponibilidade de API', () => {
  it('converte e normaliza datas BR <-> ISO para API do Banco Central', () => {
    expect(brDateToIso('21/11/2026')).toBe('2026-11-21');
    expect(isoToBrDate('2026-11-21')).toBe('21/11/2026');
    expect(countCalendarDays('2026-01-01', '2026-01-31')).toBe(30);
    expect(normalizeBcbDateParam('2026-11-21')).toBe('21/11/2026');
    expect(normalizeBcbDateParam('31/02/2026')).toBeNull();
  });

  it('lida com resposta vazia (ausência de histórico) sem erros', () => {
    const emptySummary = buildHistoricalComparisonWithContributions({
      initialAmount: 5000,
      monthlyContribution: 0,
      cdiPercentage: 115,
      rates: [],
      productType: 'CDB',
    });
    expect(emptySummary.grossValue).toBe(5000);
    expect(emptySummary.grossProfit).toBe(0);
    expect(emptySummary.timeline).toHaveLength(0);
  });

  it('propaga falha quando a API está indisponível e não há histórico salvo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Banco Central indisponível no momento.' }),
    } as Response);

    await expect(
      fetchCDIHistory(new Date(2026, 0, 1), new Date(2026, 10, 21))
    ).rejects.toThrow('Erro ao consultar CDI: HTTP 503');

    await expect(
      fetchCdiWithCache(new Date(2026, 0, 1), new Date(2026, 10, 21), { forceRefresh: true })
    ).rejects.toThrow('Banco Central indisponível no momento.');
  });
});
