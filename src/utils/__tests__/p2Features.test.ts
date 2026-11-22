import { describe, it, expect } from 'vitest';
import { reconcileImportBatch } from '../../domain/transactions/ImportReconciliationService';
import {
  generateMonthlyRecurrenceBatch,
  splitCentsAcrossInstallments,
} from '../../domain/transactions/RecurrenceService';
import {
  analyzeCategoryBudgets,
  calculateProjected503020,
} from '../../domain/planning/BudgetAnalyzer';
import { addMonthsLocal } from '../dateUtils';
import { cents, ZERO_CENTS } from '../../domain/money/money';
import {
  applyBackupDataset,
  buildFullBackup,
  parseAndValidateBackup,
} from '../../services/backupService';
import type { CategoryBudget, Transaction } from '../../types';

const makeTx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tr-1',
  entityId: 'CPF',
  accountId: 'acc-1',
  date: '2026-11-10',
  description: 'Supermercado Central',
  category: 'Alimentação',
  account: 'Inter · CC',
  amountCents: cents(15_000),
  amount: 150,
  direction: 'EXPENSE',
  status: 'CONFIRMED',
  origin: 'MANUAL',
  ...overrides,
});

describe('P2 Features — Import Reconciliation, Recurrence & Budget Alerts', () => {
  it('deduplicates intra-batch and cross-ledger imports while allowing re-import after cancellation', () => {
    const existing: Transaction[] = [
      makeTx({ id: 'tr-existing', externalId: 'E2E-100', amountCents: cents(20_000), amount: 200 }),
      makeTx({
        id: 'tr-cancelled',
        date: '2026-11-12',
        description: 'Assinatura Cancelada',
        amountCents: cents(4_990),
        amount: 49.9,
        status: 'CANCELLED',
      }),
    ];

    const incoming: Omit<Transaction, 'id'>[] = [
      // Duplicate of existing via externalId
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-10',
        description: 'Supermercado Central',
        category: 'Alimentação',
        account: 'Inter · CC',
        amountCents: cents(20_000),
        amount: 200,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
        externalId: 'e2e-100',
      },
      // New valid item
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-11',
        description: 'Padaria Bairro',
        category: 'Alimentação',
        account: 'Inter · CC',
        amountCents: cents(3_250),
        amount: 32.5,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
      },
      // Intra-batch duplicate of Padaria Bairro
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-11',
        description: '  Padaria   Bairro ',
        category: 'Alimentação',
        account: 'Inter · CC',
        amountCents: cents(3_250),
        amount: 32.5,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
      },
      // Matches a CANCELLED transaction, so it should be accepted cleanly
      {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-12',
        description: 'Assinatura Cancelada',
        category: 'Outros',
        account: 'Inter · CC',
        amountCents: cents(4_990),
        amount: 49.9,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'IMPORT',
      },
    ];

    const res = reconcileImportBatch(incoming, existing);
    expect(res.accepted).toHaveLength(2);
    expect(res.skippedDuplicatesCount).toBe(2);
    expect(res.accepted[0].idempotencyKey).toBeTruthy();
    expect(res.accepted[0].amountCents).toBe(3_250);
  });

  it('clamps month-end calendar dates across non-leap, leap, and year boundaries', () => {
    expect(addMonthsLocal('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsLocal('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsLocal('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonthsLocal('2026-01-31', 2)).toBe('2026-03-31');
  });

  it('splits indivisible cents across installments without cent drift and generates future statuses', () => {
    const parts = splitCentsAcrossInstallments(cents(10_000), 3);
    expect(parts).toEqual([cents(3334), cents(3333), cents(3333)]);
    expect(parts.reduce((acc, v) => acc + v, 0)).toBe(10_000);

    const batch = generateMonthlyRecurrenceBatch({
      baseTransaction: {
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-01-31',
        description: 'Notebook Trabalho',
        category: 'Insumos / Produção',
        account: 'Inter · CC',
        amountCents: cents(10_000),
        amount: 100,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'MANUAL',
      },
      occurrences: 3,
      mode: 'INSTALLMENT',
      amountMode: 'SPLIT_TOTAL',
      futureStatus: 'PLANNED',
      seriesId: 'series-1',
    });

    expect(batch).toHaveLength(3);
    expect(batch.map((t) => t.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(batch.map((t) => t.status)).toEqual(['CONFIRMED', 'PLANNED', 'PLANNED']);
    expect(batch.map((t) => t.description)).toEqual([
      'Notebook Trabalho (1/3)',
      'Notebook Trabalho (2/3)',
      'Notebook Trabalho (3/3)',
    ]);
    expect(batch.reduce((acc, t) => acc + (t.amountCents ?? ZERO_CENTS), 0)).toBe(10_000);
    expect(new Set(batch.map((t) => t.idempotencyKey)).size).toBe(3);
  });

  it('evaluates category budget alert levels and projected vs realized 50/30/20 metrics', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 't-inc',
        direction: 'INCOME',
        category: 'Salário',
        amountCents: cents(500_000),
        amount: 5000,
        status: 'CONFIRMED',
      }),
      makeTx({
        id: 't-food-1',
        category: 'Alimentação',
        amountCents: cents(80_000),
        amount: 800,
        status: 'CONFIRMED',
      }),
      makeTx({
        id: 't-food-2',
        category: 'Alimentação',
        amountCents: cents(30_000),
        amount: 300,
        status: 'PENDING',
      }),
      makeTx({
        id: 't-xfer',
        category: 'Transferência',
        amountCents: cents(200_000),
        amount: 2000,
        status: 'CONFIRMED',
        isInternalTransfer: true,
      }),
    ];

    const budgets: CategoryBudget[] = [
      {
        id: 'bdg-1',
        entityScope: 'CPF',
        category: 'Alimentação',
        limitCents: cents(100_000),
        limitAmount: 1000,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const realizedOnly = analyzeCategoryBudgets({
      budgets,
      transactions: txs,
      scope: 'CPF',
      period: '2026-11',
      includeProjected: false,
    });
    expect(realizedOnly[0].spentCents).toBe(80_000);
    expect(realizedOnly[0].utilizationPct).toBe(80);
    expect(realizedOnly[0].alertLevel).toBe('WARNING');

    const withProjected = analyzeCategoryBudgets({
      budgets,
      transactions: txs,
      scope: 'CPF',
      period: '2026-11',
      includeProjected: true,
    });
    expect(withProjected[0].spentCents).toBe(110_000);
    expect(withProjected[0].remainingCents).toBe(-10_000);
    expect(withProjected[0].alertLevel).toBe('EXCEEDED');

    const proj503020 = calculateProjected503020({
      transactions: txs,
      includeProjected: true,
      needsCategories: new Set(['Alimentação']),
    });
    expect(proj503020.baseIncomeCents).toBe(500_000);
    expect(proj503020.needsSpentCents).toBe(110_000);
    expect(proj503020.wantsSpentCents).toBe(0);
  });

  it('preserves budgets cleanly in backup export/parse/merge cycles', () => {
    const budgets: CategoryBudget[] = [
      {
        id: 'bdg-test',
        entityScope: 'CONSOLIDATED',
        category: 'Moradia',
        limitCents: cents(250_000),
        limitAmount: 2500,
        updatedAt: '2026-11-21T00:00:00.000Z',
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
      budgets,
    };

    const backup = buildFullBackup(dataset);
    const parsed = parseAndValidateBackup(JSON.stringify(backup));
    expect(parsed.valid).toBe(true);
    expect(parsed.payload?.data.budgets).toHaveLength(1);
    expect(parsed.payload?.data.budgets?.[0].limitCents).toBe(250_000);

    const merged = applyBackupDataset(
      { ...dataset, budgets: [] },
      parsed.payload!.data,
      'merge'
    );
    expect(merged.next.budgets).toHaveLength(1);
    expect(merged.addedTotal).toBe(1);
  });
});
