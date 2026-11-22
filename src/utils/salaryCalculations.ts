import {
  MONTHS_PT_SHORT,
  SALARY_CATEGORY_GROUPS,
  type SalaryCategory,
  type SalaryRecord,
  type SalaryRecordStatus,
  type SalarySource,
} from '../types/salary';
import {
  MoneyCents,
  addMoney,
  cents,
  fromCents,
  subtractMoney,
  toCents,
} from '../domain/money/money';

export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

export function getSalaryRecordAmountCents(record: SalaryRecord): MoneyCents {
  if (typeof record.amountCents === 'number' && Number.isSafeInteger(record.amountCents)) {
    return cents(record.amountCents);
  }
  return toCents(record.amount ?? 0);
}

export function getSalaryRecordGrossCents(record: SalaryRecord): MoneyCents {
  if (typeof record.grossAmountCents === 'number' && Number.isSafeInteger(record.grossAmountCents)) {
    return cents(record.grossAmountCents);
  }
  if (typeof record.grossAmount === 'number' && Number.isFinite(record.grossAmount)) {
    return toCents(record.grossAmount);
  }
  return addMoney(getSalaryRecordAmountCents(record), getSalaryRecordDeductionsCents(record));
}

export function getSalaryRecordDeductionsCents(record: SalaryRecord): MoneyCents {
  if (
    typeof record.deductionsCents === 'number' &&
    Number.isSafeInteger(record.deductionsCents)
  ) {
    return cents(record.deductionsCents);
  }
  return toCents(record.deductions ?? 0);
}

export function formatReferenceMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isRecordPaid(status: SalaryRecordStatus): boolean {
  return status === 'received' || status === 'partially_received';
}

/**
 * Calcula salário líquido em centavos inteiros (bruto - descontos),
 * respeitando valor líquido informado manualmente.
 */
export function calculateNetSalary(params: {
  grossAmount?: number;
  deductions?: number;
  manualNetAmount?: number | null;
  manualNetOverride?: boolean;
}): { netAmount: number | null; netAmountCents: MoneyCents | null; calculatedAuto: boolean } {
  const { grossAmount, deductions = 0, manualNetAmount, manualNetOverride } = params;
  if (manualNetOverride && typeof manualNetAmount === 'number' && Number.isFinite(manualNetAmount)) {
    const netCents = cents(Math.max(0, toCents(manualNetAmount)));
    return { netAmount: fromCents(netCents), netAmountCents: netCents, calculatedAuto: false };
  }
  if (typeof grossAmount === 'number' && Number.isFinite(grossAmount) && grossAmount >= 0) {
    const grossCents = toCents(grossAmount);
    const dedCents =
      Number.isFinite(deductions) && deductions > 0 ? toCents(deductions) : cents(0);
    const netCents = cents(Math.max(0, subtractMoney(grossCents, dedCents)));
    return {
      netAmount: fromCents(netCents),
      netAmountCents: netCents,
      calculatedAuto: true,
    };
  }
  if (typeof manualNetAmount === 'number' && Number.isFinite(manualNetAmount)) {
    const netCents = cents(Math.max(0, toCents(manualNetAmount)));
    return { netAmount: fromCents(netCents), netAmountCents: netCents, calculatedAuto: false };
  }
  return { netAmount: null, netAmountCents: null, calculatedAuto: false };
}

function buildSourceCategoryMap(sources?: SalarySource[]): Map<string, SalaryCategory> {
  const map = new Map<string, SalaryCategory>();
  if (sources) {
    for (const s of sources) {
      map.set(s.id, s.category);
    }
  }
  return map;
}

function isLoanRecord(record: SalaryRecord, sourceMap: Map<string, SalaryCategory>): boolean {
  return sourceMap.get(record.sourceId) === 'loan';
}

export function getMonthlyTotalCents(
  records: SalaryRecord[],
  year: number,
  month: number,
  sources?: SalarySource[],
  options?: { includePartiallyReceived?: boolean; includeLoans?: boolean }
): MoneyCents {
  const sourceMap = buildSourceCategoryMap(sources);
  const includePartial = options?.includePartiallyReceived ?? true;
  const includeLoans = options?.includeLoans ?? false;

  return records
    .filter((record) => {
      if (record.year !== year || record.month !== month) return false;
      if (!includeLoans && isLoanRecord(record, sourceMap)) return false;
      if (record.status === 'received') return true;
      if (includePartial && record.status === 'partially_received') return true;
      return false;
    })
    .reduce((acc, record) => addMoney(acc, getSalaryRecordAmountCents(record)), cents(0));
}

