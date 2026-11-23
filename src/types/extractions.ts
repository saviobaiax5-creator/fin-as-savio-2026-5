import type { MoneyCents } from '../domain/money/money';
import type { EntityId, OperationType, Direction, Transaction, Asset, CreditCard } from '../types';

export type InstitutionCategory =
  | 'BANCO_FISICO'
  | 'BANCO_DIGITAL'
  | 'CARTEIRA_DIGITAL'
  | 'CORRETORA_NACIONAL'
  | 'CORRETORA_INTERNACIONAL'
  | 'EXCHANGE'
  | 'CARTAO_CREDITO'
  | 'OUTRA';

export const INSTITUTION_CATEGORY_LABELS: Record<InstitutionCategory, string> = {
  BANCO_FISICO: 'BANCO FÍSICO',
  BANCO_DIGITAL: 'BANCO DIGITAL',
  CARTEIRA_DIGITAL: 'CARTEIRA DIGITAL',
  CORRETORA_NACIONAL: 'CORRETORA NACIONAL',
  CORRETORA_INTERNACIONAL: 'CORRETORA INTERNACIONAL',
  EXCHANGE: 'EXCHANGE',
  CARTAO_CREDITO: 'CARTÃO DE CRÉDITO',
  OUTRA: 'OUTRA INSTITUIÇÃO',
};

export interface InstitutionProfile {
  id: string;
  name: string;
  commercialName: string;
  category: InstitutionCategory;
  country: string;
  code?: string; // COMPE / ISPB
  website?: string;
  logoHint?: string;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  isBuiltin?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountProductStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type AccountBalanceSyncStatus = 'UPDATED' | 'OUTDATED' | 'UNKNOWN';

export interface AccountExtensionMeta {
  id: string; // matches accountId or cardId
  targetKind: 'ACCOUNT' | 'CARD';
  institutionId: string;
  institutionCategory: InstitutionCategory;
  holderEntity: EntityId;
  holderName?: string;
  maskedHolderDoc?: string;
  holderDocType?: 'CPF' | 'CNPJ';
  agency?: string;
  maskedAccountNumber?: string;
  accountDigit?: string;
  productType?: string;
  currency: string; // BRL, USD, EUR, etc.
  openedAt?: string;
  status: AccountProductStatus;
  balanceStatus?: AccountBalanceSyncStatus;
  lastStatementAt?: string;
  notes?: string;
  // Credit card extras
  cardIssuer?: string;
  cardNetwork?: string;
  cardBestPurchaseDay?: number;
  cardPaymentAccountId?: string;
  availableLimit?: number;
  // Brokerage extras
  country?: string;
  brokerageAccountCode?: string;
  tradedAssetClasses?: string[];
  brokerageCashBalance?: number;
  // Exchange extras
  custodiedAssets?: string[];
  availableCurrencies?: string[];
  blockchainNetworks?: string[];
  updatedAt: string;
}

export type ExtractionFileFormat =
  | 'OFX'
  | 'CSV'
  | 'XLSX'
  | 'XLS'
  | 'PDF'
  | 'XML'
  | 'JSON'
  | 'IMAGE';

export type ExtractionStage =
  | 'arquivo'
  | 'leitura'
  | 'conta'
  | 'classificacao'
  | 'duplicidades'
  | 'conferencia'
  | 'concluido';

export type ExtractionBatchStatus =
  | 'PENDENTE'
  | 'PROCESSANDO'
  | 'AGUARDANDO_REVISAO'
  | 'APROVADO_PARCIAL'
  | 'CONCLUIDO'
  | 'CANCELADO'
  | 'ERRO';

export type ExtractionMovementType =
  | 'RECEITA'
  | 'DESPESA'
  | 'PIX_RECEBIDO'
  | 'PIX_ENVIADO'
  | 'TRANSFERENCIA'
  | 'APLICACAO'
  | 'RESGATE'
  | 'RENDIMENTO'
  | 'CASHBACK'
  | 'ESTORNO'
  | 'TARIFA'
  | 'IMPOSTO'
  | 'COMPRA_ATIVO'
  | 'VENDA_ATIVO'
  | 'PROVENTO'
  | 'FATURA_CARTAO'
  | 'CRIPTO_OPERACAO'
  | 'NAO_IDENTIFICADO';

export const EXTRACTION_MOVEMENT_LABELS: Record<ExtractionMovementType, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
  PIX_RECEBIDO: 'PIX Recebido',
  PIX_ENVIADO: 'PIX Enviado',
  TRANSFERENCIA: 'Transferência',
  APLICACAO: 'Aplicação',
  RESGATE: 'Resgate',
  RENDIMENTO: 'Rendimento',
  CASHBACK: 'Cashback',
  ESTORNO: 'Estorno',
  TARIFA: 'Tarifa',
  IMPOSTO: 'Imposto (IR/IOF)',
  COMPRA_ATIVO: 'Compra de Ativo',
  VENDA_ATIVO: 'Venda de Ativo',
  PROVENTO: 'Dividendo / JCP / Provento',
  FATURA_CARTAO: 'Fatura de Cartão',
  CRIPTO_OPERACAO: 'Operação Cripto',
  NAO_IDENTIFICADO: 'Não Identificado',
};

