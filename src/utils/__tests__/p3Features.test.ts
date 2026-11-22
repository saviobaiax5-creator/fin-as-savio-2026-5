import { describe, it, expect } from 'vitest';
import { categorizeTransactionDescription } from '../../domain/transactions/CategorizationService';
import { reconcileImportBatch } from '../../domain/transactions/ImportReconciliationService';
import { buildCashFlowProjection } from '../../domain/planning/CashFlowProjectionService';
import { cents } from '../../domain/money/money';
import {
  applyBackupDataset,
  buildFullBackup,
  parseAndValidateBackup,
} from '../../services/backupService';
import type { Account, Boleto, CategoryRule, Transaction } from '../../types';

describe('P3 Features — Auto-Categorization, Statement Settlement & Cash Flow Projection', () => {
  it('categorizes descriptions using built-in Portuguese rules and lets custom rules take precedence', () => {
    const customRules: CategoryRule[] = [
      {
        id: 'rule-1',
        keyword: 'Mercado Livre',
        category: 'Insumos / Produção',
        createdAt: '2026-11-21T00:00:00.000Z',
      },
    ];

    const customMatch = categorizeTransactionDescription({
      description: 'Compra MERCADO LIVRE *Papelaria',
      direction: 'EXPENSE',
      customRules,
    });
    expect(customMatch.category).toBe('Insumos / Produção');
    expect(customMatch.isCustomRule).toBe(true);

    expect(
      categorizeTransactionDescription({
        description: 'IFOOD *RESTAURANTE',
        direction: 'EXPENSE',
        customRules,
      }).category
    ).toBe('Alimentação');

    expect(
      categorizeTransactionDescription({
        description: 'PAGTO DAS SIMPLES NACIONAL',
        direction: 'EXPENSE',
        customRules,
      }).category
    ).toBe('Impostos / DAS');

    expect(
      categorizeTransactionDescription({
        description: 'CREDITO SALARIO MENSAL',
        direction: 'INCOME',
        customRules,
      }).category
    ).toBe('Salário');
  });

  it('reconciles imported statement lines against matching PENDING/PLANNED transactions within 5 days', () => {
    const existing: Transaction[] = [
      {
        id: 'tr-scheduled-1',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-10',
        description: 'Aluguel Apartamento (2/12)',
        category: 'Moradia',
        account: 'Inter · CC',
        amountCents: cents(180_000),
        amount: 1800,
        direction: 'EXPENSE',
        status: 'PENDING',
        origin: 'MANUAL',
      },
      {
        id: 'tr-scheduled-far',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-28',
        description: 'Internet Fibra',
        category: 'Moradia',
        account: 'Inter · CC',
        amountCents: cents(12_000),
        amount: 120,
        direction: 'EXPENSE',
        status: 'PLANNED',
        origin: 'MANUAL',
      },
    ];

    const incoming: Omit<Transaction, 'id'>[] = [
      // Settles Aluguel on 2026-11-12 (2 days after 2026-11-10)
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-12',
        description: 'TED IMOBILIARIA ALUGUEL',
        category: 'Moradia',
        account: 'Inter · CC',
        amountCents: cents(180_000),
        amount: 1800,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
      },
      // Too far (>5 days from 2026-11-28), should be imported as new transaction
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-15',
        description: 'Internet Fibra',
        category: 'Moradia',
        account: 'Inter · CC',
        amountCents: cents(12_000),
        amount: 120,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
      },
    ];

    const result = reconcileImportBatch(incoming, existing);
    expect(result.reconciledTransactions).toHaveLength(1);
    expect(result.reconciledTransactions[0].id).toBe('tr-scheduled-1');
    expect(result.reconciledTransactions[0].status).toBe('CONFIRMED');
    expect(result.reconciledTransactions[0].date).toBe('2026-11-12');
    expect(result.reconciledTransactions[0].description).toBe('Aluguel Apartamento (2/12)');
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].description).toBe('Internet Fibra');
  });

  it('builds 30/60/90-day cash flow projection and flags lowest negative balance date', () => {
    const accounts: Account[] = [
      {
        id: 'acc-1',
        entityId: 'CPF',
        institutionName: 'Inter',
        accountName: 'CC',
        accountType: 'checking',
        openingBalanceCents: cents(50_000),
        openingBalance: 500,
        balanceCents: cents(50_000),
        balance: 500,
      },
      {
        id: 'acc-arch',
        entityId: 'CPF',
        institutionName: 'Antigo',
        accountName: 'CC',
        accountType: 'checking',
        openingBalanceCents: cents(900_000),
        openingBalance: 9000,
        balanceCents: cents(900_000),
        balance: 9000,
        archived: true,
      },
    ];

    const transactions: Transaction[] = [
      {
        id: 'tx-salary',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-12-05',
        description: 'Salário Dezembro',
        category: 'Salário',
        account: 'Inter · CC',
        amountCents: cents(300_000),
        amount: 3000,
        direction: 'INCOME',
        status: 'PLANNED',
        origin: 'MANUAL',
      },
      {
        id: 'tx-xfer-ignored',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-26',
        description: 'Transferência interna',
        category: 'Transferência',
        account: 'Inter · CC',
        amountCents: cents(200_000),
        amount: 2000,
        direction: 'EXPENSE',
        status: 'PENDING',
        origin: 'MANUAL',
        isInternalTransfer: true,
      },
      {
        id: 'tx-90d-only',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2027-01-15',
        description: 'IPVA Cota Única',
        category: 'Impostos / DAS',
        account: 'Inter · CC',
        amountCents: cents(80_000),
        amount: 800,
        direction: 'EXPENSE',
        status: 'PLANNED',
        origin: 'MANUAL',
      },
    ];

    const boletos: Boleto[] = [
      {
        id: 'bol-1',
        beneficiario: 'Energia Elétrica',
        pagador: 'CPF',
        instituicao: 'Enel',
        linhaDigitavel: '00000000000000000000000000000000000000000000000',
        vencimento: '2026-11-28',
        valorOriginal: 800,
        descricao: 'Luz',
        status: 'PENDING',
        entityId: 'CPF',
        category: 'Moradia',
      },
    ];

    const proj30 = buildCashFlowProjection({
      accounts,
      transactions,
      boletos,
      scope: 'CPF',
      horizonDays: 30,
      startDate: '2026-11-21',
    });

    expect(proj30.startingBalanceCents).toBe(50_000);
    expect(proj30.events).toHaveLength(2);
    // 2026-11-28 boleto -800 => 500 - 800 = -300 (-30_000 cents)
    expect(proj30.lowestBalanceCents).toBe(-30_000);
    expect(proj30.lowestBalanceDate).toBe('2026-11-28');
    // 2026-12-05 salary +3000 => -300 + 3000 = 2700 (270_000 cents)
    expect(proj30.projectedEndBalanceCents).toBe(270_000);
    expect(proj30.negativeAlertEventsCount).toBe(1);

    const proj90 = buildCashFlowProjection({
      accounts,
      transactions,
      boletos,
      scope: 'CPF',
      horizonDays: 90,
      startDate: '2026-11-21',
    });
    expect(proj90.events).toHaveLength(3);
    expect(proj90.projectedEndBalanceCents).toBe(190_000);
  });

  it('persists and merges categoryRules in backup payloads cleanly', () => {
    const rules: CategoryRule[] = [
      {
        id: 'rule-bkp',
        keyword: 'Netflix',
        category: 'Outros',
        createdAt: '2026-11-21T00:00:00.000Z',
      },
    ];

    const dataset = {
      accounts: [],
      transactions: [],
      creditCards: [],
      boletos: [],
      debts: [],
      assets: [],
      documents: [],
      categoryRules: rules,
    };

    const backup = buildFullBackup(dataset);
    const parsed = parseAndValidateBackup(JSON.stringify(backup));
    expect(parsed.valid).toBe(true);
    expect(parsed.payload?.data.categoryRules).toHaveLength(1);

    const merged = applyBackupDataset(
      { ...dataset, categoryRules: [] },
      parsed.payload!.data,
      'merge'
    );
    expect(merged.next.categoryRules).toHaveLength(1);
    expect(merged.addedTotal).toBe(1);
  });
});
