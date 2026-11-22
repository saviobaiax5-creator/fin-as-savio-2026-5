import type { CategoryRule, Direction, OperationType } from '../../types';
import { categorizeTransactionDescription } from '../transactions/CategorizationService';
import type {
  ClassifiedNotificationData,
  NotificationKind,
  ParsedNotificationData,
  RawNotificationEvent,
} from './notification.types';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyKindDeterministic(
  normText: string,
  parsed: ParsedNotificationData
): {
  kind: NotificationKind;
  direction: Direction | null;
  operationType: OperationType;
  isInternalTransfer: boolean;
  shouldAffectCheckingAccount: boolean;
  shouldAffectCreditCardInvoice: boolean;
  reason: string;
} {
  // 1. Declined / failed operations never post to ledger or invoice
  if (parsed.isDeclined) {
    return {
      kind: 'DECLINED',
      direction: null,
      operationType: 'OUTRO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: false,
      shouldAffectCreditCardInvoice: false,
      reason: 'Operação recusada/negada identificada pela regra determinística.',
    };
  }

  // 2. Hidden lockscreen / missing amount cannot be auto-classified reliably
  if (parsed.isHiddenContent || parsed.amountCents === null || parsed.amountCents <= 0) {
    return {
      kind: 'UNKNOWN',
      direction: null,
      operationType: 'OUTRO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: false,
      shouldAffectCreditCardInvoice: false,
      reason: parsed.isHiddenContent
        ? 'Conteúdo oculto na notificação exige conferência manual.'
        : 'Valor não identificado na notificação.',
    };
  }

  // 3. Refunds & reversals (Estornos e cancelamentos)
  if (
    /\b(estorno|estornad[ao]|reembolso|devolu[cç][aã]o|compra cancelada|cancelamento)\b/.test(
      normText
    )
  ) {
    return {
      kind: 'REFUND',
      direction: 'INCOME',
      operationType: normText.includes('pix') ? 'PIX' : normText.includes('cartao') || parsed.cardLast4 ? 'CARTAO' : 'OUTRO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: !(normText.includes('fatura') || normText.includes('credito')),
      shouldAffectCreditCardInvoice: normText.includes('fatura') || normText.includes('credito'),
      reason: 'Estorno ou cancelamento detectado.',
    };
  }

  // 4. Credit card invoice payment (Pagamento de fatura) — must be checked BEFORE generic credit purchase
  if (
    /\b(pagamento(?:\s+de)?\s+fatura|fatura\s+paga|fatura\s+recebid[ao]|pgto\s+fatura|pagou\s+a\s+fatura)\b/.test(
      normText
    )
  ) {
    return {
      kind: 'INVOICE_PAYMENT',
      direction: 'EXPENSE',
      operationType: 'CARTAO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: true,
      reason: 'Pagamento de fatura de cartão detectado (quita fatura sem duplicar compras).',
    };
  }

  // 5. Internal transfers (Transferências próprias / mesma titularidade)
  if (
    /\b(mesma titularidade|entre suas contas|entre contas proprias|transferencia propria|para sua conta|da sua conta)\b/.test(
      normText
    )
  ) {
    return {
      kind: 'INTERNAL_TRANSFER',
      direction: /\b(recebid|entrou|creditad)\b/.test(normText) ? 'INCOME' : 'EXPENSE',
      operationType: 'TRANSFERENCIA_PROPRIA',
      isInternalTransfer: true,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Transferência entre contas de mesma titularidade.',
    };
  }

  // 6. Bank fees / charges (Tarifas e encargos)
  if (/\b(tarifa|anuidade|iof|encargo|juros|cesta de servicos|taxa de manutencao)\b/.test(normText)) {
    return {
      kind: 'FEE',
      direction: 'EXPENSE',
      operationType: 'TARIFA',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Tarifa ou encargo bancário detectado.',
    };
  }

  // 7. Boleto / utility bill payment
  if (/\b(boleto|titulo bancario|codigo de barras|guia das|darf|conta de consumo|fatura de energia|fatura de agua)\b/.test(normText)) {
    return {
      kind: 'BOLETO',
      direction: 'EXPENSE',
      operationType: 'BOLETO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Pagamento de boleto ou guia identificado.',
    };
  }

  // 8. Pix received vs Pix sent
  if (normText.includes('pix')) {
    const isIncoming =
      /\b(recebeu|recebido|recebida|caiu na conta|creditado|recebimento)\b/.test(normText) &&
      !/\b(enviou|enviado|enviada|transferiu|pagou|pagamento)\b/.test(normText);

    if (isIncoming) {
      return {
        kind: 'PIX_IN',
        direction: 'INCOME',
        operationType: 'PIX',
        isInternalTransfer: false,
        shouldAffectCheckingAccount: true,
        shouldAffectCreditCardInvoice: false,
        reason: 'Pix recebido identificado.',
      };
    }

    const isOutgoing = /\b(enviou|enviado|enviada|transferiu|pagou|pagamento|realizado|pix feito)\b/.test(
      normText
    );
    if (isOutgoing) {
      return {
        kind: 'PIX_OUT',
        direction: 'EXPENSE',
        operationType: 'PIX',
        isInternalTransfer: false,
        shouldAffectCheckingAccount: true,
        shouldAffectCreditCardInvoice: false,
        reason: 'Pix enviado/pago identificado.',
      };
    }
  }

  // 9. Debit purchase (Compra no débito)
  if (
    /\b(no debito|cartao de debito|funcao debito|compra.*debito|debito em conta|saque)\b/.test(
      normText
    )
  ) {
    return {
      kind: 'DEBIT_PURCHASE',
      direction: 'EXPENSE',
      operationType: normText.includes('saque') ? 'SAQUE' : 'CARTAO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Compra no débito ou saque identificado.',
    };
  }

  // 10. Credit card purchase (Compra no cartão de crédito)
  if (
    /\b(no credito|cartao de credito|funcao credito|compra.*credito|compra aprovada|fatura atual|parcelad[ao])\b/.test(
      normText
    ) ||
    Boolean(parsed.cardLast4)
  ) {
    return {
      kind: 'CREDIT_PURCHASE',
      direction: 'EXPENSE',
      operationType: 'CARTAO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: false,
      shouldAffectCreditCardInvoice: true,
      reason: 'Compra no cartão de crédito identificada (alimenta fatura do cartão).',
    };
  }

  // 11. Generic transfer / incoming / outgoing hints
  if (/\b(transferencia recebida|deposito|salario|rendimento|creditado)\b/.test(normText)) {
    return {
      kind: 'PIX_IN',
      direction: 'INCOME',
      operationType: 'TED_DOC',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Entrada em conta identificada.',
    };
  }

  if (/\b(transferencia enviada|ted enviada|doc enviado|compra realizada|pagamento realizado)\b/.test(normText)) {
    return {
      kind: 'DEBIT_PURCHASE',
      direction: 'EXPENSE',
      operationType: normText.includes('ted') || normText.includes('doc') ? 'TED_DOC' : 'OUTRO',
      isInternalTransfer: false,
      shouldAffectCheckingAccount: true,
      shouldAffectCreditCardInvoice: false,
      reason: 'Saída em conta identificada.',
    };
  }

  return {
    kind: 'UNKNOWN',
    direction: null,
    operationType: 'OUTRO',
    isInternalTransfer: false,
    shouldAffectCheckingAccount: false,
    shouldAffectCreditCardInvoice: false,
    reason: 'Tipo de movimentação não conclusivo; revise manualmente antes de confirmar.',
  };
}