export type DuplicateClassification =
  | 'INEDITA'
  | 'POSSIVEL_DUPLICIDADE'
  | 'DUPLICIDADE_CONFIRMADA'
  | 'JA_REGISTRADA'
  | 'TRANSFERENCIA_PROPRIA'
  | 'RELACIONADA';

export type ReviewStatus =
  | 'PENDENTE'
  | 'PRECISA_IDENTIFICACAO'
  | 'APROVADO'
  | 'IGNORADO'
  | 'DUPLICIDADE'
  | 'INTEGRADO'
  | 'ERRO';

export interface IdentifiedAccountInfo {
  bankName?: string;
  bankCode?: string;
  bankIspb?: string;
  bankType?: 'fisico' | 'digital' | 'desconhecido';
  detectionConfidence?: 'alta' | 'media' | 'baixa';
  institutionId?: string;
  institutionCategory?: InstitutionCategory;
  holderName?: string;
  maskedDocument?: string;
  documentHash?: string;
  documentValid?: boolean;
  holderNature?: EntityId; // Only populated when verified from document or explicitly confirmed
  agency?: string;
  maskedAccountNumber?: string;
  accountType?: string;
  currency?: string;
  matchedAccountId?: string;
  matchedCardId?: string;
  ambiguousCandidateAccountIds?: string[];
  requiresConfirmation: boolean;
  confirmationReason?: string;
}

export interface LineageEvent {
  timestamp: string;
  stage: string;
  actor: 'SISTEMA' | 'USUARIO';
  detail: string;
}

export interface InvestmentBreakdownMeta {
  productName?: string; // e.g., CDB, RDB, Poupança, Fundo DI, Tesouro Selic
  indexer?: 'CDI' | 'IPCA' | 'SELIC' | 'PREFIXADO' | 'OUTRO';
  indexerRateLabel?: string; // Strictly preserved only when explicitly stated in statement
  principalCents?: MoneyCents;
  yieldCents?: MoneyCents;
  grossCents?: MoneyCents;
  irCents?: MoneyCents;
  iofCents?: MoneyCents;
  otherFeesCents?: MoneyCents;
  netCents?: MoneyCents;
  ticker?: string;
  assetQuantity?: number;
  unitPrice?: number;
}

export interface CryptoOperationMeta {
  assetSymbol: string;
  quantity: number; // Preserve exact decimal precision (e.g., 0.00451234 BTC)
  network?: string;
  txHash?: string;
  fromAddress?: string;
  toAddress?: string;
  counterAssetSymbol?: string;
  counterQuantity?: number;
  networkFee?: number;
  feeAsset?: string;
}

export interface ForeignExchangeMeta {
  originalCurrency: string;
  originalAmount: number;
  fxRate?: number;
  convertedBrlCents?: MoneyCents;
}

export interface CardPurchaseMeta {
  installmentCurrent?: number;
  installmentTotal?: number;
  totalPurchaseAmount?: number;
  cardLast4?: string;
  isInvoicePayment?: boolean;
}