export function getMonthlyTotal(
  records: SalaryRecord[],
  year: number,
  month: number,
  sources?: SalarySource[],
  options?: { includePartiallyReceived?: boolean; includeLoans?: boolean }
): number {
  return fromCents(getMonthlyTotalCents(records, year, month, sources, options));
}

export function getAnnualTotalCents(
  records: SalaryRecord[],
  year: number,
  sources?: SalarySource[],
  options?: { includeLoans?: boolean }
): MoneyCents {
  const sourceMap = buildSourceCategoryMap(sources);
  const includeLoans = options?.includeLoans ?? false;

  return records
    .filter((record) => {
      if (record.year !== year) return false;
      if (!includeLoans && isLoanRecord(record, sourceMap)) return false;
      return isRecordPaid(record.status);
    })
    .reduce((acc, record) => addMoney(acc, getSalaryRecordAmountCents(record)), cents(0));
}

export function getAnnualTotal(
  records: SalaryRecord[],
  year: number,
  sources?: SalarySource[],
  options?: { includeLoans?: boolean }
): number {
  return fromCents(getAnnualTotalCents(records, year, sources, options));
}

export function getSourceAnnualTotal(
  records: SalaryRecord[],
  sourceId: string,
  year: number,
  options?: { statuses?: SalaryRecordStatus[] }
): number {
  const statuses = options?.statuses;
  const totalCents = records
    .filter((record) => {
      if (record.sourceId !== sourceId || record.year !== year) return false;
      if (statuses) return statuses.includes(record.status);
      return isRecordPaid(record.status);
    })
    .reduce((acc, record) => addMoney(acc, getSalaryRecordAmountCents(record)), cents(0));

  return fromCents(totalCents);
}

export function getMonthlyAverage(
  records: SalaryRecord[],
  year: number,
  sources?: SalarySource[]
): number {
  const sourceMap = buildSourceCategoryMap(sources);
  const monthsWithIncome = new Set(
    records
      .filter(
        (record) =>
          record.year === year &&
          !isLoanRecord(record, sourceMap) &&
          isRecordPaid(record.status) &&
          getSalaryRecordAmountCents(record) > 0
      )
      .map((record) => record.month)
  );

  if (monthsWithIncome.size === 0) return 0;

  const annualCents = getAnnualTotalCents(records, year, sources);
  return fromCents(cents(Math.round(annualCents / monthsWithIncome.size)));
}

export function getSalaryVariation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function calculateMonthlyVariation(current: number, previous: number): number | null {
  return getSalaryVariation(current, previous);
}

export function calculateSalaryAdjustment(
  oldAmount: number,
  newAmount: number
): number | null {
  const oldCents = toCents(oldAmount);
  const newCents = toCents(newAmount);
  if (oldCents <= 0) return null;
  return ((newCents - oldCents) / oldCents) * 100;
}

export function getSourcesByCategory(sources: SalarySource[]): Record<string, number> {
  return sources.reduce<Record<string, number>>((result, source) => {
    result[source.category] = (result[source.category] ?? 0) + 1;
    return result;
  }, {});
}

export interface AnnualIncomeSummary {
  year: number;
  receivedNetTotal: number;
  receivedGrossTotal: number;
  receivedDeductionsTotal: number;
  expectedTotal: number;
  unknownTotal: number;
  recurringTotal: number;
  extraordinaryTotal: number;
  loanTotal: number;
  monthlyAverage: number;
  highestMonth: { month: number; label: string; total: number } | null;
  lowestMonth: { month: number; label: string; total: number } | null;
  filledMonthsCount: number;
  receivedMonthsCount: number;
  activeSourcesCount: number;
  linkedTransactionsCount: number;
}

