import { describe, it, expect } from 'vitest';
import {
  calculateAccountBalances,
  filterTransactionsByPeriod,
  checkDuplicateTransaction,
  calculateBudget503020,
  parseCurrencyInput,
  detectInternalTransfer,
  calculateFinancialBalances,
  calculatePeriodMetricsCents,
} from '../financeCalculations';
import {
  cents,
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  sumMoney,
  parseMoneyInput,
  parseSignedMoneyInput,
  formatMoneyBRL,
  formatMoneyNumberBRL,
  getTransactionAmountCents,
} from '../../domain/money/money';
import {
  reverseConfirmedTransaction,
  cancelUnconfirmedTransaction,
} from '../../domain/transactions/ReversalService';
import { validateAndParseBoleto, calcMod10, calcMod11Bank } from '../boletoValidator';
import { sanitizeCellForSheet } from '../sheetGuard';
import { Transaction, Account } from '../../types';

function buildValid47Boleto(amountCents: number, factor: number): string {
  const bank = '237';
  const curr = '9';
  const fStr = String(factor).padStart(4, '0');
  const vStr = String(amountCents).padStart(10, '0');
  const free = '1234567890123456789012345'; // 25 digits
  const barcodeNoDv = bank + curr + fStr + vStr + free; // 43 digits
  const dvGeral = calcMod11Bank(barcodeNoDv);

  const c1 = bank + curr + free.slice(0, 5);
  const c2 = free.slice(5, 15);
  const c3 = free.slice(15, 25);

  return (
    c1 +
    String(calcMod10(c1)) +
    c2 +
    String(calcMod10(c2)) +
    c3 +
    String(calcMod10(c3)) +
    String(dvGeral) +
    fStr +
    vStr
  );
}

