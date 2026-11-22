import { describe, it, expect } from 'vitest';
import { cents } from '../../money/money';
import { buildExtractionBatchFromParseResult } from '../extractionOrchestrator';
import {
  commitApprovedExtractionMovements,
  lookupTransactionTraceability,
} from '../extractionIntegrationService';
import { BUILTIN_INSTITUTIONS } from '../institutionRegistry';
import { computeFinancialConsolidation } from '../consolidationEngine';
import { DEFAULT_CONSOLIDATION_PREFS } from '../../../services/extractionStorage';
import {
  calculateAccountBalances,
  calculatePeriodMetricsCents,
} from '../../../utils/financeCalculations';
import type { Account, Asset, CreditCard, Debt, Transaction } from '../../../types';
import type { ParseResultPayload } from '../../../types/extractions';

const baseAccounts: Account[] = [
  {
    id: 'acc-cpf-nubank',
    entityId: 'CPF',
    institutionName: 'Nubank',
    accountName: 'Conta Pessoal',
    accountType: 'checking',
    openingBalance: 1000,
    openingBalanceCents: cents(100000),
    balance: 1000,
    balanceCents: cents(100000),
  },
  {
    id: 'acc-cnpj-inter',
    entityId: 'CNPJ',
    institutionName: 'Banco Inter',
    accountName: 'Conta PJ',
    accountType: 'business',
    openingBalance: 5000,
    openingBalanceCents: cents(500000),
    balance: 5000,
    balanceCents: cents(500000),
  },
];