export interface ExtractedMovement {
  id: string;
  batchId: string;
  bankTransactionId?: string; // FITID, E2E, NSU, txHash
  date: string; // YYYY-MM-DD
  postedDate?: string;
  originalDescription: string;
  normalizedDescription: string;
  counterparty?: string;
  amountCents: MoneyCents;
  amount: number;
  direction: Direction;
  currency: string;
  movementType: ExtractionMovementType;
  operationType: OperationType;
  suggestedCategory: string;
  entityId?: EntityId;
  targetAccountId?: string;
  targetCardId?: string;
  targetAssetId?: string;
  transferCounterpartAccountId?: string;
  linkedReversalTxId?: string;
  linkedCashbackTxId?: string;
  matchedRuleId?: string;
  matchedRuleKeyword?: string;
  confidence: number; // 0..1
  doubtReason?: string;
  duplicateStatus: DuplicateClassification;
  duplicateMatchTxId?: string;
  duplicateMatchBatchId?: string;
  duplicateMatchReason?: string;
  reviewStatus: ReviewStatus;
  rawRowSnapshot: Record<string, string | number | boolean | null>;
  manualCorrections: string[];
  investmentMeta?: InvestmentBreakdownMeta;
  cryptoMeta?: CryptoOperationMeta;
  fxMeta?: ForeignExchangeMeta;
  cardMeta?: CardPurchaseMeta;
  approvedAt?: string;
  approvedBy?: string;
  integratedAt?: string;
  integratedModule?: string;
  integratedTransactionId?: string;
  integratedTransferTxId?: string;
  integratedAssetId?: string;
  integrationError?: string;
  idempotencyKey: string;
  lineage: LineageEvent[];
}

export interface StatementBalanceSummary {
  openingBalanceCents?: MoneyCents;
  reportedEndingBalanceCents?: MoneyCents;
  availableBalanceCents?: MoneyCents;
  blockedBalanceCents?: MoneyCents;
  pendingTransactionsCents?: MoneyCents;
  creditsCents: MoneyCents;
  debitsCents: MoneyCents;
  applicationsCents: MoneyCents;
  redemptionsCents: MoneyCents;
  calculatedEndingBalanceCents?: MoneyCents;
  divergenceCents?: MoneyCents;
  hasDivergence: boolean;
  notes: string[];
}

export interface ExtractionBatch {
  id: string;
  fileName: string;
  format: ExtractionFileFormat;
  fileSizeBytes: number;
  fileId?: string; // Stored in IndexedDB files table
  contentFingerprint: string;
  importedAt: string;
  periodStart?: string;
  periodEnd?: string;
  stage: ExtractionStage;
  status: ExtractionBatchStatus;
  identifiedAccount: IdentifiedAccountInfo;
  confirmedAccountId?: string;
  confirmedCardId?: string;
  confirmedInstitutionId?: string;
  confirmedEntityId?: EntityId;
  balanceSummary: StatementBalanceSummary;
  warnings: string[];
  errors: string[];
  parseSource: 'LOCAL' | 'OCR_IA' | 'MANUAL';
  movements: ExtractedMovement[];
  approvedBy?: string;
  approvedAt?: string;
  cancelledAt?: string;
}

export interface ExtractionRule {
  id: string;
  keyword: string;
  institutionId?: string;
  entityId?: EntityId;
  movementType?: ExtractionMovementType;
  category: string;
  counterparty?: string;
  createdAt: string;
}

export type ConsolidationMode = 'INDIVIDUAL' | 'CATEGORY' | 'CONSOLIDATED' | 'CUSTOM';

export interface ConsolidationPreferences {
  mode: ConsolidationMode;
  targetCurrency: 'BRL' | 'USD' | 'EUR';
  usdToBrlRate: number;
  eurToBrlRate: number;
  selectedAccountIds: string[];
  selectedCardIds: string[];
  selectedAssetIds: string[];
  selectedCategories: InstitutionCategory[];
  includeClosedAccounts: boolean;
  defaultPeriod: string;
  defaultIndividualId?: string;
}

export interface CsvColumnMapping {
  hasHeader: boolean;
  delimiter: ';' | ',' | '\t';
  dateCol: number;
  descriptionCol: number;
  amountCol: number;
  debitCol?: number;
  creditCol?: number;
  counterpartyCol?: number;
  balanceCol?: number;
  idCol?: number;
  currencyCol?: number;
}