describe('FINANCE IA - Core Calculations & Validators', () => {
  it('calculates derived account balances strictly via accountId separating realized vs projected and ignoring cancelled', () => {
    const accounts: Account[] = [
      { id: 'acc-1', entityId: 'CPF', institutionName: 'Banco Inter', accountName: 'Conta Principal', accountType: 'checking', openingBalance: 1000, balance: 0 },
      { id: 'acc-2', entityId: 'CPF', institutionName: 'Banco Inter 2', accountName: 'Reserva', accountType: 'savings', openingBalance: 500, balance: 0 },
    ];
    const transactions: Transaction[] = [
      { id: 'tr-1', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-05', description: 'Salário', category: 'Salário', account: 'Banco Inter', amount: 4200, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: 'tr-2', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-10', description: 'Aluguel', category: 'Moradia', account: 'Banco Inter', amount: 600.15, direction: 'EXPENSE', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: 'tr-3', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-11', description: 'Cancelado', category: 'Outros', account: 'Banco Inter', amount: 999, direction: 'EXPENSE', status: 'CANCELLED', origin: 'MANUAL' },
      { id: 'tr-4', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-20', description: 'Fatura Pendente', category: 'Cartão', account: 'Banco Inter', amount: 200, direction: 'EXPENSE', status: 'PENDING', origin: 'MANUAL' },
      { id: 'tr-5', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-25', description: 'Bônus Planejado', category: 'Outros', account: 'Banco Inter', amount: 300, direction: 'INCOME', status: 'PLANNED', origin: 'MANUAL' },
    ];

    const updated = calculateAccountBalances(accounts, transactions);
    expect(updated[0].balanceCents).toBe(459985);
    expect(updated[0].balance).toBe(4599.85);
    expect(updated[0].projectedBalanceCents).toBe(469985);
    expect(updated[0].projectedBalance).toBe(4699.85);
    expect(updated[1].balanceCents).toBe(50000);
    expect(updated[1].balance).toBe(500);
  });

  it('parses Brazilian and standard currency strings without float errors', () => {
    expect(parseCurrencyInput('1.234,56')).toBe(1234.56);
    expect(parseCurrencyInput('245,90')).toBe(245.9);
    expect(parseCurrencyInput('150.00')).toBe(150);
  });

  it('filters transactions by period (YYYY-MM and YYYY)', () => {
    const transactions: Transaction[] = [
      { id: '1', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-05', description: 'A', category: 'A', account: 'A', amount: 100, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: '2', entityId: 'CPF', accountId: 'acc-1', date: '2026-10-15', description: 'B', category: 'B', account: 'A', amount: 200, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL' },
    ];

    expect(filterTransactionsByPeriod(transactions, '2026-11').map(t => t.id)).toEqual(['1']);
    expect(filterTransactionsByPeriod(transactions, '2026').length).toBe(2);
  });

  it('calculates 50/30/20 budget from real confirmed income excluding internal transfers and pending entries', () => {
    const trs: Transaction[] = [
      { id: '1', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-05', description: 'Salário', category: 'Salário', account: 'A', amount: 10000, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: '2', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-06', description: 'Transferência própria', category: 'Transferência', account: 'A', amount: 5000, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL', isInternalTransfer: true },
      { id: '3', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-07', description: 'Aluguel', category: 'Moradia', account: 'A', amount: 1200, direction: 'EXPENSE', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: '4', entityId: 'CPF', accountId: 'acc-1', date: '2026-11-12', description: 'Freela previsto', category: 'Outros', account: 'A', amount: 4000, direction: 'INCOME', status: 'PLANNED', origin: 'MANUAL' },
    ];

    const budget = calculateBudget503020(trs);
    expect(budget.realIncome).toBe(10000);
    expect(budget.needs).toBe(5000);
    expect(budget.wants).toBe(3000);
    expect(budget.savings).toBe(2000);
  });

  it('detects duplicate transactions with normalized description and Pix E2E externalId', () => {
    const existing: Transaction[] = [
      {
        id: '1',
        entityId: 'CPF',
        accountId: 'acc-1',
        date: '2026-11-05',
        description: 'Energia  Elétrica',
        category: 'Moradia',
        account: 'A',
        amount: 150,
        direction: 'EXPENSE',
        status: 'CONFIRMED',
        origin: 'MANUAL',
        externalId: 'E00416968202611051200ABC',
      },
    ];

    expect(checkDuplicateTransaction(existing, { date: '2026-11-05', amount: 150, description: 'energia eletrica' })).toBe(true);
    expect(checkDuplicateTransaction(existing, { date: '2026-11-06', amount: 150, description: 'energia eletrica' })).toBe(false);
    expect(
      checkDuplicateTransaction(existing, {
        date: '2026-11-09',
        amount: 999,
        description: 'Outro texto',
        externalId: 'e00416968202611051200abc',
      })
    ).toBe(true);
  });

  it('detects internal transfers between user accounts automatically', () => {
    const accounts: Account[] = [
      { id: 'acc-1', entityId: 'CPF', institutionName: 'Banco Inter', accountName: 'Conta Corrente', accountType: 'checking', openingBalance: 0, balance: 0 },
      { id: 'acc-3', entityId: 'CNPJ', institutionName: 'Nubank Empresa', accountName: 'Conta PJ MEI', accountType: 'business', openingBalance: 0, balance: 0 },
    ];

    expect(
      detectInternalTransfer(
        {
          operationType: 'PIX',
          originAccountHint: 'Banco Inter',
          destinationAccountHint: 'Nubank Empresa',
        },
        accounts
      )
    ).toBe(true);

    expect(
      detectInternalTransfer(
        {
          operationType: 'PIX',
          originAccountHint: 'Banco Inter',
          destinationAccountHint: 'Padaria Central',
        },
        accounts
      )
    ).toBe(false);
  });

  it('validates real FEBRABAN Mod 10 and Mod 11 boleto linha digitável and rejects tampered digits', () => {
    const validLine = buildValid47Boleto(15025, 1063);
    const parsed = validateAndParseBoleto(validLine);
    expect(parsed.isValid).toBe(true);
    expect(parsed.amount).toBe(150.25);
    expect(parsed.dueDate).toBeDefined();

    // Tamper 1 digit
    const tampered = validLine.slice(0, 5) + ((Number(validLine[5]) + 1) % 10) + validLine.slice(6);
    const invalid = validateAndParseBoleto(tampered);
    expect(invalid.isValid).toBe(false);
    expect(invalid.error).toBeDefined();
  });

  it('prevents spreadsheet formula injection in sheetGuard', () => {
    expect(sanitizeCellForSheet('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCellForSheet('+123')).toBe("'+123");
    expect(sanitizeCellForSheet('-123')).toBe("'-123");
    expect(sanitizeCellForSheet('@cmd')).toBe("'@cmd");
    expect(sanitizeCellForSheet('Normal Text')).toBe('Normal Text');
    expect(sanitizeCellForSheet(1500)).toBe(1500);
  });
});

describe('P0 Monetary Precision (money.ts), Balances & Reversals', () => {
  it('handles exact integer cents parsing, arithmetic, and BRL formatting without 0.1+0.2 drift', () => {
    expect(parseMoneyInput('R$ 0,01')).toBe(1);
    expect(parseMoneyInput('R$ 0,10')).toBe(10);
    expect(parseMoneyInput('R$ 1.234,56')).toBe(123456);
    expect(parseMoneyInput('R$ 999.999,99')).toBe(99999999);
    expect(parseSignedMoneyInput('-120,50')).toBe(-12050);

    const sum = addMoney(toCents(0.1), toCents(0.2));
    expect(sum).toBe(30);
    expect(fromCents(sum)).toBe(0.3);
    expect(subtractMoney(cents(1000), cents(355))).toBe(645);
    expect(formatMoneyNumberBRL(cents(123456))).toBe('1.234,56');
    expect(formatMoneyBRL(cents(123456))).toContain('1.234,56');

    expect(() => parseMoneyInput('')).toThrow();
    expect(() => parseMoneyInput('abc')).toThrow();
    expect(() => parseMoneyInput('-10,00')).toThrow();
    expect(() => parseMoneyInput('10,999')).toThrow();
  });

  it('sums 5,000 movements in centavos with zero rounding drift', () => {
    const entries = Array.from({ length: 5000 }, (_, i) =>
      i % 2 === 0 ? toCents(0.01) : toCents(19.99)
    );
    const total = sumMoney(entries);
    // 2500 * 1 + 2500 * 1999 = 2500 * 2000 = 5,000,000 cents = R$ 50.000,00
    expect(total).toBe(5000000);
    expect(fromCents(total)).toBe(50000);
  });

  it('separates confirmed vs pending, planned, and cancelled metrics cleanly', () => {
    const txs: Transaction[] = [
      { id: 'c1', entityId: 'CPF', accountId: 'a1', date: '2026-11-01', description: 'Salário', category: 'Salário', account: 'A', amountCents: cents(500000), amount: 5000, direction: 'INCOME', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: 'c2', entityId: 'CPF', accountId: 'a1', date: '2026-11-02', description: 'Mercado', category: 'Alimentação', account: 'A', amountCents: cents(35045), amount: 350.45, direction: 'EXPENSE', status: 'CONFIRMED', origin: 'MANUAL' },
      { id: 'p1', entityId: 'CPF', accountId: 'a1', date: '2026-11-03', description: 'Boleto Pendente', category: 'Moradia', account: 'A', amountCents: cents(80000), amount: 800, direction: 'EXPENSE', status: 'PENDING', origin: 'MANUAL' },
      { id: 'pl1', entityId: 'CPF', accountId: 'a1', date: '2026-11-04', description: 'Meta Planejada', category: 'Outros', account: 'A', amountCents: cents(100000), amount: 1000, direction: 'INCOME', status: 'PLANNED', origin: 'MANUAL' },
      { id: 'x1', entityId: 'CPF', accountId: 'a1', date: '2026-11-05', description: 'Cancelado', category: 'Outros', account: 'A', amountCents: cents(999999), amount: 9999.99, direction: 'EXPENSE', status: 'CANCELLED', origin: 'MANUAL' },
      { id: 't1', entityId: 'CPF', accountId: 'a1', date: '2026-11-06', description: 'Transferência Interna', category: 'Transferência', account: 'A', amountCents: cents(150000), amount: 1500, direction: 'EXPENSE', status: 'CONFIRMED', origin: 'MANUAL', isInternalTransfer: true },
    ];

    const metrics = calculatePeriodMetricsCents(txs);
    expect(metrics.confirmedIncomeCents).toBe(500000);
    expect(metrics.confirmedExpenseCents).toBe(35045);
    expect(metrics.realizedNetCents).toBe(464955);
    expect(metrics.pendingExpenseCents).toBe(80000);
    expect(metrics.plannedIncomeCents).toBe(100000);
    expect(metrics.projectedNetCents).toBe(484955);

    const balances = calculateFinancialBalances(100000, txs);
    // Realized: 1000.00 + 5000.00 - 350.45 - 1500.00 (internal transfer affects account cash!) = 4149.55
    expect(balances.realizedBalanceCents).toBe(414955);
    // Projected: 4149.55 - 800.00 + 1000.00 = 4349.55
    expect(balances.projectedBalanceCents).toBe(434955);
  });

  it('reverses confirmed transactions via inverse entry preserving audit trail and cancelling unconfirmed safely', () => {
    const original: Transaction = {
      id: 'tx-orig-1',
      entityId: 'CPF',
      accountId: 'acc-1',
      date: '2026-11-10',
      description: 'Compra duplicada',
      category: 'Alimentação',
      account: 'Banco Inter',
      amountCents: cents(12590),
      amount: 125.9,
      direction: 'EXPENSE',
      status: 'CONFIRMED',
      origin: 'MANUAL',
    };

    const pendingTx: Transaction = {
      id: 'tx-pend-1',
      entityId: 'CPF',
      accountId: 'acc-1',
      date: '2026-11-12',
      description: 'Agendamento futuro',
      category: 'Moradia',
      account: 'Banco Inter',
      amountCents: cents(50000),
      amount: 500,
      direction: 'PENDING' === 'PENDING' ? 'EXPENSE' : 'INCOME',
      status: 'PENDING',
      origin: 'MANUAL',
    };

    const revRes = reverseConfirmedTransaction({
      transaction: original,
      existingTransactions: [original, pendingTx],
      reason: 'Lançamento duplicado no extrato',
    });

    expect(revRes.reversalTransaction.direction).toBe('INCOME');
    expect(getTransactionAmountCents(revRes.reversalTransaction)).toBe(12590);
    expect(revRes.reversalTransaction.reversedTransactionId).toBe(original.id);
    expect(revRes.reversalRecord.originalTransactionId).toBe(original.id);
    expect(revRes.auditEntry.action).toBe('TRANSACTION_REVERSED');

    // Realized account balance returns to opening balance after reversal
    const balAfterReversal = calculateFinancialBalances(100000, revRes.updatedTransactions);
    expect(balAfterReversal.realizedBalanceCents).toBe(100000);

    // Duplicate reversal or empty reason is blocked
    const updatedOriginal = revRes.updatedTransactions.find((t) => t.id === original.id)!;
    expect(() =>
      reverseConfirmedTransaction({
        transaction: updatedOriginal,
        existingTransactions: revRes.updatedTransactions,
        reason: 'Segunda tentativa',
      })
    ).toThrow();
    expect(() =>
      reverseConfirmedTransaction({
        transaction: original,
        existingTransactions: [original],
        reason: '   ',
      })
    ).toThrow();

    // Unconfirmed cancellation
    expect(() =>
      cancelUnconfirmedTransaction({
        transaction: original,
        existingTransactions: [original],
        reason: 'Não pode cancelar confirmado',
      })
    ).toThrow();

    const cancelRes = cancelUnconfirmedTransaction({
      transaction: pendingTx,
      existingTransactions: [original, pendingTx],
      reason: 'Cancelado pelo usuário',
    });
    expect(cancelRes.cancelledTransaction.status).toBe('CANCELLED');
    expect(cancelRes.auditEntry.action).toBe('TRANSACTION_CANCELLED');
  });
});

