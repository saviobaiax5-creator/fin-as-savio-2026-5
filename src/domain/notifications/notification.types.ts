import type { Direction, OperationType } from '../../types';
import type { MoneyCents } from '../money/money';

export type NotificationPlatform = 'android' | 'ios' | 'web';

export type NotificationKind =
  | 'CREDIT_PURCHASE'
  | 'DEBIT_PURCHASE'
  | 'PIX_IN'
  | 'PIX_OUT'
  | 'INVOICE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'BOLETO'
  | 'FEE'
  | 'REFUND'
  | 'DECLINED'
  | 'UNKNOWN';

export type BankNotificationStatus = 'PENDING' | 'CONFIRMED' | 'DISCARDED';

export interface AuthorizedBankPackage {
  packageName: string;
  institutionName: string;
  verified: boolean;
}

export interface RawNotificationEvent {
  eventId: string;
  sourceEventKey: string;
  packageName: string;
  appLabel?: string;
  title: string;
  text: string;
  bigText?: string;
  subText?: string;
  receivedAt: number; // epoch ms
  channelId?: string;
}

export interface ParsedNotificationData {
  institutionName: string | null;
  amountCents: MoneyCents | null;
  occurredDate: string; // YYYY-MM-DD
  dateSource: 'EXTRACTED' | 'EVENT_TIMESTAMP';
  merchantOrCounterparty: string | null;
  cardLast4: string | null;
  referenceCode: string | null;
  installmentLabel: string | null;
  isDeclined: boolean;
  isHiddenContent: boolean;
  sanitizedSummary: string;
  parseConfidence: number; // 0..1
  warnings: string[];
}

export interface ClassifiedNotificationData {
  kind: NotificationKind;
  direction: Direction | null;
  operationType: OperationType;
  suggestedCategory: string;
  isInternalTransfer: boolean;
  shouldAffectCheckingAccount: boolean;
  shouldAffectCreditCardInvoice: boolean;
  requiresManualReview: boolean;
  classificationReason: string;
}

export interface BankNotificationSensitivePayload {
  title: string;
  sanitizedExcerpt: string;
  institutionName: string | null;
  merchantOrCounterparty: string | null;
  cardLast4: string | null;
  referenceCode: string | null;
  installmentLabel: string | null;
  amountCents: MoneyCents | null;
  occurredDate: string;
  dateSource: 'EXTRACTED' | 'EVENT_TIMESTAMP';
  kind: NotificationKind;
  direction: Direction | null;
  operationType: OperationType;
  suggestedCategory: string;
  isInternalTransfer: boolean;
  isDeclined: boolean;
  isHiddenContent: boolean;
  parseConfidence: number;
  warnings: string[];
  classificationReason: string;
}

export interface StoredBankNotificationRecord {
  id: string;
  sourceEventKey: string;
  idempotencyKey: string;
  fingerprintHash: string;
  packageName: string;
  receivedAt: number;
  occurredDate: string;
  amountCents: MoneyCents | null;
  kind: NotificationKind;
  status: BankNotificationStatus;
  retentionExpiresAt: number;
  confirmedTransactionId?: string;
  confirmedCreditCardId?: string;
  confirmedAt?: string;
  discardedAt?: string;
  discardReason?: string;
  // Encrypted AES-GCM envelope for sensitive bank text/details
  encryptedIvB64: string;
  encryptedCipherB64: string;
  encryptionMode: 'AES-GCM-256' | 'PLAIN_FALLBACK';
}

export interface BankNotificationViewItem {
  id: string;
  sourceEventKey: string;
  idempotencyKey: string;
  fingerprintHash: string;
  packageName: string;
  receivedAt: number;
  status: BankNotificationStatus;
  retentionExpiresAt: number;
  confirmedTransactionId?: string;
  confirmedCreditCardId?: string;
  confirmedAt?: string;
  discardedAt?: string;
  discardReason?: string;
  payload: BankNotificationSensitivePayload;
  isPotentialDuplicate?: boolean;
  duplicateReason?: string;
}

export interface NotificationPermissionStatus {
  platform: NotificationPlatform;
  supported: boolean;
  listenerEnabled: boolean;
  consentGranted: boolean;
  pendingNativeCount: number;
  unsupportedReason?: 'WEB_UNSUPPORTED' | 'IOS_UNSUPPORTED' | 'PLUGIN_UNAVAILABLE';
}

export interface NotificationCaptureSettings {
  consentGranted: boolean;
  consentUpdatedAt: string | null;
  authorizedPackages: string[];
  retentionDays: 7 | 30 | 60 | 90;
  maskSensitivePreview: boolean;
  autoSyncOnResume: boolean;
}

export interface NotificationReviewResolution {
  notificationId: string;
  kind: NotificationKind;
  entityId: 'CPF' | 'CNPJ';
  accountId: string;
  destinationAccountId?: string;
  creditCardId?: string;
  description: string;
  category: string;
  date: string;
  amountCents: MoneyCents;
  direction: Direction;
  operationType: OperationType;
  counterparty?: string;
  isInternalTransfer: boolean;
  installmentInvoiceMode?: boolean;
}
