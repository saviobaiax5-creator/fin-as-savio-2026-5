export interface CDIRate {
  data: string;
  valor: string;
}

export interface CdiSeriesCacheRecord {
  key: string;
  startDate: string; // DD/MM/YYYY
  endDate: string; // DD/MM/YYYY
  fetchedAt: string; // ISO timestamp
  source: string;
  series: CDIRate[];
}

export type InvestmentProductType =
  | 'CDB'
  | 'LCI'
  | 'LCA'
  | 'POUPANCA'
  | 'TESOURO_SELIC';

export type InvestmentFilterPeriod = '30d' | '90d' | '6m' | '12m' | '24m' | '5y' | 'custom';

export type InvestmentSubTab =
  | 'overview'
  | 'comparator'
  | 'simulator'
  | 'history'
  | 'analysis';

export interface InvestmentSimulation {
  id: string;
  name: string;
  productType: InvestmentProductType;

  initialAmount: number;
  monthlyContribution: number;

  cdiPercentage: number;

  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  annualReferenceCdi?: number;

  grossValue: number;
  investedValue: number;
  grossProfit: number;
  estimatedIof: number;
  estimatedIr: number;
  estimatedTax: number;
  netValue: number;
  netProfit: number;
  taxExempt: boolean;

  dataSource: 'BCB_REAL' | 'PROJECAO_CDI';
  cdiReferenceDate?: string;

  createdAt: string;
  updatedAt: string;
}

export interface InvestmentResult {
  date: string;
  label: string;
  investedAmount: number;
  cdiValue: number;
  cdbValue: number;
  grossProfit: number;
  netValue: number;
  netProfit?: number;
  taxAmount?: number;
}

export interface InvestmentParameters {
  initialAmount: number;
  monthlyContribution: number;
  cdiPercentage: number;
  annualCDI?: number;
  days: number;
  productType?: InvestmentProductType;
}

export interface TaxBreakdown {
  days: number;
  taxExempt: boolean;
  iofRate: number;
  irRate: number;
  iofAmount: number;
  irAmount: number;
  totalTax: number;
  netProfit: number;
  note: string;
}

export interface MonthlySimulationSummary {
  initialAmount: number;
  totalContributions: number;
  investedValue: number;
  grossValue: number;
  grossProfit: number;
  cdi100GrossValue: number;
  cdi100GrossProfit: number;
  differenceVsCdiGross: number;
  cumulativeYieldPct: number;
  tax: TaxBreakdown;
  netValue: number;
  netProfit: number;
  timeline: InvestmentResult[];
}