export interface ParseResultPayload {
  format: ExtractionFileFormat;
  parseSource: 'LOCAL' | 'OCR_IA';
  identifiedAccount: IdentifiedAccountInfo;
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents?: MoneyCents;
  reportedEndingBalanceCents?: MoneyCents;
  availableBalanceCents?: MoneyCents;
  blockedBalanceCents?: MoneyCents;
  warnings: string[];
  errors: string[];
  requiresManualReview: boolean;
  rows: Array<{
    date: string;
    postedDate?: string;
    description: string;
    amountSignedCents: MoneyCents;
    currency: string;
    bankTransactionId?: string;
    counterparty?: string;
    rawOperationHint?: string;
    rawRowSnapshot: Record<string, string | number | boolean | null>;
    investmentMeta?: InvestmentBreakdownMeta;
    cryptoMeta?: CryptoOperationMeta;
    fxMeta?: ForeignExchangeMeta;
    cardMeta?: CardPurchaseMeta;
    confidence?: number;
    doubtReason?: string;
  }>;
  // For interactive CSV / XLSX previews
  tabularPreview?: {
    sheetNames?: string[];
    selectedSheet?: string;
    headers: string[];
    sampleRows: string[][];
    detectedMapping?: CsvColumnMapping;
  };
}

export interface TraceabilityLookupResult {
  movement: ExtractedMovement;
  batch: ExtractionBatch;
  institution?: InstitutionProfile;
  accountLabel: string;
}

export interface ConsolidationBreakdownItem {
  id: string;
  label: string;
  institutionName: string;
  institutionCategory: InstitutionCategory;
  entityId: EntityId;
  currency: string;
  originalAmountCents: MoneyCents;
  convertedBrlCents: MoneyCents;
  balanceStatus: AccountBalanceSyncStatus;
  sourceKind: 'ACCOUNT' | 'ASSET' | 'CARD' | 'DEBT' | 'TRANSACTION';
  targetTab?: string;
}

export interface ConsolidationSummary {
  mode: ConsolidationMode;
  targetCurrency: 'BRL' | 'USD' | 'EUR';
  selectedCount: number;
  includedCategories: InstitutionCategory[];
  hasUnconvertedCurrencies: boolean;
  missingRateCurrencies: string[];
  hasOutdatedBalances: boolean;
  // Core separated totals (in targetCurrency cents)
  disponibilidadesCents: MoneyCents;
  disponibilidadeBancosFisicosCents: MoneyCents;
  disponibilidadeBancosDigitaisCents: MoneyCents;
  disponibilidadeCarteirasCents: MoneyCents;
  disponibilidadeCorretorasCents: MoneyCents;
  investimentosCents: MoneyCents;
  criptoCents: MoneyCents;
  faturasAbertasCents: MoneyCents;
  dividasCents: MoneyCents;
  obrigacoesTotaisCents: MoneyCents;
  receitasPeriodoCents: MoneyCents;
  despesasPeriodoCents: MoneyCents;
  patrimonioBrutoCents: MoneyCents;
  patrimonioLiquidoCents: MoneyCents;
  breakdownByBucket: {
    disponibilidades: ConsolidationBreakdownItem[];
    investimentos: ConsolidationBreakdownItem[];
    cripto: ConsolidationBreakdownItem[];
    faturas: ConsolidationBreakdownItem[];
    dividas: ConsolidationBreakdownItem[];
    receitas: ConsolidationBreakdownItem[];
    despesas: ConsolidationBreakdownItem[];
  };
  institutionRows: Array<{
    institutionId: string;
    institutionName: string;
    category: InstitutionCategory;
    disponibilidadesCents: MoneyCents;
    investimentosCents: MoneyCents;
    obrigacoesCents: MoneyCents;
    accountsCount: number;
    hasOutdatedBalance: boolean;
  }>;
}

export interface ExtractionIntegrationCommitResult {
  batch: ExtractionBatch;
  newTransactions: Transaction[];
  updatedTransactions: Transaction[];
  newAssets: Asset[];
  updatedAssets: Asset[];
  updatedCreditCards: CreditCard[];
  approvedCount: number;
  integratedCount: number;
  skippedDuplicateCount: number;
  failedCount: number;
  errors: string[];
}
