import type { Account, Asset, CreditCard, Transaction } from '../../types';
import type {
  ExtractedMovement,
  ExtractionBatch,
  ExtractionIntegrationCommitResult,
  InstitutionProfile,
  TraceabilityLookupResult,
} from '../../types/extractions';
import { addMoney, cents, fromCents, subtractMoney, toCents } from '../money/money';
import type { MoneyCents } from '../money/money';
import { generateEntityId } from '../common/id';
import { reconcileImportBatch } from '../transactions/ImportReconciliationService';

function mapMovementToAssetType(m: ExtractedMovement): Asset['assetType'] {
  if (m.movementType === 'CRIPTO_OPERACAO' || m.cryptoMeta) return 'Outros';
  const desc = (m.investmentMeta?.productName || m.originalDescription || '').toUpperCase();
  if (/\b(FUNDO|FIC|FIM|FIA)\b/.test(desc)) return 'Fundos';
  if (m.movementType === 'COMPRA_ATIVO' || m.movementType === 'VENDA_ATIVO') return 'Renda Variável';
  if (m.movementType === 'APLICACAO' || m.movementType === 'RESGATE') return 'Renda Fixa';
  return 'Reserva';
}

/**
 * Integrates ONLY explicitly manually approved movements (`reviewStatus === 'APROVADO'`)
 * into official financial models (`Transaction`, `Asset`, `CreditCard`), keeping idempotency
 * so retrying after partial errors never duplicates posted records.
 */
