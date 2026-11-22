import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildMonthlyEvolutionSeries,
  calculateMonthlyVariation,
  calculateNetSalary,
  calculateSalaryAdjustment,
  compareYearsSamePeriod,
  detectSalaryImportDuplicates,
  getAnnualTotal,
  getMonthlyAverage,
  getMonthlyTotal,
  getSourceAnnualTotal,
  getSourcesByCategory,
  summarizeAnnualIncome,
} from '../salaryCalculations';
import {
  classifySource,
  importSalaryExcelFromArrayBuffer,
} from '../../services/salaryExcelImport';
import {
  loadSalaryDatasetWithRecovery,
  saveSalaryDatasetSafely,
} from '../../services/salaryStorage';
import { applyBackupDataset, buildFullBackup } from '../../services/backupService';
import type { SalaryDataset, SalaryRecord, SalarySource } from '../../types/salary';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    key(idx: number) {
      return Array.from(store.keys())[idx] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
  };
}

describe('Módulo Salários e Evolução da Renda', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: createMemoryStorage(),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('classifica corretamente fontes salariais, docência, 13º, férias, extras e empréstimos', () => {
    expect(classifySource('Câmara de Paragominas')).toBe('salary');
    expect(classifySource('UNIP')).toBe('teaching');
    expect(classifySource('UNIGRANDE')).toBe('teaching');
    expect(classifySource('Salário Soter/CEI')).toBe('teaching');
    expect(classifySource('13º Câmara')).toBe('thirteenth');
    expect(classifySource('13º UNIP')).toBe('thirteenth');
    expect(classifySource('Férias UNIP')).toBe('vacation');
    expect(classifySource('SENAR')).toBe('salary');
    expect(classifySource('Extra UNAMA')).toBe('occasional');
    expect(classifySource('Pré-projeto')).toBe('occasional');
    expect(classifySource('Empréstimo Sicredi')).toBe('loan');
  });

  it('calcula salário líquido automático e respeita valor líquido manual', () => {
    const autoNet = calculateNetSalary({
      grossAmount: 5000,
      deductions: 842.5,
      manualNetOverride: false,
    });
    expect(autoNet.netAmount).toBe(4157.5);
    expect(autoNet.calculatedAuto).toBe(true);

    const manualNet = calculateNetSalary({
      grossAmount: 5000,
      deductions: 842.5,
      manualNetAmount: 4029.02,
      manualNetOverride: true,
    });
    expect(manualNet.netAmount).toBe(4029.02);
    expect(manualNet.calculatedAuto).toBe(false);
  });

  it('calcula soma mensal, soma anual, média mensal (apenas recebidos) e separa 13º, férias e empréstimos', () => {
    const sources: SalarySource[] = [
      { id: 's1', name: 'Câmara de Paragominas', category: 'salary', active: true, createdAt: '2026-01-01' },
      { id: 's2', name: 'UNIP', category: 'teaching', active: true, createdAt: '2026-01-01' },
      { id: 's3', name: '13º Câmara', category: 'thirteenth', active: true, createdAt: '2026-01-01' },
      { id: 's4', name: 'Férias UNIP', category: 'vacation', active: true, createdAt: '2026-01-01' },
      { id: 's5', name: 'Empréstimo Banco', category: 'loan', active: true, createdAt: '2026-01-01' },
    ];

    const records: SalaryRecord[] = [
      { id: 'r1', sourceId: 's1', year: 2026, month: 1, amount: 3924.87, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'r2', sourceId: 's2', year: 2026, month: 1, amount: 450.48, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'r3', sourceId: 's1', year: 2026, month: 2, amount: 3924.87, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      // Mês 3 apenas previsto (não deve entrar na soma de recebidos)
      { id: 'r4', sourceId: 's1', year: 2026, month: 3, amount: 4029.02, status: 'expected', origin: 'manual', createdAt: '', updatedAt: '' },
      // 13º e Férias recebidos no mês 12
      { id: 'r5', sourceId: 's3', year: 2026, month: 12, amount: 1885.0, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'r6', sourceId: 's4', year: 2026, month: 7, amount: 815.83, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      // Empréstimo recebido em fevereiro NÃO pode somar como salário
      { id: 'r7', sourceId: 's5', year: 2026, month: 2, amount: 10000, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
    ];

    expect(getMonthlyTotal(records, 2026, 1, sources)).toBe(4375.35);
    expect(getMonthlyTotal(records, 2026, 2, sources)).toBe(3924.87); // ignora empréstimo de 10k
    expect(getMonthlyTotal(records, 2026, 3, sources)).toBe(0); // previsto não soma como recebido

    expect(getAnnualTotal(records, 2026, sources)).toBe(11001.05);
    expect(getSourceAnnualTotal(records, 's1', 2026)).toBe(7849.74);
    expect(getMonthlyAverage(records, 2026, sources)).toBe(2750.26); // 4 meses com recebimento (1,2,7,12)

    const summary = summarizeAnnualIncome(records, sources, 2026);
    expect(summary.recurringTotal).toBe(8300.22); // 3924.87*2 + 450.48
    expect(summary.extraordinaryTotal).toBe(2700.83); // 1885 + 815.83
    expect(summary.expectedTotal).toBe(4029.02);
    expect(summary.loanTotal).toBe(10000);
    expect(summary.highestMonth?.month).toBe(1);
    expect(summary.lowestMonth?.month).toBe(7);

    const byCat = getSourcesByCategory(sources);
    expect(byCat.salary).toBe(1);
    expect(byCat.loan).toBe(1);
  });

  it('calcula variação mensal, reajustes e comparação entre anos incompletos', () => {
    expect(calculateMonthlyVariation(4000, 0)).toBeNull();
    expect(calculateMonthlyVariation(4400, 4000)).toBeCloseTo(10, 4);

    expect(calculateSalaryAdjustment(0, 4000)).toBeNull();
    expect(calculateSalaryAdjustment(3924.87, 4029.02)).toBeCloseTo(2.65359, 3);

    const sources: SalarySource[] = [
      { id: 's1', name: 'Câmara', category: 'salary', active: true, createdAt: '' },
    ];
    const records: SalaryRecord[] = [
      { id: 'a1', sourceId: 's1', year: 2025, month: 1, amount: 3800, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'a2', sourceId: 's1', year: 2025, month: 2, amount: 3800, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'a3', sourceId: 's1', year: 2025, month: 3, amount: 3800, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'b1', sourceId: 's1', year: 2026, month: 1, amount: 3924.87, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
      { id: 'b2', sourceId: 's1', year: 2026, month: 2, amount: 3924.87, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
    ];

    const comp = compareYearsSamePeriod(records, sources, 2025, 2026);
    expect(comp.isIncompleteComparison).toBe(true);
    expect(comp.monthsWithDataA).toBe(3);
    expect(comp.monthsWithDataB).toBe(2);
    expect(comp.commonMonths).toEqual([1, 2]);
    expect(comp.sameMonthsTotalA).toBe(7600);
    expect(comp.sameMonthsTotalB).toBe(7849.74);

    const monthlySeries = buildMonthlyEvolutionSeries(records, sources, 2026);
    expect(monthlySeries[0].variationPct).toBeNull();
    expect(monthlySeries[1].variationPct).toBe(0);
  });

  it('importa bloco salarial A1:N24 da Planilha1 no layout exato, ignora coluna O e outras tabelas, e preserva ausências', async () => {
    const monthsHeader = [
      'Fonte',
      2026,
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
      'Total Anual', // Coluna O (índice 14) -> deve ser ignorada!
      'Despesas Cartão', // Coluna P (índice 15) -> tabela externa que NÃO pode virar salário!
    ];

    const rows: unknown[][] = [
      monthsHeader,
      ['Câmara de Paragominas', null, 3600, 3600, 3600, 3600, 3600, 3600, 3751.82, 3751.82, 3751.82, 3751.82, 3751.82, 3751.82, 44110.92, 99999],
      ['UNIP', null, 317.28, 317.28, 317.28, 317.28, 317.28, 317.28, 317.28, 317.28, 317.28, 317.28, 317.30, null, 3490.10, 5000],
      ['UNIGRANDE', null, 381.62, 381.63, null, null, null, null, null, null, null, null, null, null, 763.25],
      ['13º Câmara', null, null, null, null, null, null, null, null, null, null, null, null, 1885.00, 1885.00],
      ['13º UNIP', null, null, null, null, null, 402.96, null, null, null, null, null, null, 402.96, 805.92],
      ['Salário Soter/CEI', null, 500, 500, 500, 500, 500, 500, null, null, null, null, null, null, 3000.00],
      ['SENAR', null, null, 2100, 2100, null, null, null, null, null, null, null, null, null, 4200.00],
      ['Férias UNIP', null, 815.83, null, null, null, null, null, 815.84, null, null, null, null, null, 1631.67],
      ['Instituto Aprender', null, null, null, null, null, null, null, null, null, 240, null, null, null, 240.00],
      ['Extra UNAMA', null, null, null, 1500, 1500, 1500, null, null, null, null, null, null, null, 4500.00],
      ['Pré-projeto', null, null, null, null, null, null, null, null, null, null, 350, null, null, 350.00],
      ['Total', null, 999999], // Linha de total dentro de A2:A24 deve ser ignorada!
    ];

    // Preenche até linha 25 (índice 24) colocando outra tabela fora do bloco A1:O24
    while (rows.length <= 24) rows.push([]);
    rows[24] = ['Compras Cartão Crédito', null, 8500, 9200];

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Planilha1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const result = await importSalaryExcelFromArrayBuffer(buffer);

    expect(result.year).toBe(2026);
    expect(result.sources).toHaveLength(11);
    expect(result.sources.some((s) => s.name === 'Total')).toBe(false);
    expect(result.sources.some((s) => s.name === 'Compras Cartão Crédito')).toBe(false);

    // Total de lançamentos preenchidos nas 11 fontes (12+11+2+1+2+6+2+2+1+3+1 = 43)
    expect(result.records).toHaveLength(43);
    // Todos iniciam como 'unknown' aguardando confirmação
    expect(result.records.every((r) => r.status === 'unknown')).toBe(true);

    // Conferência de valores após confirmar recebimento
    const confirmedRecords = result.records.map((r) => ({ ...r, status: 'received' as const }));
    const byName = new Map(result.sources.map((s) => [s.name, s.id]));

    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Câmara de Paragominas')!, 2026)).toBe(44110.92);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('UNIP')!, 2026)).toBe(3490.10);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('UNIGRANDE')!, 2026)).toBe(763.25);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('13º Câmara')!, 2026)).toBe(1885.00);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('13º UNIP')!, 2026)).toBe(805.92);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Salário Soter/CEI')!, 2026)).toBe(3000.00);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('SENAR')!, 2026)).toBe(4200.00);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Férias UNIP')!, 2026)).toBe(1631.67);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Instituto Aprender')!, 2026)).toBe(240.00);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Extra UNAMA')!, 2026)).toBe(4500.00);
    expect(getSourceAnnualTotal(confirmedRecords, byName.get('Pré-projeto')!, 2026)).toBe(350.00);
  });

  it('detecta duplicidades na importação e preserva histórico antigo em persistência e backup', () => {
    const existingSources: SalarySource[] = [
      { id: 's-cam', name: 'Câmara de Paragominas', category: 'salary', active: true, createdAt: '' },
    ];
    const existingRecords: SalaryRecord[] = [
      { id: 'r-old', sourceId: 's-cam', year: 2026, month: 1, amount: 3924.87, status: 'received', origin: 'manual', createdAt: '', updatedAt: '' },
    ];

    const incomingSources: SalarySource[] = [
      { id: 'tmp-cam', name: 'camara de paragominas', category: 'salary', active: true, createdAt: '' },
    ];
    const incomingRecords: SalaryRecord[] = [
      { id: 'inc-1', sourceId: 'tmp-cam', year: 2026, month: 1, amount: 3924.87, status: 'unknown', origin: 'excel', createdAt: '', updatedAt: '' },
      { id: 'inc-2', sourceId: 'tmp-cam', year: 2026, month: 2, amount: 3924.87, status: 'unknown', origin: 'excel', createdAt: '', updatedAt: '' },
    ];

    const dup = detectSalaryImportDuplicates(
      incomingSources,
      incomingRecords,
      existingSources,
      existingRecords
    );
    expect(dup.duplicateCount).toBe(1);
    expect(dup.newCount).toBe(1);
    expect(dup.duplicateKeys.has('inc-1')).toBe(true);

    const dataset: SalaryDataset = {
      sources: existingSources,
      records: existingRecords,
      adjustments: [
        {
          id: 'adj-1',
          sourceId: 's-cam',
          previousAmount: 3800,
          newAmount: 3924.87,
          percentage: 3.286,
          effectiveDate: '2026-01-01',
          description: 'Reajuste anual',
          createdAt: '',
        },
      ],
    };

    const saved = saveSalaryDatasetSafely(dataset);
    expect(saved.ok).toBe(true);
    const loaded = loadSalaryDatasetWithRecovery();
    expect(loaded.data.sources).toHaveLength(1);
    expect(loaded.data.records).toHaveLength(1);
    expect(loaded.data.adjustments).toHaveLength(1);

    const fullBackup = buildFullBackup({
      accounts: [],
      transactions: [],
      creditCards: [],
      boletos: [],
      debts: [],
      assets: [],
      documents: [],
      salaries: dataset,
    });
    expect(fullBackup.data.salaries?.sources).toHaveLength(1);

    const merged = applyBackupDataset(
      {
        accounts: [],
        transactions: [],
        creditCards: [],
        boletos: [],
        debts: [],
        assets: [],
        documents: [],
        salaries: { sources: [], records: [], adjustments: [] },
      },
      fullBackup.data,
      'merge'
    );
    expect(merged.next.salaries?.records).toHaveLength(1);
  });
});