export function summarizeAnnualIncome(
  records: SalaryRecord[],
  sources: SalarySource[],
  year: number
): AnnualIncomeSummary {
  const sourceMap = buildSourceCategoryMap(sources);
  const yearRecords = records.filter((r) => r.year === year);

  let receivedNetCents = cents(0);
  let receivedGrossCents = cents(0);
  let receivedDeductionsCents = cents(0);
  let expectedCents = cents(0);
  let unknownCents = cents(0);
  let recurringCents = cents(0);
  let extraordinaryCents = cents(0);
  let loanCents = cents(0);
  let linkedTransactionsCount = 0;

  const monthlyReceivedCents = new Map<number, MoneyCents>();
  const filledMonths = new Set<number>();

  for (const r of yearRecords) {
    if (r.amount === null && (r.amountCents === null || r.amountCents === undefined)) continue;
    filledMonths.add(r.month);
    const amountCents = getSalaryRecordAmountCents(r);
    const category = sourceMap.get(r.sourceId) ?? 'other';
    const group = SALARY_CATEGORY_GROUPS[category];

    if (r.linkedTransactionId) {
      linkedTransactionsCount += 1;
    }

    if (group === 'loan') {
      if (isRecordPaid(r.status) || r.status === 'unknown') {
        loanCents = addMoney(loanCents, amountCents);
      }
      continue;
    }

    if (isRecordPaid(r.status)) {
      receivedNetCents = addMoney(receivedNetCents, amountCents);
      receivedGrossCents = addMoney(receivedGrossCents, getSalaryRecordGrossCents(r));
      receivedDeductionsCents = addMoney(receivedDeductionsCents, getSalaryRecordDeductionsCents(r));
      monthlyReceivedCents.set(
        r.month,
        addMoney(monthlyReceivedCents.get(r.month) ?? cents(0), amountCents)
      );

      if (group === 'recurring') recurringCents = addMoney(recurringCents, amountCents);
      else if (group === 'extraordinary') {
        extraordinaryCents = addMoney(extraordinaryCents, amountCents);
      }
    } else if (r.status === 'expected') {
      expectedCents = addMoney(expectedCents, amountCents);
    } else if (r.status === 'unknown') {
      unknownCents = addMoney(unknownCents, amountCents);
    }
  }

  const positiveMonths = Array.from(monthlyReceivedCents.entries())
    .filter(([, totalCents]) => totalCents > 0)
    .map(([month, totalCents]) => ({
      month,
      label: MONTHS_PT_SHORT[month - 1] || String(month),
      total: fromCents(totalCents),
    }));

  let highestMonth: AnnualIncomeSummary['highestMonth'] = null;
  let lowestMonth: AnnualIncomeSummary['lowestMonth'] = null;

  for (const item of positiveMonths) {
    if (!highestMonth || item.total > highestMonth.total) highestMonth = item;
    if (!lowestMonth || item.total < lowestMonth.total) lowestMonth = item;
  }

  const receivedMonthsCount = positiveMonths.length;

  return {
    year,
    receivedNetTotal: fromCents(receivedNetCents),
    receivedGrossTotal: fromCents(receivedGrossCents),
    receivedDeductionsTotal: fromCents(receivedDeductionsCents),
    expectedTotal: fromCents(expectedCents),
    unknownTotal: fromCents(unknownCents),
    recurringTotal: fromCents(recurringCents),
    extraordinaryTotal: fromCents(extraordinaryCents),
    loanTotal: fromCents(loanCents),
    monthlyAverage:
      receivedMonthsCount > 0
        ? fromCents(cents(Math.round(receivedNetCents / receivedMonthsCount)))
        : 0,
    highestMonth,
    lowestMonth,
    filledMonthsCount: filledMonths.size,
    receivedMonthsCount,
    activeSourcesCount: sources.filter((s) => s.active).length,
    linkedTransactionsCount,
  };
}

export interface MonthlyChartDatum {
  month: number;
  label: string;
  received: number;
  expected: number;
  unknown: number;
  recurring: number;
  extraordinary: number;
  variationPct: number | null;
}

export function buildMonthlyEvolutionSeries(
  records: SalaryRecord[],
  sources: SalarySource[],
  year: number
): MonthlyChartDatum[] {
  const sourceMap = buildSourceCategoryMap(sources);
  const series: MonthlyChartDatum[] = [];

  for (let month = 1; month <= 12; month++) {
    let receivedCents = cents(0);
    let expectedCents = cents(0);
    let unknownCents = cents(0);
    let recurringCents = cents(0);
    let extraordinaryCents = cents(0);

    for (const r of records) {
      if (
        r.year !== year ||
        r.month !== month ||
        (r.amount === null && (r.amountCents === null || r.amountCents === undefined))
      ) {
        continue;
      }
      const amountCents = getSalaryRecordAmountCents(r);
      const cat = sourceMap.get(r.sourceId) ?? 'other';
      const group = SALARY_CATEGORY_GROUPS[cat];
      if (group === 'loan') continue;

      if (isRecordPaid(r.status)) {
        receivedCents = addMoney(receivedCents, amountCents);
        if (group === 'recurring') recurringCents = addMoney(recurringCents, amountCents);
        else extraordinaryCents = addMoney(extraordinaryCents, amountCents);
      } else if (r.status === 'expected') {
        expectedCents = addMoney(expectedCents, amountCents);
      } else if (r.status === 'unknown') {
        unknownCents = addMoney(unknownCents, amountCents);
      }
    }

    const received = fromCents(receivedCents);
    const prevReceived = month > 1 ? series[month - 2].received : 0;
    series.push({
      month,
      label: MONTHS_PT_SHORT[month - 1],
      received,
      expected: fromCents(expectedCents),
      unknown: fromCents(unknownCents),
      recurring: fromCents(recurringCents),
      extraordinary: fromCents(extraordinaryCents),
      variationPct: month > 1 ? calculateMonthlyVariation(received, prevReceived) : null,
    });
  }

  return series;
}

