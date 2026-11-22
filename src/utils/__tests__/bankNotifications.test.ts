import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Account, Boleto, CreditCard, Transaction } from '../../types';
import { cents } from '../../domain/money/money';
import { calculatePeriodMetricsCents, deriveAccountBalances } from '../../domain/accounts/BalanceCalculator';
import { isValidAndroidPackageId } from '../../domain/notifications/bankRegistry';
import { parseBankNotification } from '../../domain/notifications/notification.parser';
import { classifyBankNotification } from '../../domain/notifications/notification.classifier';
import { evaluateNotificationDuplication } from '../../domain/notifications/notification.deduplicator';
import { resolveConfirmedNotificationFinancialEffects } from '../../domain/notifications/notificationIntegration';
import type {
  BankNotificationViewItem,
  RawNotificationEvent,
  StoredBankNotificationRecord,
} from '../../domain/notifications/notification.types';
import {
  decryptNotificationPayload,
  encryptNotificationPayload,
  minimizeAndMaskNotificationText,
} from '../../core/security/notificationCrypto';
import { financeNotificationBridge } from '../../capacitor/financeNotificationPlugin';

function makeEvent(overrides: Partial<RawNotificationEvent> = {}): RawNotificationEvent {
  return {
    eventId: 'ev-1',
    sourceEventKey: '0|com.nu.production|101|null|1000',
    packageName: 'com.nu.production',
    appLabel: 'Nubank',
    title: 'Compra aprovada no crédito',
    text: 'Compra no crédito aprovada em SUPERMERCADO EXTRA no valor de R$ 145,90 cartão final 4821 em 2x.',
    receivedAt: Date.UTC(2026, 4, 15, 14, 0, 0),
    ...overrides,
  };
}

