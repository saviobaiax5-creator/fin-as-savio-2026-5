import type { MoneyCents } from '../domain/money/money';

export type SalaryCategory =
  | 'salary'
  | 'teaching'
  | 'thirteenth'
  | 'vacation'
  | 'benefit'
  | 'fgts'
  | 'occasional'
  | 'credit'
  | 'loan'
  | 'other';

export type SalaryIncomeGroup = 'recurring' | 'extraordinary' | 'loan';

export type PaymentFrequency = 'monthly' | 'weekly' | 'occasional';

export type SalaryRecordStatus =
  | 'received'
  | 'expected'
  | 'partially_received'
  | 'cancelled'
  | 'unknown';

export const SALARY_CATEGORY_LABELS: Record<SalaryCategory, string> = {
  salary: 'Salário fixo',
  teaching: 'Docência / Aulas',
  thirteenth: '13º Salário',
  vacation: 'Férias / Adicional',
  benefit: 'Benefício / Abono',
  fgts: 'FGTS',
  occasional: 'Serviço extra / Eventual',
  credit: 'Crédito / Comissão',
  loan: 'Empréstimo (não é renda)',
  other: 'Outra atividade',
};

export const SALARY_CATEGORY_GROUPS: Record<SalaryCategory, SalaryIncomeGroup> = {
  salary: 'recurring',
  teaching: 'recurring',
  benefit: 'recurring',
  other: 'recurring',
  thirteenth: 'extraordinary',
  vacation: 'extraordinary',
  occasional: 'extraordinary',
  fgts: 'extraordinary',
  credit: 'extraordinary',
  loan: 'loan',
};

export const SALARY_STATUS_LABELS: Record<SalaryRecordStatus, string> = {
  received: 'Recebido',
  expected: 'Previsto',
  partially_received: 'Recebido parcial',
  cancelled: 'Cancelado',
  unknown: 'A confirmar',
};

export const MONTHS_PT_FULL = [
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
] as const;

export const MONTHS_PT_SHORT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

export interface SalarySource {
  id: string;
  name: string;
  institution?: string;
  category: SalaryCategory;
  paymentFrequency?: PaymentFrequency;
  active: boolean;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SalaryRecord {
  id: string;
  sourceId: string;
  year: number;
  month: number; // 1..12
  referenceMonth?: string; // YYYY-MM
  expectedDate?: string; // YYYY-MM-DD
  paymentDate?: string; // YYYY-MM-DD
  grossAmount?: number;
  grossAmountCents?: MoneyCents;
  deductions?: number;
  deductionsCents?: MoneyCents;
  /** Valor líquido principal exibido e somado na tabela/gráficos (null = célula vazia / ausente) */
  amount: number | null;
  amountCents?: MoneyCents | null;
  manualNetOverride?: boolean;
  status: SalaryRecordStatus;
  description?: string;
  notes?: string;
  origin: 'excel' | 'manual';
  sourceRow?: number;
  linkedTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryAdjustment {
  id: string;
  sourceId: string;
  previousAmount: number;
  previousAmountCents?: MoneyCents;
  newAmount: number;
  newAmountCents?: MoneyCents;
  percentage: number | null;
  effectiveDate: string; // YYYY-MM-DD
  description: string;
  createdAt: string;
}

export interface SalaryImportResult {
  year: number;
  sources: SalarySource[];
  records: SalaryRecord[];
  warnings: string[];
  errors: string[];
}

export interface SalaryDataset {
  sources: SalarySource[];
  records: SalaryRecord[];
  adjustments: SalaryAdjustment[];
}
