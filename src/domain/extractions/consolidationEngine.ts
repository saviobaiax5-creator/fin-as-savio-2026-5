import type { Account, Asset, CreditCard, Debt, Transaction } from '../../types';
import type {
  AccountExtensionMeta,
  ConsolidationBreakdownItem,
  ConsolidationMode,
  ConsolidationPreferences,
  ConsolidationSummary,
  InstitutionCategory,
  InstitutionProfile,
} from '../../types/extractions';
import { addMoney, cents, subtractMoney, toCents } from '../money/money';
import type { MoneyCents } from '../money/money';
import {
  filterTransactionsByPeriod,
  getTransactionAmountCents,
} from '../../utils/financeCalculations';
import { resolveInstitutionMatch } from './institutionRegistry';

function convertToTargetCurrencyCents(params: {
  amountCents: MoneyCents;
  sourceCurrency: string;
  targetCurrency: 'BRL' | 'USD' | 'EUR';
  usdToBrlRate: number;
  eurToBrlRate: number;
}): { convertedCents: MoneyCents; missingRate: boolean } {
  const { amountCents, sourceCurrency, targetCurrency, usdToBrlRate, eurToBrlRate } = params;
  const src = (sourceCurrency || 'BRL').toUpperCase();
  if (src === targetCurrency) {
    return { convertedCents: amountCents, missingRate: false };
  }

  // Convert source -> BRL first
  let brlAmountCents: number;
  if (src === 'BRL') {
    brlAmountCents = amountCents;
  } else if (src === 'USD') {
    if (!usdToBrlRate || usdToBrlRate <= 0) return { convertedCents: cents(0), missingRate: true };
    brlAmountCents = Math.round(amountCents * usdToBrlRate);
  } else if (src === 'EUR') {
    if (!eurToBrlRate || eurToBrlRate <= 0) return { convertedCents: cents(0), missingRate: true };
    brlAmountCents = Math.round(amountCents * eurToBrlRate);
  } else {
    return { convertedCents: cents(0), missingRate: true };
  }

  if (targetCurrency === 'BRL') {
    return { convertedCents: cents(brlAmountCents), missingRate: false };
  }
  if (targetCurrency === 'USD') {
    if (!usdToBrlRate || usdToBrlRate <= 0) return { convertedCents: cents(0), missingRate: true };
    return { convertedCents: cents(Math.round(brlAmountCents / usdToBrlRate)), missingRate: false };
  }
  if (!eurToBrlRate || eurToBrlRate <= 0) return { convertedCents: cents(0), missingRate: true };
  return { convertedCents: cents(Math.round(brlAmountCents / eurToBrlRate)), missingRate: false };
}

export function inferAccountCategory(params: {
  account: Account;
  extension?: AccountExtensionMeta;
  institutions: InstitutionProfile[];
}): InstitutionCategory {
  if (params.extension?.institutionCategory) return params.extension.institutionCategory;
  if (params.account.accountType === 'investment') return 'CORRETORA_NACIONAL';
  const inst = resolveInstitutionMatch({
    bankNameHint: params.account.institutionName,
    catalog: params.institutions,
  });
  return inst?.category || 'BANCO_FISICO';
}