describe('FINANCE IA MOBILE 2.1 — Notificações Bancárias', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => mem.set(k, v),
        removeItem: (k: string) => mem.delete(k),
        clear: () => mem.clear(),
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('parser extrai centavos inteiros exatos, parcela, final do cartão e nunca inventa valores', () => {
    const creditEv = makeEvent();
    const parsed = parseBankNotification(creditEv);

    expect(parsed.institutionName).toBe('Nubank');
    expect(parsed.amountCents).toBe(14590);
    expect(Number.isSafeInteger(parsed.amountCents)).toBe(true);
    expect(parsed.cardLast4).toBe('4821');
    expect(parsed.installmentLabel).toBe('2x');
    expect(parsed.merchantOrCounterparty).toBe('SUPERMERCADO EXTRA');
    expect(parsed.isDeclined).toBe(false);
    expect(parsed.isHiddenContent).toBe(false);

    const hiddenEv = makeEvent({
      title: 'Nubank',
      text: 'Conteúdo oculto. Desbloqueie o dispositivo para ver a notificação.',
    });
    const hiddenParsed = parseBankNotification(hiddenEv);
    expect(hiddenParsed.isHiddenContent).toBe(true);
    expect(hiddenParsed.amountCents).toBeNull();
    expect(hiddenParsed.merchantOrCounterparty).toBeNull();
  });

  it('classifica deterministicamente os 9 tipos financeiros + recusada + desconhecida', () => {
    const cases: Array<{
      label: string;
      override: Partial<RawNotificationEvent>;
      expectedKind: string;
    }> = [
      {
        label: 'CREDIT_PURCHASE',
        override: {
          title: 'Compra no crédito',
          text: 'Compra aprovada no crédito em Farmácia Popular no valor de R$ 89,90 cartão final 1234.',
        },
        expectedKind: 'CREDIT_PURCHASE',
      },
      {
        label: 'DEBIT_PURCHASE',
        override: {
          title: 'Compra no débito',
          text: 'Compra no débito em Padaria Central de R$ 24,50.',
        },
        expectedKind: 'DEBIT_PURCHASE',
      },
      {
        label: 'PIX_IN',
        override: {
          packageName: 'com.itau',
          title: 'Pix recebido',
          text: 'Você recebeu um Pix de Cliente Alfa Ltda no valor de R$ 2.500,00.',
        },
        expectedKind: 'PIX_IN',
      },
      {
        label: 'PIX_OUT',
        override: {
          packageName: 'br.com.intermedium',
          title: 'Pix enviado',
          text: 'Você enviou um Pix para Energia Equatorial no valor de R$ 310,45.',
        },
        expectedKind: 'PIX_OUT',
      },
      {
        label: 'INVOICE_PAYMENT',
        override: {
          title: 'Fatura paga',
          text: 'Pagamento de fatura recebido no valor de R$ 1.850,00 com sucesso.',
        },
        expectedKind: 'INVOICE_PAYMENT',
      },
      {
        label: 'INTERNAL_TRANSFER',
        override: {
          title: 'Transferência realizada',
          text: 'Transferência enviada para conta de mesma titularidade no valor de R$ 600,00.',
        },
        expectedKind: 'INTERNAL_TRANSFER',
      },
      {
        label: 'BOLETO',
        override: {
          title: 'Boleto pago',
          text: 'Pagamento de boleto para Sabesp de R$ 118,30 realizado.',
        },
        expectedKind: 'BOLETO',
      },
      {
        label: 'FEE',
        override: {
          title: 'Débito em conta',
          text: 'Cobrança de tarifa de manutenção de R$ 29,90.',
        },
        expectedKind: 'FEE',
      },
      {
        label: 'REFUND',
        override: {
          title: 'Estorno recebido',
          text: 'Estorno recebido de Loja Online no valor de R$ 199,90.',
        },
        expectedKind: 'REFUND',
      },
      {
        label: 'DECLINED',
        override: {
          title: 'Compra recusada',
          text: 'Compra não autorizada no valor de R$ 500,00 por saldo insuficiente.',
        },
        expectedKind: 'DECLINED',
      },
      {
        label: 'UNKNOWN',
        override: {
          title: 'Aviso do banco',
          text: 'Confira novidades no seu aplicativo.',
        },
        expectedKind: 'UNKNOWN',
      },
    ];

    for (const c of cases) {
      const ev = makeEvent(c.override);
      const parsed = parseBankNotification(ev);
      const classified = classifyBankNotification(ev, parsed);
      expect(classified.kind, `Case ${c.label}`).toBe(c.expectedKind);
      expect(classified.requiresManualReview).toBe(true);
    }
  });

  it('deduplicador bloqueia reemissão < 90s e sourceEventKey repetido, mas preserva duas compras iguais em horários distintos', () => {
    const t0 = Date.UTC(2026, 4, 15, 10, 0, 0);
    const ev1 = makeEvent({
      eventId: 'ev-1',
      sourceEventKey: 'key-1',
      title: 'Compra no débito',
      text: 'Compra no débito em Café Bom no valor de R$ 12,00.',
      receivedAt: t0,
    });
    const parsed1 = parseBankNotification(ev1);
    const class1 = classifyBankNotification(ev1, parsed1);
    const firstDedup = evaluateNotificationDuplication({
      event: ev1,
      parsed: parsed1,
      classified: class1,
      existingQueue: [],
      existingTransactions: [],
    });
    expect(firstDedup.isDuplicate).toBe(false);

    const queuedRecord: Pick<
      StoredBankNotificationRecord,
      'id' | 'sourceEventKey' | 'idempotencyKey' | 'fingerprintHash' | 'packageName' | 'receivedAt' | 'amountCents' | 'kind' | 'status'
    > = {
      id: 'notif-1',
      sourceEventKey: ev1.sourceEventKey,
      idempotencyKey: firstDedup.idempotencyKey,
      fingerprintHash: firstDedup.fingerprintHash,
      packageName: ev1.packageName,
      receivedAt: t0,
      amountCents: parsed1.amountCents,
      kind: class1.kind,
      status: 'PENDING',
    };

    // Rebroadcast 20 seconds later with different source key -> blocked as contextual duplicate
    const evRebroadcast = makeEvent({
      eventId: 'ev-2',
      sourceEventKey: 'key-2',
      title: 'Compra no débito',
      text: 'Compra no débito em Café Bom no valor de R$ 12,00.',
      receivedAt: t0 + 20_000,
    });
    const rebroadcastDedup = evaluateNotificationDuplication({
      event: evRebroadcast,
      parsed: parseBankNotification(evRebroadcast),
      classified: classifyBankNotification(evRebroadcast, parseBankNotification(evRebroadcast)),
      existingQueue: [queuedRecord],
      existingTransactions: [],
    });
    expect(rebroadcastDedup.isDuplicate).toBe(true);

    // Legitimate second coffee 15 minutes later -> MUST BE PRESERVED
    const evSecondCoffee = makeEvent({
      eventId: 'ev-3',
      sourceEventKey: 'key-3',
      title: 'Compra no débito',
      text: 'Compra no débito em Café Bom no valor de R$ 12,00.',
      receivedAt: t0 + 15 * 60_000,
    });
    const secondCoffeeDedup = evaluateNotificationDuplication({
      event: evSecondCoffee,
      parsed: parseBankNotification(evSecondCoffee),
      classified: classifyBankNotification(evSecondCoffee, parseBankNotification(evSecondCoffee)),
      existingQueue: [queuedRecord],
      existingTransactions: [],
    });
    expect(secondCoffeeDedup.isDuplicate).toBe(false);
  });

  it('integração financeira não duplica gasto ao registrar compra no crédito e depois pagamento de fatura', () => {
    const accounts: Account[] = [
      {
        id: 'acc-nu',
        entityId: 'CPF',
        institutionName: 'Nubank',
        accountName: 'Conta Corrente',
        accountType: 'checking',
        openingBalance: 5000,
        balance: 5000,
      },
      {
        id: 'acc-itau',
        entityId: 'CPF',
        institutionName: 'Itaú',
        accountName: 'Reserva',
        accountType: 'savings',
        openingBalance: 2000,
        balance: 2000,
      },
    ];
    const cards: CreditCard[] = [
      {
        id: 'card-nu',
        entityId: 'CPF',
        institutionName: 'Nubank',
        cardName: 'Roxinho',
        last4: '4821',
        limit: 5000,
        dueDay: 10,
        closingDay: 3,
        currentInvoiceAmount: 0,
        status: 'PAID',
      },
    ];
    let transactions: Transaction[] = [];
    const boletos: Boleto[] = [];

    const creditItem: BankNotificationViewItem = {
      id: 'notif-c1',
      sourceEventKey: 'src-c1',
      idempotencyKey: 'idem-c1',
      fingerprintHash: 'fp-c1',
      packageName: 'com.nu.production',
      receivedAt: Date.now(),
      status: 'PENDING',
      retentionExpiresAt: Date.now() + 86_400_000,
      payload: {
        title: 'Compra crédito',
        sanitizedExcerpt: 'Supermercado R$ 300,00',
        institutionName: 'Nubank',
        merchantOrCounterparty: 'Supermercado',
        cardLast4: '4821',
        referenceCode: null,
        installmentLabel: null,
        amountCents: cents(30000),
        occurredDate: '2026-05-15',
        dateSource: 'EVENT_TIMESTAMP',
        kind: 'CREDIT_PURCHASE',
        direction: 'EXPENSE',
        operationType: 'CARTAO',
        suggestedCategory: 'Cartão',
        isInternalTransfer: false,
        isDeclined: false,
        isHiddenContent: false,
        parseConfidence: 0.9,
        warnings: [],
        classificationReason: 'Compra crédito',
      },
    };

    const resCredit = resolveConfirmedNotificationFinancialEffects({
      item: creditItem,
      resolution: {
        notificationId: creditItem.id,
        kind: 'CREDIT_PURCHASE',
        entityId: 'CPF',
        accountId: 'acc-nu',
        creditCardId: 'card-nu',
        description: 'Supermercado',
        category: 'Cartão',
        date: '2026-05-15',
        amountCents: cents(30000),
        direction: 'EXPENSE',
        operationType: 'CARTAO',
        isInternalTransfer: false,
      },
      accounts,
      creditCards: cards,
      transactions,
      boletos,
    });

    // Credit purchase increments invoice without touching checking account ledger
    expect(resCredit.updatedCreditCards?.[0].currentInvoiceAmount).toBe(300);
    expect(resCredit.updatedTransactions).toBeUndefined();

    // Now pay the R$ 300 invoice
    const invoiceItem: BankNotificationViewItem = {
      ...creditItem,
      id: 'notif-inv1',
      sourceEventKey: 'src-inv1',
      idempotencyKey: 'idem-inv1',
    };
    const resInvoice = resolveConfirmedNotificationFinancialEffects({
      item: invoiceItem,
      resolution: {
        notificationId: invoiceItem.id,
        kind: 'INVOICE_PAYMENT',
        entityId: 'CPF',
        accountId: 'acc-nu',
        creditCardId: 'card-nu',
        description: 'Pgto Fatura Roxinho',
        category: 'Cartão',
        date: '2026-05-20',
        amountCents: cents(30000),
        direction: 'EXPENSE',
        operationType: 'CARTAO',
        isInternalTransfer: false,
      },
      accounts,
      creditCards: resCredit.updatedCreditCards!,
      transactions,
      boletos,
    });

    expect(resInvoice.updatedCreditCards?.[0].currentInvoiceAmount).toBe(0);
    expect(resInvoice.updatedCreditCards?.[0].status).toBe('PAID');
    expect(resInvoice.updatedTransactions).toHaveLength(1);
    transactions = resInvoice.updatedTransactions!;

    const derivedAfterInvoice = deriveAccountBalances(accounts, transactions);
    const nuAccountAfterInvoice = derivedAfterInvoice.find((a) => a.id === 'acc-nu');
    expect(nuAccountAfterInvoice?.balanceCents).toBe(470000); // R$ 5.000 - R$ 300 (exactly once!)

    // Now confirm an internal transfer via TransferService
    const xferItem: BankNotificationViewItem = {
      ...creditItem,
      id: 'notif-xf1',
      sourceEventKey: 'src-xf1',
      idempotencyKey: 'idem-xf1',
    };
    const resXfer = resolveConfirmedNotificationFinancialEffects({
      item: xferItem,
      resolution: {
        notificationId: xferItem.id,
        kind: 'INTERNAL_TRANSFER',
        entityId: 'CPF',
        accountId: 'acc-nu',
        destinationAccountId: 'acc-itau',
        description: 'Reserva mensal',
        category: 'Transferência',
        date: '2026-05-21',
        amountCents: cents(100000),
        direction: 'EXPENSE',
        operationType: 'TRANSFERENCIA_PROPRIA',
        isInternalTransfer: true,
      },
      accounts,
      creditCards: resInvoice.updatedCreditCards!,
      transactions,
      boletos,
    });

    expect(resXfer.updatedTransactions).toHaveLength(3); // 1 invoice tx + 2 internal transfer legs
    const metrics = calculatePeriodMetricsCents(resXfer.updatedTransactions!);
    expect(metrics.confirmedExpenseCents).toBe(30000); // Only invoice payment counts as expense; internal transfer ignored!
    expect(metrics.confirmedIncomeCents).toBe(0);

    // Idempotency guard blocks re-posting same notification
    expect(() =>
      resolveConfirmedNotificationFinancialEffects({
        item: invoiceItem,
        resolution: {
          notificationId: invoiceItem.id,
          kind: 'INVOICE_PAYMENT',
          entityId: 'CPF',
          accountId: 'acc-nu',
          creditCardId: 'card-nu',
          description: 'Pgto Fatura Duplicado',
          category: 'Cartão',
          date: '2026-05-20',
          amountCents: cents(30000),
          direction: 'EXPENSE',
          operationType: 'CARTAO',
          isInternalTransfer: false,
        },
        accounts,
        creditCards: resInvoice.updatedCreditCards!,
        transactions: resXfer.updatedTransactions!,
        boletos,
      })
    ).toThrow(/já foi confirmada/i);
  });

  it('segurança: mascara PAN, CPF e OTP, valida package IDs e protege payloads com criptografia', async () => {
    const masked = minimizeAndMaskNotificationText(
      'Cartão 4532 1122 3344 9876 CPF 123.456.789-00 Código de segurança: A98712 compra R$ 50,00'
    );
    expect(masked).not.toContain('4532 1122 3344');
    expect(masked).toContain('•••• 9876');
    expect(masked).not.toContain('123.456.789-00');
    expect(masked).not.toContain('A98712');

    expect(isValidAndroidPackageId('com.nu.production')).toBe(true);
    expect(isValidAndroidPackageId('br.com.intermedium')).toBe(true);
    expect(isValidAndroidPackageId('invalidpkg')).toBe(false);
    expect(isValidAndroidPackageId('com.nu.production; rm -rf /')).toBe(false);

    const enc = await encryptNotificationPayload({
      title: 'Pix recebido',
      sanitizedExcerpt: 'Pix de R$ 100,00',
      institutionName: 'Nubank',
      merchantOrCounterparty: 'João',
      cardLast4: null,
      referenceCode: null,
      installmentLabel: null,
      amountCents: cents(10000),
      occurredDate: '2026-05-15',
      dateSource: 'EVENT_TIMESTAMP',
      kind: 'PIX_IN',
      direction: 'INCOME',
      operationType: 'PIX',
      suggestedCategory: 'Receitas',
      isInternalTransfer: false,
      isDeclined: false,
      isHiddenContent: false,
      parseConfidence: 0.95,
      warnings: [],
      classificationReason: 'Pix recebido',
    });

    const dec = await decryptNotificationPayload({
      ivB64: enc.ivB64,
      cipherB64: enc.cipherB64,
      mode: enc.mode,
    });
    expect(dec?.amountCents).toBe(10000);
    expect(dec?.institutionName).toBe('Nubank');
  });

  it('plataforma Web reporta WEB_UNSUPPORTED de forma honesta sem simular captura nativa', async () => {
    const status = await financeNotificationBridge.getPermissionStatus(false);
    expect(status.platform).toBe('web');
    expect(status.supported).toBe(false);
    expect(status.listenerEnabled).toBe(false);
    expect(status.unsupportedReason).toBe('WEB_UNSUPPORTED');

    const pending = await financeNotificationBridge.getPendingEvents();
    expect(pending).toEqual([]);
  });
});
