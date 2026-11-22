import { describe, it, expect } from 'vitest';
import {
  detectTaxDocumentNature,
  maskAccountNumber,
  maskTaxDocument,
  validateCnpjDigits,
  validateCpfDigits,
} from '../fileSecurity';
import { identifySourceAccount } from '../accountIdentifier';
import { BUILTIN_INSTITUTIONS } from '../institutionRegistry';
import { classifyExtractedMovement } from '../movementClassifier';
import type { Account } from '../../../types';

describe('CPF/CNPJ Validation, Account Identification & Economic Classification', () => {
  it('validates CPF and CNPJ check digits strictly and masks sensitive numbers', () => {
    expect(validateCpfDigits('52998224725')).toBe(true);
    expect(validateCpfDigits('52998224724')).toBe(false); // bad check digit
    expect(validateCpfDigits('11111111111')).toBe(false); // repeated sequence

    expect(validateCnpjDigits('11222333000181')).toBe(true);
    expect(validateCnpjDigits('11222333000182')).toBe(false);

    expect(detectTaxDocumentNature('529.982.247-25')).toMatchObject({
      nature: 'CPF',
      masked: '***.982.247-**',
      valid: true,
    });
    expect(detectTaxDocumentNature('11.222.333/0001-81')).toMatchObject({
      nature: 'CNPJ',
      masked: '**.222.333/0001-**',
      valid: true,
    });
    expect(detectTaxDocumentNature('529.982.247-00').valid).toBe(false);

    expect(maskTaxDocument('52998224725')).toBe('***.982.247-**');
    expect(maskAccountNumber('123456-7')).toBe('•••• 56-7');
  });

  it('separates CPF vs CNPJ accounts, flags ambiguity on multiple accounts in same bank, and avoids guessing', () => {
    const accounts: Account[] = [
      {
        id: 'acc-itau-cpf',
        entityId: 'CPF',
        institutionName: 'Itaú',
        accountName: 'Conta Corrente PF',
        accountType: 'checking',
        openingBalance: 1000,
        balance: 1000,
      },
      {
        id: 'acc-itau-cnpj',
        entityId: 'CNPJ',
        institutionName: 'Itaú',
        accountName: 'Conta Empresas MEI',
        accountType: 'business',
        openingBalance: 5000,
        balance: 5000,
      },
    ];

    // Multiple accounts in Itaú without matching document/account number -> flags ambiguity & asks user confirmation
    const ambiguous = identifySourceAccount({
      extracted: {
        bankCode: '341',
        requiresConfirmation: true,
      },
      fileName: 'extrato_itau.ofx',
      accounts,
      creditCards: [],
      accountExtensions: [],
      institutions: BUILTIN_INSTITUTIONS,
    });
    expect(ambiguous.institutionId).toBe('inst-itau');
    expect(ambiguous.ambiguousCandidateAccountIds).toHaveLength(2);
    expect(ambiguous.matchedAccountId).toBeUndefined();
    expect(ambiguous.requiresConfirmation).toBe(true);

    // Explicitly matched CNPJ document resolves cleanly to CNPJ candidate when disambiguated
    const withCnpj = identifySourceAccount({
      extracted: {
        bankCode: '341',
        holderNature: 'CNPJ',
        documentValid: true,
        maskedDocument: '**.222.333/0001-**',
        requiresConfirmation: true,
      },
      fileName: 'extrato_itau_pj.ofx',
      accounts,
      creditCards: [],
      accountExtensions: [],
      institutions: BUILTIN_INSTITUTIONS,
    });
    expect(withCnpj.holderNature).toBe('CNPJ');
    expect(withCnpj.matchedAccountId).toBe('acc-itau-cnpj');
    expect(withCnpj.ambiguousCandidateAccountIds).toBeUndefined();
  });

  it('classifies PIX, Boleto, Tarifa, Imposto, Cashback, Estorno, Aplicacao, Resgate (principal+yield+IR/IOF), CDI indexador, FII/Stocks, Card installment and Crypto', () => {
    const pixIn = classifyExtractedMovement({
      description: 'PIX RECEBIDO MARIA SILVA',
      amountCents: 35000,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(pixIn.movementType).toBe('PIX_RECEBIDO');
    expect(pixIn.operationType).toBe('PIX');

    const pixOut = classifyExtractedMovement({
      description: 'PIX ENVIADO FORNECEDOR',
      amountCents: 12000,
      direction: 'EXPENSE',
      currency: 'BRL',
    });
    expect(pixOut.movementType).toBe('PIX_ENVIADO');

    const cashback = classifyExtractedMovement({
      description: 'CASHBACK CARTAO INTER',
      amountCents: 1540,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(cashback.movementType).toBe('CASHBACK');

    const estorno = classifyExtractedMovement({
      description: 'ESTORNO COMPRA DUPLICADA',
      amountCents: 8990,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(estorno.movementType).toBe('ESTORNO');

    const cdbAplic = classifyExtractedMovement({
      description: 'APLICACAO AUTOMATICA CDB 100% CDI',
      amountCents: 200000,
      direction: 'EXPENSE',
      currency: 'BRL',
    });
    expect(cdbAplic.movementType).toBe('APLICACAO');
    expect(cdbAplic.investmentMeta?.indexer).toBe('CDI');
    expect(cdbAplic.investmentMeta?.indexerRateLabel).toContain('100%');

    const resgate = classifyExtractedMovement({
      description: 'RESGATE CDB PRINCIPAL R$ 1000,00 RENDIMENTO R$ 45,20 IR R$ 6,78 IOF R$ 1,10',
      amountCents: 103732,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(resgate.movementType).toBe('RESGATE');
    expect(resgate.investmentMeta?.principalCents).toBe(100000);
    expect(resgate.investmentMeta?.yieldCents).toBe(4520);
    expect(resgate.investmentMeta?.irCents).toBe(678);
    expect(resgate.investmentMeta?.iofCents).toBe(110);

    // Ambiguous standalone "CDI" mention -> flagged as Precisa de Identificacao without inventing %!
    const cdiDoubt = classifyExtractedMovement({
      description: 'CDI',
      amountCents: 5000,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(cdiDoubt.movementType).toBe('NAO_IDENTIFICADO');
    expect(cdiDoubt.needsIdentification).toBe(true);

    // Clear CDI yield -> RENDIMENTO with indexer CDI, never inventing a percentage
    const cdiYield = classifyExtractedMovement({
      description: 'RENDIMENTO LIQUIDO CONTA CDI',
      amountCents: 1234,
      direction: 'INCOME',
      currency: 'BRL',
    });
    expect(cdiYield.movementType).toBe('RENDIMENTO');
    expect(cdiYield.investmentMeta?.indexer).toBe('CDI');
    expect(cdiYield.investmentMeta?.indexerRateLabel).toBeUndefined();

    // Brokerage equity buy & dividend
    const stockBuy = classifyExtractedMovement({
      description: 'COMPRA PETR4 LOTE PADRAO',
      amountCents: 38000,
      direction: 'EXPENSE',
      currency: 'BRL',
      institutionCategory: 'CORRETORA_NACIONAL',
    });
    expect(stockBuy.movementType).toBe('COMPRA_ATIVO');
    expect(stockBuy.investmentMeta?.ticker).toBe('PETR4');

    const jcp = classifyExtractedMovement({
      description: 'JUROS SOBRE CAPITAL PROPRIO ITUB4',
      amountCents: 4250,
      direction: 'INCOME',
      currency: 'BRL',
      institutionCategory: 'CORRETORA_NACIONAL',
    });
    expect(jcp.movementType).toBe('PROVENTO');

    // Credit card installment & invoice payment
    const installment = classifyExtractedMovement({
      description: 'AMAZON BR PARC 03/10',
      amountCents: 19990,
      direction: 'EXPENSE',
      currency: 'BRL',
      institutionCategory: 'CARTAO_CREDITO',
    });
    expect(installment.cardMeta?.installmentCurrent).toBe(3);
    expect(installment.cardMeta?.installmentTotal).toBe(10);

    const invoicePay = classifyExtractedMovement({
      description: 'PAGAMENTO FATURA CARTAO NUBANK',
      amountCents: 150000,
      direction: 'EXPENSE',
      currency: 'BRL',
    });
    expect(invoicePay.movementType).toBe('FATURA_CARTAO');

    // Crypto fractional quantity
    const crypto = classifyExtractedMovement({
      description: 'COMPRA BTC 0.00451234',
      amountCents: 250000,
      direction: 'EXPENSE',
      currency: 'BRL',
      institutionCategory: 'EXCHANGE',
      rawCryptoMeta: {
        assetSymbol: 'BTC',
        quantity: 0.00451234,
        network: 'Bitcoin',
      },
    });
    expect(crypto.movementType).toBe('CRIPTO_OPERACAO');
    expect(crypto.cryptoMeta?.quantity).toBeCloseTo(0.00451234, 8);

    // Foreign currency preserved
    const fx = classifyExtractedMovement({
      description: 'DIVIDEND AAPL US$ 25.00',
      amountCents: 2500,
      direction: 'INCOME',
      currency: 'USD',
      institutionCategory: 'CORRETORA_INTERNACIONAL',
    });
    expect(fx.fxMeta?.originalCurrency).toBe('USD');
  });
});