export function classifyBankNotification(
  event: RawNotificationEvent,
  parsed: ParsedNotificationData,
  customRules: CategoryRule[] = []
): ClassifiedNotificationData {
  const rawCombined = `${event.title} ${event.bigText || event.text} ${event.subText || ''}`;
  const norm = normalize(rawCombined);

  const base = classifyKindDeterministic(norm, parsed);

  let suggestedCategory = 'Outros';
  if (base.kind === 'CREDIT_PURCHASE' || base.kind === 'INVOICE_PAYMENT') {
    suggestedCategory = 'Cartão';
  } else if (base.kind === 'INTERNAL_TRANSFER') {
    suggestedCategory = 'Transferência';
  } else if (base.kind === 'FEE') {
    suggestedCategory = 'Outros';
  }

  // Apply deterministic Portuguese merchant rules + user custom rules
  if (base.direction && base.kind !== 'INVOICE_PAYMENT' && base.kind !== 'INTERNAL_TRANSFER') {
    const descForCategorization = [
      parsed.merchantOrCounterparty || '',
      event.title,
      event.text,
    ]
      .filter(Boolean)
      .join(' ');

    const catMatch = categorizeTransactionDescription({
      description: descForCategorization,
      direction: base.direction,
      customRules,
      fallbackCategory: suggestedCategory,
    });
    suggestedCategory = catMatch.category;
  }

  return {
    kind: base.kind,
    direction: base.direction,
    operationType: base.operationType,
    suggestedCategory,
    isInternalTransfer: base.isInternalTransfer,
    shouldAffectCheckingAccount: base.shouldAffectCheckingAccount,
    shouldAffectCreditCardInvoice: base.shouldAffectCreditCardInvoice,
    requiresManualReview: true, // Always require user confirmation before ledger creation!
    classificationReason: base.reason,
  };
}
