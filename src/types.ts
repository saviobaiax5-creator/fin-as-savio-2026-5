import type { MoneyCents } from './domain/money/money';

export type EntityScope = 'CPF' | 'CNPJ' | 'CONSOLIDATED';
export type Direction = 'INCOME' | 'EXPENSE';
export type TransactionStatus = 'PLANNED' | 'PENDING' | 'CONFIRMED' | 'CANCELLED';
export type TransactionOrigin = 'MANUAL' | 'IMPORT' | 'OPEN_FINANCE' | 'BOLETO' | 'BANK_NOTIFICATION';

export const APP_CATEGORIES = [
  'Salário',
  'Serviço MEI',
  'Moradia',
  'Alimentação',
  'Transporte',
  'Cartão',
  'Impostos / DAS',
  'Insumos / Produção',
  'Transferência',
  'Outros',
] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

export const OPERATION_TYPES = [
  'PIX',
  'TED_DOC',
  'BOLETO',
  'CARTAO',
  'TRANSFERENCIA_PROPRIA',
  'SAQUE',
  'TARIFA',
  'OUTRO',
] as const;

export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  PIX: 'Pix',
  TED_DOC: 'TED / DOC',
  BOLETO: 'Boleto / Guia',
  CARTAO: 'Cartão',
  TRANSFERENCIA_PROPRIA: 'Transferência própria',
  SAQUE: 'Saque',
  TARIFA: 'Tarifa / Encargo',
  OUTRO: 'Outro',
};

export interface ExtractedDocumentTransaction {
  description: string;
  amountCents?: MoneyCents;
  amount: number;
  date: string; // YYYY-MM-DD
  category: AppCategory;
  entity: 'CPF' | 'CNPJ';
  direction: Direction;
  operationType: OperationType;
  counterparty: string;
  externalId: string;
  isInternalTransfer: boolean;
  originAccountHint?: string;
  destinationAccountHint?: string;
  confidence: number; // 0..1
  confidenceNote?: string;
}

export interface Transaction {
  id: string;
  entityId: 'CPF' | 'CNPJ';
  accountId: string;
  creditCardId?: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  account: string;
  amountCents?: MoneyCents;
  // Campo legado: manter somente durante a migração.
  amount: number;
  direction: Direction;
  status: TransactionStatus;
  origin: TransactionOrigin;
  isInternalTransfer?: boolean;
  operationType?: OperationType;
  counterparty?: string;
  externalId?: string;
  salaryRecordId?: string;
  transferId?: string;
  idempotencyKey?: string;
  reversedTransactionId?: string;
  reversalTransactionId?: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface AuditLogEntry {
  id: string;
  action: 'TRANSACTION_REVERSED' | 'TRANSACTION_CANCELLED' | 'TRANSACTION_RESTORED' | 'TRANSFER_EXECUTED';
  entityType: 'TRANSACTION' | 'TRANSFER';
  entityId: string;
  relatedEntityId?: string;
  actor: string;
  timestamp: string;
  reason: string;
  amountCents: MoneyCents;
  previousState: Record<string, unknown>;
  nextState: Record<string, unknown>;
}

export interface TransactionReversalRecord {
  id: string;
  originalTransactionId: string;
  reversalTransactionId: string;
  actor: string;
  timestamp: string;
  reason: string;
  amountCents: MoneyCents;
}

export interface Account {
  id: string;
  entityId: 'CPF' | 'CNPJ';
  institutionName: string;
  accountName: string;
  accountType: 'checking' | 'savings' | 'business' | 'investment';
  openingBalanceCents?: MoneyCents;
  balanceCents?: MoneyCents;
  projectedBalanceCents?: MoneyCents;
  projectedBalance?: number;
  balance: number;
  openingBalance: number;
  archived?: boolean;
}

export interface CreditCard {
  id: string;
  entityId: 'CPF' | 'CNPJ';
  institutionName: string;
  cardName: string;
  last4: string;
  limit: number;
  closingDay: number;
  dueDay: number;
  currentInvoiceAmount: number;
  status: 'OPEN' | 'CLOSED' | 'PAID';
}

export interface Boleto {
  id: string;
  beneficiario: string;
  pagador: string;
  instituicao: string;
  linhaDigitavel: string;
  vencimento: string; // YYYY-MM-DD
  valorOriginal: number;
  descricao: string;
  status: 'PENDING' | 'PAID';
  entityId: 'CPF' | 'CNPJ';
  category: string;
  paidAt?: string;
  paidAmount?: number;
  paidAccountId?: string;
}

export interface Debt {
  id: string;
  entityId: 'CPF' | 'CNPJ';
  creditorName: string;
  description: string;
  originalAmount: number;
  outstandingAmount: number;
  installmentAmount?: number;
  dueDay: number;
  status: 'ACTIVE' | 'PAID' | 'RENEGOTIATED';
}

export interface Asset {
  id: string;
  entityId: 'CPF' | 'CNPJ';
  assetType: 'Reserva' | 'Renda Fixa' | 'Renda Variável' | 'Fundos' | 'Produtos Boticário' | 'Outros';
  institutionName: string;
  description: string;
  currentValue: number;
  valuationDate: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: 'PDF' | 'EPUB' | 'Imagem';
  date: string;
  size: string;
  status: 'PENDING' | 'PROCESSED';
  hasBlob?: boolean;
  fileId?: string;
  mimeType?: string;
  previewUrl?: string;
  textContent?: string;
  extractedTransactions?: ExtractedDocumentTransaction[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface CategoryBudget {
  id: string;
  entityScope: EntityScope;
  category: string;
  limitCents: MoneyCents;
  limitAmount: number;
  updatedAt: string;
}

export interface CategoryRule {
  id: string;
  keyword: string;
  category: string;
  direction?: Direction;
  createdAt: string;
}

export interface LedgerDrilldownFilter {
  accountId?: string;
  accountLabel?: string;
  category?: string;
  direction?: Direction;
  status?: TransactionStatus;
}