export function commitApprovedExtractionMovements(params: {
  batch: ExtractionBatch;
  movementIdsToIntegrate?: string[];
  accounts: Account[];
  transactions: Transaction[];
  assets: Asset[];
  creditCards: CreditCard[];
  approvedByLabel?: string;
}): ExtractionIntegrationCommitResult {
  const {
    batch,
    movementIdsToIntegrate,
    accounts,
    transactions,
    assets,
    creditCards,
    approvedByLabel = 'Usuário',
  } = params;

  const targetIds = movementIdsToIntegrate ? new Set(movementIdsToIntegrate) : null;
  const nowIso = new Date().toISOString();

  const candidateTxPayloads: Array<{
    movementId: string;
    payload: Omit<Transaction, 'id'>;
    isTransferPair?: boolean;
  }> = [];

  let nextAssets = [...assets];
  const createdAssets: Asset[] = [];
  const modifiedAssets: Asset[] = [];
  let nextCards = [...creditCards];
  const updatedCardsMap = new Map<string, CreditCard>();

  let approvedCount = 0;
  let integratedCount = 0;
  let skippedDuplicateCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  const movementsCopy = batch.movements.map((mov) => ({ ...mov, lineage: [...mov.lineage] }));

  for (let i = 0; i < movementsCopy.length; i++) {
    const mov = movementsCopy[i];
    if (targetIds && !targetIds.has(mov.id)) continue;
    // Strict security & governance rule: NEVER integrate items not explicitly approved by user
    if (mov.reviewStatus !== 'APROVADO') continue;

    approvedCount++;

    // Idempotency guard: already integrated before
    if (mov.integratedTransactionId || mov.integratedAssetId) {
      skippedDuplicateCount++;
      mov.reviewStatus = 'INTEGRADO';
      continue;
    }

    const existingWithIdempotency = transactions.find(
      (t) =>
        t.status !== 'CANCELLED' &&
        ((mov.idempotencyKey && t.idempotencyKey === mov.idempotencyKey) ||
          (mov.bankTransactionId &&
            t.externalId === mov.bankTransactionId &&
            (!mov.targetAccountId || !t.accountId || t.accountId === mov.targetAccountId)))
    );

    if (existingWithIdempotency) {
      skippedDuplicateCount++;
      mov.reviewStatus = 'INTEGRADO';
      mov.integratedTransactionId = existingWithIdempotency.id;
      mov.integratedAt = nowIso;
      mov.integratedModule = 'Transações (Idempotência)';
      mov.lineage.push({
        timestamp: nowIso,
        stage: 'INTEGRAÇÃO',
        actor: 'SISTEMA',
        detail: `Registro idempotente vinculado ao lançamento existente ${existingWithIdempotency.id}.`,
      });
      continue;
    }

    const targetAccId = mov.targetAccountId || batch.confirmedAccountId;
    const targetAcc = accounts.find((a) => a.id === targetAccId && !a.archived);
    const targetCardId = mov.targetCardId || batch.confirmedCardId;
    const targetCard = creditCards.find((c) => c.id === targetCardId);

    const resolvedEntity =
      mov.entityId || batch.confirmedEntityId || targetAcc?.entityId || targetCard?.entityId;

    if (!resolvedEntity) {
      failedCount++;
      const msg = `"${mov.originalDescription}": confirme a titularidade CPF ou CNPJ antes de integrar.`;
      mov.reviewStatus = 'ERRO';
      mov.integrationError = msg;
      errors.push(msg);
      continue;
    }

    if (!targetAcc && !targetCard && mov.movementType !== 'CRIPTO_OPERACAO') {
      failedCount++;
      const msg = `"${mov.originalDescription}": associe a uma conta bancária, corretora ou cartão antes de integrar.`;
      mov.reviewStatus = 'ERRO';
      mov.integrationError = msg;
      errors.push(msg);
      continue;
    }

    // Case A: Card Invoice Payment -> reduces card invoice obligation AND debits bank account as internal/settlement without inflating double consumption expense
    if (mov.movementType === 'FATURA_CARTAO' && targetCard) {
      const currentInvoiceCents = toCents(targetCard.currentInvoiceAmount);
      const remainingCents = subtractMoney(
        currentInvoiceCents,
        cents(Math.min(currentInvoiceCents, mov.amountCents))
      );
      const updatedCard: CreditCard = {
        ...targetCard,
        currentInvoiceAmount: fromCents(remainingCents),
        status: remainingCents === 0 ? 'PAID' : 'OPEN',
      };
      updatedCardsMap.set(updatedCard.id, updatedCard);
      nextCards = nextCards.map((c) => (c.id === updatedCard.id ? updatedCard : c));

      if (targetAcc) {
        candidateTxPayloads.push({
          movementId: mov.id,
          payload: {
            entityId: resolvedEntity,
            accountId: targetAcc.id,
            creditCardId: targetCard.id,
            date: mov.date,
            description: mov.originalDescription,
            category: 'Cartão',
            account: `${targetAcc.institutionName} · ${targetAcc.accountName}`,
            amountCents: mov.amountCents,
            amount: fromCents(mov.amountCents),
            direction: 'EXPENSE',
            status: 'CONFIRMED',
            origin: 'IMPORT',
            // Mark isInternalTransfer when paying invoice so purchases + invoice payment don't double-count operational expenses
            isInternalTransfer: true,
            operationType: 'CARTAO',
            counterparty: targetCard.institutionName,
            externalId: mov.bankTransactionId || mov.idempotencyKey,
            idempotencyKey: mov.idempotencyKey,
          },
        });
      }

      mov.integratedAt = nowIso;
      mov.integratedModule = 'Cartões de Crédito';
      if (!targetAcc) {
        mov.reviewStatus = 'INTEGRADO';
        integratedCount++;
      }
      mov.lineage.push({
        timestamp: nowIso,
        stage: 'INTEGRAÇÃO',
        actor: 'USUARIO',
        detail: `Baixa de fatura no cartão "${targetCard.cardName}" sem duplicação de despesas.`,
      });
      continue;
    }

    // Case B: Investments / Applications / Redemptions / Asset Buy-Sell / Crypto
    if (
      mov.movementType === 'APLICACAO' ||
      mov.movementType === 'RESGATE' ||
      mov.movementType === 'COMPRA_ATIVO' ||
      mov.movementType === 'VENDA_ATIVO' ||
      mov.movementType === 'CRIPTO_OPERACAO'
    ) {
      const productTitle =
        mov.cryptoMeta?.assetSymbol ||
        mov.investmentMeta?.ticker ||
        mov.investmentMeta?.productName ||
        mov.originalDescription;
      const instName =
        batch.identifiedAccount.bankName || targetAcc?.institutionName || 'Instituição Financeira';

      const existingAssetIdx = nextAssets.findIndex(
        (a) =>
          a.entityId === resolvedEntity &&
          a.institutionName.toLowerCase() === instName.toLowerCase() &&
          a.description.toLowerCase() === productTitle.toLowerCase()
      );

      let assetId: string;
      const isOutflowFromCashToAsset =
        mov.movementType === 'APLICACAO' ||
        mov.movementType === 'COMPRA_ATIVO' ||
        (mov.movementType === 'CRIPTO_OPERACAO' && mov.direction === 'EXPENSE');

      const principalOrTotalCents =
        mov.movementType === 'RESGATE' && mov.investmentMeta?.principalCents
          ? mov.investmentMeta.principalCents
          : mov.amountCents;

      if (existingAssetIdx >= 0) {
        const existingAsset = nextAssets[existingAssetIdx];
        assetId = existingAsset.id;
        const currCents = toCents(existingAsset.currentValue);
        const updatedValCents = isOutflowFromCashToAsset
          ? addMoney(currCents, principalOrTotalCents)
          : subtractMoney(currCents, cents(Math.min(currCents, principalOrTotalCents)));

        const updatedAsset: Asset = {
          ...existingAsset,
          currentValue: fromCents(updatedValCents),
          valuationDate: mov.date,
        };
        nextAssets = nextAssets.map((a, idx) => (idx === existingAssetIdx ? updatedAsset : a));
        modifiedAssets.push(updatedAsset);
      } else {
        assetId = generateEntityId('ast');
        const newAsset: Asset = {
          id: assetId,
          entityId: resolvedEntity,
          assetType: mapMovementToAssetType(mov),
          institutionName: instName,
          description: productTitle,
          currentValue: isOutflowFromCashToAsset ? fromCents(principalOrTotalCents) : 0,
          valuationDate: mov.date,
        };
        nextAssets = [...nextAssets, newAsset];
        createdAssets.push(newAsset);
      }

      mov.integratedAssetId = assetId;
      mov.integratedModule = 'Patrimônio & Investimentos';

      // If linked to a bank/brokerage cash account, record patrimonial transfer so Disponibilidade adjusts without inflating operational Expense/Income
      if (targetAcc) {
        candidateTxPayloads.push({
          movementId: mov.id,
          payload: {
            entityId: resolvedEntity,
            accountId: targetAcc.id,
            date: mov.date,
            description: mov.originalDescription,
            category: 'Investimento',
            account: `${targetAcc.institutionName} · ${targetAcc.accountName}`,
            amountCents: principalOrTotalCents,
            amount: fromCents(principalOrTotalCents),
            direction: mov.direction,
            status: 'CONFIRMED',
            origin: 'IMPORT',
            isInternalTransfer: true, // Patrimonial movement: adjusts account cash, does NOT count as consumption expense or operational income
            operationType: 'TRANSFERENCIA_PROPRIA',
            counterparty: mov.counterparty || instName,
            externalId: mov.bankTransactionId || mov.idempotencyKey,
            idempotencyKey: mov.idempotencyKey,
          },
        });

        // If a redemption explicitly carries separate yield, register ONLY the yield as investment income
        if (
          mov.movementType === 'RESGATE' &&
          mov.investmentMeta?.yieldCents &&
          mov.investmentMeta.yieldCents > 0
        ) {
          candidateTxPayloads.push({
            movementId: mov.id,
            payload: {
              entityId: resolvedEntity,
              accountId: targetAcc.id,
              date: mov.date,
              description: `Rendimento de resgate: ${productTitle}`,
              category: 'Investimento',
              account: `${targetAcc.institutionName} · ${targetAcc.accountName}`,
              amountCents: mov.investmentMeta.yieldCents,
              amount: fromCents(mov.investmentMeta.yieldCents),
              direction: 'INCOME',
              status: 'CONFIRMED',
              origin: 'IMPORT',
              isInternalTransfer: false,
              operationType: 'OUTRO',
              counterparty: instName,
              externalId: `${mov.bankTransactionId || mov.idempotencyKey}-yield`,
              idempotencyKey: `${mov.idempotencyKey}-yield`,
            },
          });
        }
      } else {
        mov.reviewStatus = 'INTEGRADO';
        mov.integratedAt = nowIso;
        integratedCount++;
      }

      mov.lineage.push({
        timestamp: nowIso,
        stage: 'INTEGRAÇÃO',
        actor: 'USUARIO',
        detail: `Ativo "${productTitle}" atualizado em Investimentos/Patrimônio sem distorcer despesas operacionais.`,
      });
      continue;
    }

    // Case C: Own-account transfer (single side or paired across accounts)
    if (mov.movementType === 'TRANSFERENCIA' && mov.transferCounterpartAccountId && targetAcc) {
      const counterpart = accounts.find((a) => a.id === mov.transferCounterpartAccountId && !a.archived);
      const transferId = generateEntityId('trf');

      candidateTxPayloads.push({
        movementId: mov.id,
        isTransferPair: true,
        payload: {
          entityId: resolvedEntity,
          accountId: targetAcc.id,
          date: mov.date,
          description: mov.originalDescription,
          category: 'Transferência',
          account: `${targetAcc.institutionName} · ${targetAcc.accountName}`,
          amountCents: mov.amountCents,
          amount: fromCents(mov.amountCents),
          direction: mov.direction,
          status: 'CONFIRMED',
          origin: 'IMPORT',
          isInternalTransfer: true,
          transferId,
          operationType: 'TRANSFERENCIA_PROPRIA',
          counterparty: counterpart ? `${counterpart.institutionName} · ${counterpart.accountName}` : mov.counterparty,
          externalId: mov.bankTransactionId || mov.idempotencyKey,
          idempotencyKey: mov.idempotencyKey,
        },
      });

      // Only create counterpart if not already linked to an existing counterpart transaction
      if (counterpart && !mov.duplicateMatchTxId) {
        candidateTxPayloads.push({
          movementId: mov.id,
          isTransferPair: true,
          payload: {
            entityId: counterpart.entityId,
            accountId: counterpart.id,
            date: mov.date,
            description: `Transferência conciliada: ${targetAcc.institutionName}`,
            category: 'Transferência',
            account: `${counterpart.institutionName} · ${counterpart.accountName}`,
            amountCents: mov.amountCents,
            amount: fromCents(mov.amountCents),
            direction: mov.direction === 'EXPENSE' ? 'INCOME' : 'EXPENSE',
            status: 'CONFIRMED',
            origin: 'IMPORT',
            isInternalTransfer: true,
            transferId,
            operationType: 'TRANSFERENCIA_PROPRIA',
            counterparty: `${targetAcc.institutionName} · ${targetAcc.accountName}`,
            externalId: `${mov.bankTransactionId || mov.idempotencyKey}-pair`,
            idempotencyKey: `${mov.idempotencyKey}-pair`,
          },
        });
      }

      mov.integratedModule = 'Transferências & Conciliação';
      mov.lineage.push({
        timestamp: nowIso,
        stage: 'INTEGRAÇÃO',
        actor: 'USUARIO',
        detail: `Transferência própria conciliada sem inflar receitas ou despesas.`,
      });
      continue;
    }

    // Case D: Standard Transaction (Receita, Despesa, PIX, Rendimento, Provento, Cashback, Estorno, Tarifa, Imposto)
    const effectiveAccountLabel = targetAcc
      ? `${targetAcc.institutionName} · ${targetAcc.accountName}`
      : targetCard
        ? `${targetCard.institutionName} · ${targetCard.cardName}`
        : 'Conta extraída';

    const effectiveCents: MoneyCents =
      mov.fxMeta?.convertedBrlCents && mov.fxMeta.convertedBrlCents > 0
        ? mov.fxMeta.convertedBrlCents
        : mov.amountCents;

    const isOwnTransferNeutral = mov.movementType === 'TRANSFERENCIA';

    candidateTxPayloads.push({
      movementId: mov.id,
      payload: {
        entityId: resolvedEntity,
        accountId: targetAcc?.id || targetCard?.id || 'unassigned',
        creditCardId: targetCard?.id,
        date: mov.date,
        description: (mov.cardMeta?.installmentCurrent && mov.cardMeta.installmentTotal
          ? `${mov.originalDescription} (${mov.cardMeta.installmentCurrent}/${mov.cardMeta.installmentTotal})`
          : mov.originalDescription
        ).slice(0, 295),
        category: (mov.suggestedCategory || 'Outros').slice(0, 110),
        account: effectiveAccountLabel.slice(0, 195),
        amountCents: effectiveCents,
        amount: fromCents(effectiveCents),
        direction: mov.direction,
        status: 'CONFIRMED',
        origin: 'IMPORT',
        isInternalTransfer: isOwnTransferNeutral,
        operationType: mov.operationType,
        counterparty: mov.counterparty?.slice(0, 195),
        externalId: (mov.bankTransactionId || mov.idempotencyKey).slice(0, 195),
        idempotencyKey: mov.idempotencyKey.slice(0, 155),
        reversedTransactionId: mov.linkedReversalTxId,
      },
    });

    mov.integratedModule =
      mov.movementType === 'RENDIMENTO' || mov.movementType === 'PROVENTO'
        ? 'Rendimentos & Proventos'
        : targetCard
          ? 'Cartões de Crédito'
          : resolvedEntity === 'CNPJ'
            ? 'Empresa · CNPJ'
            : 'Pessoal · CPF';
  }

  // Run official ImportReconciliationService for all generated transactions
  const { accepted, reconciledTransactions, skippedDuplicatesCount } = reconcileImportBatch(
    candidateTxPayloads.map((c) => c.payload),
    transactions
  );

  skippedDuplicateCount += skippedDuplicatesCount;

  // Map created/reconciled IDs back onto each extracted movement for full traceability
  const byIdemKey = new Map<string, Transaction>();
  for (const tx of accepted) {
    if (tx.idempotencyKey) byIdemKey.set(tx.idempotencyKey, tx);
    if (tx.externalId) byIdemKey.set(tx.externalId, tx);
  }
  for (const tx of reconciledTransactions) {
    if (tx.idempotencyKey) byIdemKey.set(tx.idempotencyKey, tx);
    if (tx.externalId) byIdemKey.set(tx.externalId, tx);
  }

  for (const mov of movementsCopy) {
    if (mov.reviewStatus !== 'APROVADO') continue;
    const matched = byIdemKey.get(mov.idempotencyKey) || (mov.bankTransactionId ? byIdemKey.get(mov.bankTransactionId) : undefined);
    if (matched) {
      mov.reviewStatus = 'INTEGRADO';
      mov.integratedTransactionId = matched.id;
      mov.integratedAt = nowIso;
      mov.integrationError = undefined;
      const paired = byIdemKey.get(`${mov.idempotencyKey}-pair`);
      if (paired) mov.integratedTransferTxId = paired.id;
      mov.lineage.push({
        timestamp: nowIso,
        stage: 'APROVAÇÃO',
        actor: 'USUARIO',
        detail: `Aprovado por ${approvedByLabel} e integrado ao lançamento #${matched.id} em ${mov.integratedModule}.`,
      });
      integratedCount++;
    } else if (mov.integratedAssetId) {
      mov.reviewStatus = 'INTEGRADO';
      mov.integratedAt = nowIso;
      integratedCount++;
    }
  }

  const allResolved = movementsCopy.every(
    (m) =>
      m.reviewStatus === 'INTEGRADO' ||
      m.reviewStatus === 'IGNORADO' ||
      m.reviewStatus === 'DUPLICIDADE'
  );

  const updatedBatch: ExtractionBatch = {
    ...batch,
    stage: allResolved ? 'concluido' : 'conferencia',
    status: allResolved ? 'CONCLUIDO' : 'APROVADO_PARCIAL',
    approvedAt: nowIso,
    approvedBy: approvedByLabel,
    movements: movementsCopy,
  };

  return {
    batch: updatedBatch,
    newTransactions: accepted,
    updatedTransactions: reconciledTransactions,
    newAssets: createdAssets,
    updatedAssets: modifiedAssets,
    updatedCreditCards: Array.from(updatedCardsMap.values()),
    approvedCount,
    integratedCount,
    skippedDuplicateCount,
    failedCount,
    errors,
  };
}

/**
 * Lookup full origin traceability for any Transaction ("Rastrear movimentação").
 */
export function lookupTransactionTraceability(params: {
  transaction: Transaction;
  batches: ExtractionBatch[];
  institutions: InstitutionProfile[];
}): TraceabilityLookupResult | null {
  const { transaction, batches, institutions } = params;

  for (const batch of batches) {
    const mov = batch.movements.find(
      (m) =>
        m.integratedTransactionId === transaction.id ||
        m.integratedTransferTxId === transaction.id ||
        (transaction.idempotencyKey && m.idempotencyKey === transaction.idempotencyKey) ||
        (transaction.externalId &&
          (m.bankTransactionId === transaction.externalId || m.idempotencyKey === transaction.externalId))
    );
    if (mov) {
      const inst = institutions.find((i) => i.id === batch.confirmedInstitutionId || i.id === batch.identifiedAccount.institutionId);
      return {
        movement: mov,
        batch,
        institution: inst,
        accountLabel: transaction.account || batch.identifiedAccount.bankName || 'Conta vinculada',
      };
    }
  }
  return null;
}