export interface YearlyComparisonResult {
  yearA: number;
  yearB: number;
  totalYearA: number;
  totalYearB: number;
  sameMonthsTotalA: number;
  sameMonthsTotalB: number;
  commonMonths: number[];
  monthsWithDataA: number;
  monthsWithDataB: number;
  isIncompleteComparison: boolean;
  samePeriodGrowthPct: number | null;
  fullYearGrowthPct: number | null;
  monthlyRows: Array<{
    month: number;
    label: string;
    yearAValue: number;
    yearBValue: number;
  }>;
}

/**
 * Compara o mesmo período entre dois anos sem ocultar diferenças de cobertura de meses.
 */
export function compareYearsSamePeriod(
  records: SalaryRecord[],
  sources: SalarySource[],
  yearA: number,
  yearB: number
): YearlyComparisonResult {
  const monthsWithDataA: number[] = [];
  const monthsWithDataB: number[] = [];
  const monthlyRows: YearlyComparisonResult['monthlyRows'] = [];

  for (let m = 1; m <= 12; m++) {
    const valACents = getMonthlyTotalCents(records, yearA, m, sources);
    const valBCents = getMonthlyTotalCents(records, yearB, m, sources);
    if (valACents > 0) monthsWithDataA.push(m);
    if (valBCents > 0) monthsWithDataB.push(m);
    monthlyRows.push({
      month: m,
      label: MONTHS_PT_SHORT[m - 1],
      yearAValue: fromCents(valACents),
      yearBValue: fromCents(valBCents),
    });
  }

  const commonMonths = monthsWithDataA.filter((m) => monthsWithDataB.includes(m));
  const sameMonthsTotalACents = commonMonths.reduce<MoneyCents>(
    (acc, m) => addMoney(acc, toCents(monthlyRows[m - 1].yearAValue)),
    cents(0)
  );
  const sameMonthsTotalBCents = commonMonths.reduce<MoneyCents>(
    (acc, m) => addMoney(acc, toCents(monthlyRows[m - 1].yearBValue)),
    cents(0)
  );

  const totalYearA = getAnnualTotal(records, yearA, sources);
  const totalYearB = getAnnualTotal(records, yearB, sources);

  const isIncompleteComparison =
    monthsWithDataA.length !== monthsWithDataB.length ||
    monthsWithDataA.length < 12 ||
    monthsWithDataB.length < 12;

  return {
    yearA,
    yearB,
    totalYearA,
    totalYearB,
    sameMonthsTotalA: fromCents(sameMonthsTotalACents),
    sameMonthsTotalB: fromCents(sameMonthsTotalBCents),
    commonMonths,
    monthsWithDataA: monthsWithDataA.length,
    monthsWithDataB: monthsWithDataB.length,
    isIncompleteComparison,
    samePeriodGrowthPct: getSalaryVariation(
      fromCents(sameMonthsTotalBCents),
      fromCents(sameMonthsTotalACents)
    ),
    fullYearGrowthPct: getSalaryVariation(totalYearB, totalYearA),
    monthlyRows,
  };
}

export function normalizeSourceNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ImportDuplicateInfo {
  duplicateKeys: Set<string>;
  duplicateCount: number;
  newCount: number;
}

export function detectSalaryImportDuplicates(
  incomingSources: SalarySource[],
  incomingRecords: SalaryRecord[],
  existingSources: SalarySource[],
  existingRecords: SalaryRecord[]
): ImportDuplicateInfo {
  const existingSourceById = new Map(
    existingSources.map((s) => [s.id, normalizeSourceNameKey(s.name)])
  );
  const existingCompositeKeys = new Set(
    existingRecords.map((r) => {
      const sKey = existingSourceById.get(r.sourceId) || r.sourceId;
      return `${sKey}::${r.year}::${r.month}`;
    })
  );

  const incomingSourceById = new Map(
    incomingSources.map((s) => [s.id, normalizeSourceNameKey(s.name)])
  );

  const duplicateKeys = new Set<string>();
  let duplicateCount = 0;
  let newCount = 0;

  for (const r of incomingRecords) {
    const sKey = incomingSourceById.get(r.sourceId) || r.sourceId;
    const composite = `${sKey}::${r.year}::${r.month}`;
    if (existingCompositeKeys.has(composite)) {
      duplicateKeys.add(r.id);
      duplicateCount += 1;
    } else {
      newCount += 1;
    }
  }

  return { duplicateKeys, duplicateCount, newCount };
}