describe('Extractions — Deduplication, Balance Reconciliation, Governance, Traceability & Consolidation', () => {
  it('enforces zero auto-approval, idempotent re-import (no duplicates), partial retry safety, and full traceability', () => {
    const parsePayload: ParseResultPayload = {
      format: 'OFX',
      parseSource: 'LOCAL',
      identifiedAccount: {
        bankCode: '260',
        bankName: 'Nubank',
        requiresConfirmation: true,
      },
      openingBalanceCents: cents(100000),
      reportedEndingBalanceCents: cents(120000), // intentional divergence test (1000 + 500 + 25 - 150 = 1375 != 1200)
      warnings: [],
      errors: [],
      requiresManualReview: false,
      rows: [
        {
          date: '2026-11-05',
          description: 'PIX RECEBIDO FREELANCE',
          amountSignedCents: cents(50000),
          currency: 'BRL',
          bankTransactionId: 'FITID-NUBANK-1',
          rawRowSnapshot: { memo: 'PIX RECEBIDO FREELANCE' },
        },
        {
          date: '2026-11-06',
          description: 'APLICACAO CDB 100% CDI',
          amountSignedCents: cents(-15000),
          currency: 'BRL',
          bankTransactionId: 'FITID-NUBANK-2',
          rawRowSnapshot: { memo: 'APLICACAO CDB 100% CDI' },
        },
        {
          date: '2026-11-07',
          description: 'CDI',
          amountSignedCents: cents(2500),
          currency: 'BRL',
          bankTransactionId: 'FITID-NUBANK-3',
          rawRowSnapshot: { memo: 'CDI' },
        },
      ],
    };

    const batch1 = buildExtractionBatchFromParseResult({
      batchId: 'batch-test-1',
      fileName: 'nubank_nov.ofx',
      fileSizeBytes: 1024,
      contentFingerprint: 'sha-1',
      parseResult: parsePayload,
      accounts: baseAccounts,
      creditCards: [],
      transactions: [],
      previousBatches: [],
      institutions: BUILTIN_INSTITUTIONS,
      accountExtensions: [],
      categoryRules: [],
      extractionRules: [],
    });

    // Balance reconciliation warns divergence WITHOUT touching official account balance
    expect(batch1.balanceSummary.hasDivergence).toBe(true);
    expect(batch1.balanceSummary.calculatedEndingBalanceCents).toBe(137500);
    expect(batch1.balanceSummary.reportedEndingBalanceCents).toBe(120000);
    expect(calculateAccountBalances(baseAccounts, [])[0].balance).toBe(1000);

    // Zero auto-approval: attempting commit BEFORE user approves integrates 0 records!
    const preApprovalCommit = commitApprovedExtractionMovements({
      batch: batch1,
      accounts: baseAccounts,
      transactions: [],
      assets: [],
      creditCards: [],
    });
    expect(preApprovalCommit.integratedCount).toBe(0);
    expect(preApprovalCommit.newTransactions).toHaveLength(0);

    // User explicitly approves ONLY first 2 items (leaves ambiguous "CDI" pending identification!)
    const approvedBatch = {
      ...batch1,
      confirmedAccountId: 'acc-cpf-nubank',
      confirmedEntityId: 'CPF' as const,
      movements: batch1.movements.map((m, idx) =>
        idx < 2
          ? {
              ...m,
              entityId: 'CPF' as const,
              targetAccountId: 'acc-cpf-nubank',
              reviewStatus: 'APROVADO' as const,
            }
          : m
      ),
    };

    const commitRes = commitApprovedExtractionMovements({
      batch: approvedBatch,
      accounts: baseAccounts,
      transactions: [],
      assets: [],
      creditCards: [],
    });

    expect(commitRes.integratedCount).toBe(2);
    expect(commitRes.newTransactions).toHaveLength(2);
    expect(commitRes.newAssets).toHaveLength(1); // CDB asset created
    expect(commitRes.batch.status).toBe('APROVADO_PARCIAL');

    // Verify Aplicacao did NOT inflate operational consumption expense!
    const metrics = calculatePeriodMetricsCents(commitRes.newTransactions);
    expect(metrics.confirmedIncomeCents).toBe(50000);
    expect(metrics.confirmedExpenseCents).toBe(0); // Aplicacao is patrimonial transfer, NOT expense!

    // Retrying the exact same commit or re-importing the same OFX produces ZERO duplicates
    const retryRes = commitApprovedExtractionMovements({
      batch: approvedBatch,
      accounts: baseAccounts,
      transactions: commitRes.newTransactions,
      assets: commitRes.newAssets,
      creditCards: [],
    });
    expect(retryRes.newTransactions).toHaveLength(0);
    expect(retryRes.skippedDuplicateCount).toBe(2);

    const batchReimport = buildExtractionBatchFromParseResult({
      batchId: 'batch-test-2',
      fileName: 'nubank_nov.ofx',
      fileSizeBytes: 1024,
      contentFingerprint: 'sha-1',
      parseResult: parsePayload,
      accounts: baseAccounts,
      creditCards: [],
      transactions: commitRes.newTransactions,
      previousBatches: [commitRes.batch],
      institutions: BUILTIN_INSTITUTIONS,
      accountExtensions: [],
      categoryRules: [],
      extractionRules: [],
    });
    expect(batchReimport.movements[0].duplicateStatus).toBe('DUPLICIDADE_CONFIRMADA');
    expect(batchReimport.movements[0].reviewStatus).toBe('DUPLICIDADE');

    // Full traceability ("Rastrear movimentação")
    const trace = lookupTransactionTraceability({
      transaction: commitRes.newTransactions[0],
      batches: [commitRes.batch],
      institutions: BUILTIN_INSTITUTIONS,
    });
    expect(trace).not.toBeNull();
    expect(trace?.batch.fileName).toBe('nubank_nov.ofx');
    expect(trace?.movement.bankTransactionId).toBe('FITID-NUBANK-1');
  });

  it('computes Consolidação Financeira across modes with FX conversion, separating liquidity, investments, crypto, debts, and excluding card limits & closed accounts', () => {
    const accounts: Account[] = [
      ...baseAccounts,
      {
        id: 'acc-usd-avenue',
        entityId: 'CPF',
        institutionName: 'Avenue',
        accountName: 'Conta Internacional USD',
        accountType: 'investment',
        openingBalance: 100, // USD 100
        openingBalanceCents: cents(10000),
        balance: 100,
        balanceCents: cents(10000),
      },
      {
        id: 'acc-closed',
        entityId: 'CPF',
        institutionName: 'Banco Original',
        accountName: 'Encerrada',
        accountType: 'checking',
        openingBalance: 999,
        openingBalanceCents: cents(99900),
        balance: 999,
        balanceCents: cents(99900),
        archived: true,
      },
    ];

    const cards: CreditCard[] = [
      {
        id: 'card-1',
        entityId: 'CPF',
        institutionName: 'Nubank',
        cardName: 'Ultravioleta',
        last4: '4321',
        limit: 25000, // MUST NEVER count as available balance or debt!
        closingDay: 10,
        dueDay: 17,
        currentInvoiceAmount: 800,
        status: 'OPEN',
      },
    ];

    const assets: Asset[] = [
      {
        id: 'ast-cdb',
        entityId: 'CPF',
        assetType: 'Renda Fixa',
        institutionName: 'Nubank',
        description: 'CDB 100% CDI',
        currentValue: 2000,
        valuationDate: '2026-11-20',
      },
      {
        id: 'ast-btc',
        entityId: 'CPF',
        assetType: 'Outros',
        institutionName: 'Binance',
        description: 'Bitcoin BTC',
        currentValue: 1500,
        valuationDate: '2026-11-20',
      },
    ];

    const debts: Debt[] = [
      {
        id: 'debt-1',
        entityId: 'CPF',
        creditorName: 'Financiamento',
        description: 'Empréstimo',
        originalAmount: 5000,
        outstandingAmount: 1200,
        dueDay: 20,
        status: 'ACTIVE',
      },
    ];

    const txs: Transaction[] = [];

    const summary = computeFinancialConsolidation({
      accounts,
      creditCards: cards,
      assets,
      debts,
      transactions: txs,
      accountExtensions: [
        {
          id: 'acc-usd-avenue',
          targetKind: 'ACCOUNT',
          institutionId: 'inst-avenue',
          institutionCategory: 'CORRETORA_INTERNACIONAL',
          holderEntity: 'CPF',
          currency: 'USD',
          status: 'ACTIVE',
          updatedAt: '2026-11-20T00:00:00.000Z',
        },
        {
          id: 'acc-closed',
          targetKind: 'ACCOUNT',
          institutionId: 'inst-other',
          institutionCategory: 'BANCO_DIGITAL',
          holderEntity: 'CPF',
          currency: 'BRL',
          status: 'CLOSED',
          updatedAt: '2026-11-20T00:00:00.000Z',
        },
      ],
      institutions: BUILTIN_INSTITUTIONS,
      preferences: {
        ...DEFAULT_CONSOLIDATION_PREFS,
        usdToBrlRate: 5.5, // USD 100 = R$ 550,00
      },
      period: 'ALL',
    });

    // Disponibilidades = Nubank R$ 1000 + Inter PJ R$ 5000 + Avenue USD 100 * 5.5 (550) = R$ 6550 (Closed account excluded!)
    expect(summary.disponibilidadesCents).toBe(655000);
    expect(summary.disponibilidadeCorretorasCents).toBe(55000);
    // Investimentos = CDB R$ 2000
    expect(summary.investimentosCents).toBe(200000);
    // Cripto = Binance BTC R$ 1500
    expect(summary.criptoCents).toBe(150000);
    // Faturas & Dívidas = Fatura R$ 800 + Dívida R$ 1200 = R$ 2000 (Card limit 25000 NOT included!)
    expect(summary.obrigacoesTotaisCents).toBe(200000);
    // Patrimônio Bruto = 6550 + 2000 + 1500 = 10050
    expect(summary.patrimonioBrutoCents).toBe(1005000);
    // Patrimônio Líquido = 10050 - 2000 = 8050
    expect(summary.patrimonioLiquidoCents).toBe(805000);

    // Individual mode isolates only selected account
    const individual = computeFinancialConsolidation({
      accounts,
      creditCards: cards,
      assets,
      debts,
      transactions: txs,
      accountExtensions: [],
      institutions: BUILTIN_INSTITUTIONS,
      preferences: {
        ...DEFAULT_CONSOLIDATION_PREFS,
        defaultIndividualId: 'acc-cpf-nubank',
      },
      modeOverride: 'INDIVIDUAL',
      period: 'ALL',
    });
    expect(individual.disponibilidadesCents).toBe(100000);

    // Category filter isolates only CORRETORA_INTERNACIONAL (USD 100 * 5.50 = 55000)
    const intlOnly = computeFinancialConsolidation({
      accounts,
      creditCards: cards,
      assets,
      debts,
      transactions: txs,
      accountExtensions: [
        {
          id: 'acc-usd-avenue',
          targetKind: 'ACCOUNT',
          institutionId: 'inst-avenue',
          institutionCategory: 'CORRETORA_INTERNACIONAL',
          holderEntity: 'CPF',
          currency: 'USD',
          status: 'ACTIVE',
          updatedAt: '2026-11-20T00:00:00.000Z',
        },
      ],
      institutions: BUILTIN_INSTITUTIONS,
      preferences: {
        ...DEFAULT_CONSOLIDATION_PREFS,
        selectedCategories: ['CORRETORA_INTERNACIONAL'],
      },
      modeOverride: 'CATEGORY',
      period: 'ALL',
    });
    expect(intlOnly.disponibilidadesCents).toBe(55000); // USD 100 * 5.50
    expect(intlOnly.investimentosCents).toBe(0);
  });
});