export function computeFinancialConsolidation(params: {
  accounts: Account[];
  creditCards: CreditCard[];
  assets: Asset[];
  debts: Debt[];
  transactions: Transaction[];
  accountExtensions: AccountExtensionMeta[];
  institutions: InstitutionProfile[];
  preferences: ConsolidationPreferences;
  period: string;
  modeOverride?: ConsolidationMode;
  entityFilter?: 'ALL' | 'CPF' | 'CNPJ';
}): ConsolidationSummary {
  const {
    accounts,
    creditCards,
    assets,
    debts,
    transactions,
    accountExtensions,
    institutions,
    preferences,
    period,
    modeOverride,
    entityFilter = 'ALL',
  } = params;

  const mode = modeOverride || preferences.mode;
  const extById = new Map(accountExtensions.map((e) => [e.id, e]));
  const missingRateSet = new Set<string>();
  let hasOutdatedBalances = false;

  const isSelectedByMode = (id: string, category: InstitutionCategory): boolean => {
    if (mode === 'CONSOLIDATED') return true;
    if (mode === 'INDIVIDUAL') {
      return Boolean(preferences.defaultIndividualId && preferences.defaultIndividualId === id);
    }
    if (mode === 'CATEGORY') {
      return (
        preferences.selectedCategories.length === 0 ||
        preferences.selectedCategories.includes(category)
      );
    }
    // CUSTOM
    const catOk =
      preferences.selectedCategories.length === 0 ||
      preferences.selectedCategories.includes(category);
    const idOk =
      preferences.selectedAccountIds.length === 0 &&
      preferences.selectedCardIds.length === 0
        ? true
        : preferences.selectedAccountIds.includes(id) || preferences.selectedCardIds.includes(id);
    return catOk && idOk;
  };

  const includedCategorySet = new Set<InstitutionCategory>();
  const selectedIdsSet = new Set<string>();

  const breakdownByBucket: ConsolidationSummary['breakdownByBucket'] = {
    disponibilidades: [],
    investimentos: [],
    cripto: [],
    faturas: [],
    dividas: [],
    receitas: [],
    despesas: [],
  };

  let disponibilidadesCents = cents(0);
  let disponibilidadeBancosFisicosCents = cents(0);
  let disponibilidadeBancosDigitaisCents = cents(0);
  let disponibilidadeCarteirasCents = cents(0);
  let disponibilidadeCorretorasCents = cents(0);
  let investimentosCents = cents(0);
  let criptoCents = cents(0);
  let faturasAbertasCents = cents(0);
  let dividasCents = cents(0);
  let receitasPeriodoCents = cents(0);
  let despesasPeriodoCents = cents(0);

  const instAggregate = new Map<
    string,
    {
      institutionId: string;
      institutionName: string;
      category: InstitutionCategory;
      disponibilidadesCents: MoneyCents;
      investimentosCents: MoneyCents;
      obrigacoesCents: MoneyCents;
      accountsCount: number;
      hasOutdatedBalance: boolean;
    }
  >();

  const touchInstitution = (
    instId: string,
    instName: string,
    cat: InstitutionCategory,
    delta: { disp?: MoneyCents; inv?: MoneyCents; obrig?: MoneyCents; outdated?: boolean; countAccount?: boolean }
  ) => {
    const key = `${instName.toLowerCase()}|${cat}`;
    const prev = instAggregate.get(key) || {
      institutionId: instId,
      institutionName: instName,
      category: cat,
      disponibilidadesCents: cents(0),
      investimentosCents: cents(0),
      obrigacoesCents: cents(0),
      accountsCount: 0,
      hasOutdatedBalance: false,
    };
    if (delta.disp) prev.disponibilidadesCents = addMoney(prev.disponibilidadesCents, delta.disp);
    if (delta.inv) prev.investimentosCents = addMoney(prev.investimentosCents, delta.inv);
    if (delta.obrig) prev.obrigacoesCents = addMoney(prev.obrigacoesCents, delta.obrig);
    if (delta.outdated) prev.hasOutdatedBalance = true;
    if (delta.countAccount) prev.accountsCount += 1;
    instAggregate.set(key, prev);
  };

  // 1. Disponibilidades financeiras (Contas Bancárias, Bancos Digitais, Carteiras, Saldo em Corretoras)
  for (const acc of accounts) {
    const ext = extById.get(acc.id);
    const isClosed = acc.archived || ext?.status === 'CLOSED';
    if (isClosed && !preferences.includeClosedAccounts) continue;
    if (entityFilter !== 'ALL' && acc.entityId !== entityFilter) continue;

    const category = inferAccountCategory({ account: acc, extension: ext, institutions });
    if (!isSelectedByMode(acc.id, category)) continue;

    includedCategorySet.add(category);
    selectedIdsSet.add(acc.id);

    const balStatus = ext?.balanceStatus || 'UPDATED';
    if (balStatus !== 'UPDATED') hasOutdatedBalances = true;

    const rawCents =
      typeof acc.balanceCents === 'number' ? acc.balanceCents : toCents(acc.balance);
    const srcCurrency = ext?.currency || 'BRL';
    const fx = convertToTargetCurrencyCents({
      amountCents: rawCents,
      sourceCurrency: srcCurrency,
      targetCurrency: preferences.targetCurrency,
      usdToBrlRate: preferences.usdToBrlRate,
      eurToBrlRate: preferences.eurToBrlRate,
    });
    if (fx.missingRate) missingRateSet.add(srcCurrency);

    disponibilidadesCents = addMoney(disponibilidadesCents, fx.convertedCents);
    if (category === 'BANCO_FISICO') {
      disponibilidadeBancosFisicosCents = addMoney(disponibilidadeBancosFisicosCents, fx.convertedCents);
    } else if (category === 'BANCO_DIGITAL') {
      disponibilidadeBancosDigitaisCents = addMoney(disponibilidadeBancosDigitaisCents, fx.convertedCents);
    } else if (category === 'CARTEIRA_DIGITAL') {
      disponibilidadeCarteirasCents = addMoney(disponibilidadeCarteirasCents, fx.convertedCents);
    } else if (category === 'CORRETORA_NACIONAL' || category === 'CORRETORA_INTERNACIONAL') {
      disponibilidadeCorretorasCents = addMoney(disponibilidadeCorretorasCents, fx.convertedCents);
    }

    breakdownByBucket.disponibilidades.push({
      id: acc.id,
      label: `${acc.institutionName} · ${acc.accountName}`,
      institutionName: acc.institutionName,
      institutionCategory: category,
      entityId: acc.entityId,
      currency: srcCurrency,
      originalAmountCents: rawCents,
      convertedBrlCents: fx.convertedCents,
      balanceStatus: balStatus,
      sourceKind: 'ACCOUNT',
      targetTab: 'accounts',
    });

    touchInstitution(ext?.institutionId || acc.institutionName, acc.institutionName, category, {
      disp: fx.convertedCents,
      outdated: balStatus !== 'UPDATED',
      countAccount: true,
    });
  }

  // 2. Investimentos & Criptoativos (Assets — never treat credit limits or cash balances redundantly)
  for (const asset of assets) {
    if (entityFilter !== 'ALL' && asset.entityId !== entityFilter) continue;

    const matchedInst = resolveInstitutionMatch({
      bankNameHint: asset.institutionName,
      catalog: institutions,
    });
    const isCryptoDesc = /btc|bitcoin|eth|ethereum|cripto|usdt|sol|binance|mercado bitcoin/i.test(
      `${asset.description} ${asset.institutionName}`
    );
    const category: InstitutionCategory =
      matchedInst?.category || (isCryptoDesc ? 'EXCHANGE' : 'CORRETORA_NACIONAL');

    if (mode === 'CATEGORY' && preferences.selectedCategories.length > 0 && !preferences.selectedCategories.includes(category)) {
      continue;
    }
    if (mode === 'INDIVIDUAL' && preferences.defaultIndividualId) {
      const selectedAcc = accounts.find((a) => a.id === preferences.defaultIndividualId);
      if (
        selectedAcc &&
        selectedAcc.institutionName.toLowerCase() !== asset.institutionName.toLowerCase()
      ) {
        continue;
      }
    }
    if (
      mode === 'CUSTOM' &&
      preferences.selectedAssetIds.length > 0 &&
      !preferences.selectedAssetIds.includes(asset.id)
    ) {
      continue;
    }

    includedCategorySet.add(category);
    const assetCents = toCents(asset.currentValue);

    const item: ConsolidationBreakdownItem = {
      id: asset.id,
      label: `${asset.description} (${asset.institutionName})`,
      institutionName: asset.institutionName,
      institutionCategory: category,
      entityId: asset.entityId,
      currency: 'BRL',
      originalAmountCents: assetCents,
      convertedBrlCents: assetCents,
      balanceStatus: 'UPDATED',
      sourceKind: 'ASSET',
      targetTab: 'assets',
    };

    if (category === 'EXCHANGE' || isCryptoDesc) {
      criptoCents = addMoney(criptoCents, assetCents);
      breakdownByBucket.cripto.push(item);
    } else {
      investimentosCents = addMoney(investimentosCents, assetCents);
      breakdownByBucket.investimentos.push(item);
    }

    touchInstitution(matchedInst?.id || asset.institutionName, asset.institutionName, category, {
      inv: assetCents,
    });
  }

  // 3. Cartões de Crédito (Somente faturas em aberto como obrigação — NUNCA limite total como saldo ou dívida!)
  for (const card of creditCards) {
    if (entityFilter !== 'ALL' && card.entityId !== entityFilter) continue;
    const category: InstitutionCategory = 'CARTAO_CREDITO';
    if (!isSelectedByMode(card.id, category)) continue;

    includedCategorySet.add(category);
    selectedIdsSet.add(card.id);

    const invoiceCents = card.status === 'OPEN' ? toCents(card.currentInvoiceAmount) : cents(0);
    faturasAbertasCents = addMoney(faturasAbertasCents, invoiceCents);

    breakdownByBucket.faturas.push({
      id: card.id,
      label: `${card.cardName} (${card.institutionName} •••• ${card.last4})`,
      institutionName: card.institutionName,
      institutionCategory: category,
      entityId: card.entityId,
      currency: 'BRL',
      originalAmountCents: invoiceCents,
      convertedBrlCents: invoiceCents,
      balanceStatus: 'UPDATED',
      sourceKind: 'CARD',
      targetTab: 'cards',
    });

    touchInstitution(card.institutionName, card.institutionName, category, {
      obrig: invoiceCents,
      countAccount: true,
    });
  }

  // 4. Dívidas e Obrigações (exceto já quitadas)
  if (mode === 'CONSOLIDATED' || mode === 'CATEGORY' || mode === 'CUSTOM') {
    for (const debt of debts) {
      if (debt.status === 'PAID') continue;
      if (entityFilter !== 'ALL' && debt.entityId !== entityFilter) continue;
      const dCents = toCents(debt.outstandingAmount);
      dividasCents = addMoney(dividasCents, dCents);
      breakdownByBucket.dividas.push({
        id: debt.id,
        label: debt.creditorName,
        institutionName: debt.creditorName,
        institutionCategory: 'OUTRA',
        entityId: debt.entityId,
        currency: 'BRL',
        originalAmountCents: dCents,
        convertedBrlCents: dCents,
        balanceStatus: 'UPDATED',
        sourceKind: 'DEBT',
        targetTab: 'debts',
      });
    }
  }

  // 5. Receitas e Despesas no período (excluindo transferências internas e cancelados!)
  const periodTxs = filterTransactionsByPeriod(transactions, period);
  for (const tx of periodTxs) {
    if (tx.status !== 'CONFIRMED' || tx.isInternalTransfer) continue;
    if (entityFilter !== 'ALL' && tx.entityId !== entityFilter) continue;

    if (
      mode === 'INDIVIDUAL' &&
      preferences.defaultIndividualId &&
      tx.accountId !== preferences.defaultIndividualId &&
      tx.creditCardId !== preferences.defaultIndividualId
    ) {
      continue;
    }

    if (
      mode === 'CUSTOM' &&
      (preferences.selectedAccountIds.length > 0 || preferences.selectedCardIds.length > 0) &&
      (!tx.accountId || !preferences.selectedAccountIds.includes(tx.accountId)) &&
      (!tx.creditCardId || !preferences.selectedCardIds.includes(tx.creditCardId))
    ) {
      continue;
    }

    const txCents = getTransactionAmountCents(tx);
    const acc = accounts.find((a) => a.id === tx.accountId);
    const category = acc
      ? inferAccountCategory({ account: acc, extension: extById.get(acc.id), institutions })
      : 'OUTRA';

    if (
      mode === 'CATEGORY' &&
      preferences.selectedCategories.length > 0 &&
      !preferences.selectedCategories.includes(category)
    ) {
      continue;
    }

    const item: ConsolidationBreakdownItem = {
      id: tx.id,
      label: `${tx.description} (${tx.date.split('-').reverse().join('/')})`,
      institutionName: acc?.institutionName || tx.account || 'Lançamento',
      institutionCategory: category,
      entityId: tx.entityId,
      currency: 'BRL',
      originalAmountCents: txCents,
      convertedBrlCents: txCents,
      balanceStatus: 'UPDATED',
      sourceKind: 'TRANSACTION',
      targetTab: tx.entityId === 'CNPJ' ? 'cnpj' : 'cpf',
    };

    if (tx.direction === 'INCOME') {
      receitasPeriodoCents = addMoney(receitasPeriodoCents, txCents);
      breakdownByBucket.receitas.push(item);
    } else {
      despesasPeriodoCents = addMoney(despesasPeriodoCents, txCents);
      breakdownByBucket.despesas.push(item);
    }
  }

  const obrigacoesTotaisCents = addMoney(faturasAbertasCents, dividasCents);
  const patrimonioBrutoCents = addMoney(
    disponibilidadesCents,
    addMoney(investimentosCents, criptoCents)
  );
  const patrimonioLiquidoCents = subtractMoney(patrimonioBrutoCents, obrigacoesTotaisCents);

  return {
    mode,
    targetCurrency: preferences.targetCurrency,
    selectedCount: selectedIdsSet.size,
    includedCategories: Array.from(includedCategorySet),
    hasUnconvertedCurrencies: missingRateSet.size > 0,
    missingRateCurrencies: Array.from(missingRateSet),
    hasOutdatedBalances,
    disponibilidadesCents,
    disponibilidadeBancosFisicosCents,
    disponibilidadeBancosDigitaisCents,
    disponibilidadeCarteirasCents,
    disponibilidadeCorretorasCents,
    investimentosCents,
    criptoCents,
    faturasAbertasCents,
    dividasCents,
    obrigacoesTotaisCents,
    receitasPeriodoCents,
    despesasPeriodoCents,
    patrimonioBrutoCents,
    patrimonioLiquidoCents,
    breakdownByBucket,
    institutionRows: Array.from(instAggregate.values()).sort((a, b) =>
      a.institutionName.localeCompare(b.institutionName, 'pt-BR')
    ),
  };
}
