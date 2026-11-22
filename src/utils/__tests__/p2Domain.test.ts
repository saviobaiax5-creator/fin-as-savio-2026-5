import { describe, it, expect } from 'vitest';
import { executeInternalTransfer } from '../../domain/transactions/TransferService';
import {
  cancelUnconfirmedTransaction,
  restoreCancelledTransaction,
} from '../../domain/transactions/ReversalService';
import {
  calculatePeriodMetricsCents,
  deriveAccountBalances,
} from '../../domain/accounts/BalanceCalculator';
import { cents } from '../../domain/money/money';
import type { Account, Transaction } from '../../types';

const sampleAccounts: Account[] = [
  {
    id: 'acc-cpf',
    entityId: 'CPF',
    institutionName: 'Banco Inter',
    accountName: 'Conta Corrente',
    accountType: 'checking',
    openingBalanceCents: cents(100_000),
    openingBalance: 1000,
    balance: 1000,
  },
  {
    id: 'acc-cnpj',
    entityId: 'CNPJ',
    institutionName: 'Nubank PJ',
    accountName: 'Conta Empresa',
    accountType: 'business',
    openingBalanceCents: cents(50_000),
    openingBalance: 500,
    balance: 500,
  },
  {
    id: 'acc-archived',
    entityId: 'CPF',
    institutionName: 'Conta Antiga',
    accountName: 'Encerrada',
    accountType: 'savings',
    openingBalanceCents: cents(0),
    openingBalance: 0,
    balance: 0,
    archived: true,
  },
];

describe('TransferService & P2 Domain Lifecycle', () => {
  it('executes atomic paired internal transfer without distorting period income/expense metrics', () => {
    const res = executeInternalTransfer({
      originAccountId: 'acc-cpf',
      destinationAccountId: 'acc-cnpj',
      amountCents: cents(25_050),
      date: '2026-11-21',
      description: 'Aporte capital de giro',
      accounts: sampleAccounts,
      existingTransactions: [],
      idempotencyKey: 'xfer-test-1',
    });

    expect(res.debitTransaction.direction).toBe('EXPENSE');
    expect(res.creditTransaction.direction).toBe('INCOME');
    expect(res.debitTransaction.isInternalTransfer).toBe(true);
    expect(res.creditTransaction.isInternalTransfer).toBe(true);
    expect(res.debitTransaction.transferId).toBe(res.transferId);
    expect(res.creditTransaction.transferId).toBe(res.transferId);
    expect(res.auditEntry.action).toBe('TRANSFER_EXECUTED');
    expect(res.auditEntry.amountCents).toBe(25_050);

    const derived = deriveAccountBalances(sampleAccounts, res.updatedTransactions);
    const origin = derived.find((a) => a.id === 'acc-cpf')!;
    const dest = derived.find((a) => a.id === 'acc-cnpj')!;
    expect(origin.balanceCents).toBe(74_950);
    expect(dest.balanceCents).toBe(75_050);

    const metrics = calculatePeriodMetricsCents(res.updatedTransactions);
    expect(metrics.confirmedIncomeCents).toBe(0);
    expect(metrics.confirmedExpenseCents).toBe(0);
  });

  it('rejects transfers to same account, archived accounts, or duplicate idempotency keys', () => {
    expect(() =>
      executeInternalTransfer({
        originAccountId: 'acc-cpf',
        destinationAccountId: 'acc-cpf',
        amountCents: cents(1000),
        accounts: sampleAccounts,
        existingTransactions: [],
      })
    ).toThrow(/diferentes/i);

    expect(() =>
      executeInternalTransfer({
        originAccountId: 'acc-cpf',
        destinationAccountId: 'acc-archived',
        amountCents: cents(1000),
        accounts: sampleAccounts,
        existingTransactions: [],
      })
    ).toThrow(/arquivadas/i);

    const first = executeInternalTransfer({
      originAccountId: 'acc-cpf',
      destinationAccountId: 'acc-cnpj',
      amountCents: cents(500),
      accounts: sampleAccounts,
      existingTransactions: [],
      idempotencyKey: 'dup-key',
    });

    expect(() =>
      executeInternalTransfer({
        originAccountId: 'acc-cpf',
        destinationAccountId: 'acc-cnpj',
        amountCents: cents(500),
        accounts: sampleAccounts,
        existingTransactions: first.updatedTransactions,
        idempotencyKey: 'dup-key',
      })
    ).toThrow(/idempotência/i);
  });

  it('cancels unconfirmed transaction and restores it back to PENDING with audit log', () => {
    const pendingTx: Transaction = {
      id: 'tr-pend-1',
      entityId: 'CPF',
      accountId: 'acc-cpf',
      date: '2026-11-21',
      description: 'Compra prevista',
      category: 'Alimentação',
      account: 'Banco Inter · Conta Corrente',
      amountCents: cents(12_345),
      amount: 123.45,
      direction: 'EXPENSE',
      status: 'PENDING',
      origin: 'MANUAL',
    };

    const cancelled = cancelUnconfirmedTransaction({
      transaction: pendingTx,
      existingTransactions: [pendingTx],
      reason: 'Adiamento da compra',
    });

    expect(cancelled.cancelledTransaction.status).toBe('CANCELLED');
    expect(cancelled.auditEntry.action).toBe('TRANSACTION_CANCELLED');

    const restored = restoreCancelledTransaction({
      transaction: cancelled.cancelledTransaction,
      existingTransactions: cancelled.updatedTransactions,
      reason: 'Compra retomada',
    });

    expect(restored.restoredTransaction.status).toBe('PENDING');
    expect(restored.restoredTransaction.cancelledAt).toBeUndefined();
    expect(restored.auditEntry.action).toBe('TRANSACTION_RESTORED');
  });

  it('rejects restoring non-cancelled transactions', () => {
    const confirmedTx: Transaction = {
      id: 'tr-conf-1',
      entityId: 'CPF',
      accountId: 'acc-cpf',
      date: '2026-11-21',
      description: 'Salário',
      category: 'Salário',
      account: 'Banco Inter · Conta Corrente',
      amountCents: cents(100_000),
      amount: 1000,
      direction: 'INCOME',
      status: 'CONFIRMED',
      origin: 'MANUAL',
    };

    expect(() =>
      restoreCancelledTransaction({
        transaction: confirmedTx,
        existingTransactions: [confirmedTx],
      })
    ).toThrow(/cancelados/i);
  });
});
