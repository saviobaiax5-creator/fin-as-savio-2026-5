import type { CategoryRule, Direction, OperationType } from '../../types';
import type {
  CardPurchaseMeta,
  CryptoOperationMeta,
  ExtractionMovementType,
  ExtractionRule,
  ForeignExchangeMeta,
  InstitutionCategory,
  InvestmentBreakdownMeta,
} from '../../types/extractions';
import { categorizeTransactionDescription } from '../transactions/CategorizationService';
import { cents } from '../money/money';
import { normalizeDescription } from '../../utils/financeCalculations';

export interface ClassificationInput {
  description: string;
  amountCents: number; // positive cents
  direction: Direction;
  currency: string;
  rawOperationHint?: string;
  counterparty?: string;
  institutionId?: string;
  institutionCategory?: InstitutionCategory;
  entityId?: 'CPF' | 'CNPJ';
  bankTransactionId?: string;
  customRules?: CategoryRule[];
  extractionRules?: ExtractionRule[];
  rawInvestmentMeta?: InvestmentBreakdownMeta;
  rawCryptoMeta?: CryptoOperationMeta;
  rawFxMeta?: ForeignExchangeMeta;
  rawCardMeta?: CardPurchaseMeta;
  existingConfidence?: number;
  existingDoubtReason?: string;
}

export interface ClassificationOutput {
  movementType: ExtractionMovementType;
  operationType: OperationType;
  suggestedCategory: string;
  counterparty?: string;
  matchedRuleId?: string;
  matchedRuleKeyword?: string;
  confidence: number;
  doubtReason?: string;
  needsIdentification: boolean;
  investmentMeta?: InvestmentBreakdownMeta;
  cryptoMeta?: CryptoOperationMeta;
  fxMeta?: ForeignExchangeMeta;
  cardMeta?: CardPurchaseMeta;
}

function extractCounterpartyFromDescription(desc: string): string | undefined {
  const pixMatch = desc.match(/(?:pix\s+(?:recebido|enviado|transf)?\s*(?:de|para|-|:)?\s+)([A-Za-zÀ-ÿ0-9\s.&-]{3,55})/i);
  if (pixMatch?.[1]) {
    return pixMatch[1].replace(/\s{2,}/g, ' ').trim();
  }
  const tedMatch = desc.match(/(?:ted|doc)\s+(?:recebid[ao]|enviad[ao]|para|de)?\s*[-:]?\s*([A-Za-zÀ-ÿ0-9\s.&-]{3,55})/i);
  if (tedMatch?.[1]) {
    return tedMatch[1].replace(/\s{2,}/g, ' ').trim();
  }
  return undefined;
}

function parseInstallmentInfo(desc: string): CardPurchaseMeta | undefined {
  const m = desc.match(/(?:parcela\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i);
  if (!m) return undefined;
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (current >= 1 && total >= current && total <= 48) {
    return {
      installmentCurrent: current,
      installmentTotal: total,
    };
  }
  return undefined;
}

function extractCdiMetadata(desc: string, existing?: InvestmentBreakdownMeta): InvestmentBreakdownMeta {
  const out: InvestmentBreakdownMeta = { ...(existing || {}) };
  const lower = desc.toLowerCase();

  if (/\bcdb\b/.test(lower)) out.productName = out.productName || 'CDB';
  else if (/\brdb\b/.test(lower)) out.productName = out.productName || 'RDB';
  else if (/poupan[cç]a/.test(lower)) out.productName = out.productName || 'Poupança';
  else if (/aplica[cç][aã]o\s*autom[aá]tica|resgate\s*autom/.test(lower)) {
    out.productName = out.productName || 'Aplicação Automática';
  } else if (/conta\s*remunerada/.test(lower)) out.productName = out.productName || 'Conta Remunerada';
  else if (/tesouro/.test(lower)) out.productName = out.productName || 'Tesouro Direto';
  else if (/\blci\b|\blca\b/.test(lower)) out.productName = out.productName || (lower.includes('lci') ? 'LCI' : 'LCA');
  else if (/fundo/.test(lower)) out.productName = out.productName || 'Fundo de Investimento';

  // CDI is strictly an index/benchmark — never invent percentage when absent
  if (/\bcdi\b/.test(lower)) {
    out.indexer = 'CDI';
    const pctMatch = desc.match(/(\d{1,3}(?:[.,]\d{1,2})?\s*%\s*(?:do\s*)?cdi)/i);
    if (pctMatch?.[1]) {
      out.indexerRateLabel = pctMatch[1].replace(/\s+/g, ' ').trim();
    }
  } else if (/\bipca\b/.test(lower)) {
    out.indexer = 'IPCA';
  } else if (/\bselic\b/.test(lower)) {
    out.indexer = 'SELIC';
  }

  // Extract explicit IR / IOF only when stated in statement text
  const irMatch = desc.match(/\bir(?:rf)?\s*[:=]?\s*r?\$?\s*(\d+[.,]\d{2})/i);
  if (irMatch?.[1]) {
    const v = Number(irMatch[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) out.irCents = cents(Math.round(v * 100));
  }
  const iofMatch = desc.match(/\biof\s*[:=]?\s*r?\$?\s*(\d+[.,]\d{2})/i);
  if (iofMatch?.[1]) {
    const v = Number(iofMatch[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) out.iofCents = cents(Math.round(v * 100));
  }
  const yieldMatch = desc.match(/rend(?:imento)?\s*[:=]?\s*r?\$?\s*(\d+[.,]\d{2})/i);
  if (yieldMatch?.[1]) {
    const v = Number(yieldMatch[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) out.yieldCents = cents(Math.round(v * 100));
  }
  const principalMatch = desc.match(/principal\s*[:=]?\s*r?\$?\s*(\d+[.,]\d{2})/i);
  if (principalMatch?.[1]) {
    const v = Number(principalMatch[1].replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(v) && v > 0) out.principalCents = cents(Math.round(v * 100));
  }

  // Ticker extraction for stocks/FIIs/ETFs (e.g. PETR4, MXRF11, BOVA11, AAPL)
  const tickerMatch = desc.match(/\b([A-Z]{4}(?:3|4|5|6|11)|[A-Z]{2,5}11)\b/);
  if (tickerMatch?.[1]) {
    out.ticker = tickerMatch[1];
  }

  return out;
}

export function classifyExtractedMovement(input: ClassificationInput): ClassificationOutput {
  const norm = normalizeDescription(input.description);
  const hint = (input.rawOperationHint || '').toLowerCase();
  const combined = `${norm} ${hint}`.trim();

  // 1. Check explicit institution/entity-aware ExtractionRules first (suggestions only, never auto-approve)
  if (input.extractionRules && input.extractionRules.length > 0) {
    const matchedExt = input.extractionRules.find((r) => {
      if (r.institutionId && input.institutionId && r.institutionId !== input.institutionId) return false;
      if (r.entityId && input.entityId && r.entityId !== input.entityId) return false;
      const kw = normalizeDescription(r.keyword);
      return kw.length >= 2 && norm.includes(kw);
    });
    if (matchedExt) {
      return {
        movementType:
          matchedExt.movementType ||
          (input.direction === 'INCOME' ? 'RECEITA' : 'DESPESA'),
        operationType: 'OUTRO',
        suggestedCategory: matchedExt.category,
        counterparty: input.counterparty || matchedExt.counterparty || extractCounterpartyFromDescription(input.description),
        matchedRuleId: matchedExt.id,
        matchedRuleKeyword: matchedExt.keyword,
        confidence: 0.93,
        needsIdentification: false,
        investmentMeta: input.rawInvestmentMeta,
        cryptoMeta: input.rawCryptoMeta,
        fxMeta: input.rawFxMeta,
        cardMeta: input.rawCardMeta,
      };
    }
  }

  // Fallback check if currency is foreign and no explicit fxMeta was passed
  let fxMeta = input.rawFxMeta;
  if (!fxMeta && input.currency && input.currency !== 'BRL') {
    fxMeta = {
      originalCurrency: input.currency,
      originalAmount: input.amountCents / 100,
    };
  }

  const counterparty = input.counterparty || extractCounterpartyFromDescription(input.description);
  const installmentMeta = parseInstallmentInfo(input.description);
  const baseCardMeta = input.rawCardMeta || installmentMeta;

  // Low quality / unreadable OCR guard
  if (
    input.amountCents <= 0 ||
    (input.existingConfidence !== undefined && input.existingConfidence < 0.6) ||
    /ileg[ií]vel|desconhecid|sem descri[cç][aã]o|nao identificad/.test(combined)
  ) {
    return {
      movementType: 'NAO_IDENTIFICADO',
      operationType: 'OUTRO',
      suggestedCategory: 'Outros',
      counterparty,
      confidence: input.existingConfidence ?? 0.35,
      doubtReason:
        input.existingDoubtReason ||
        'Descrição genérica, incompleta ou baixa confiança de leitura; identifique manualmente.',
      needsIdentification: true,
      investmentMeta: input.rawInvestmentMeta,
      cryptoMeta: input.rawCryptoMeta,
      fxMeta,
      cardMeta: baseCardMeta,
    };
  }

  // 2. Reversals / Estornos (must be checked BEFORE generic INCOME/EXPENSE!)
  if (/\bestorno\b|\bdevolucao\b|\breembolso\b|\bchargeback\b|\breversao\b|\bcancelamento compra\b/.test(combined)) {
    return {
      movementType: 'ESTORNO',
      operationType: /\bpix\b/.test(combined) ? 'PIX' : 'OUTRO',
      suggestedCategory: 'Outros',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      cardMeta: baseCardMeta,
      fxMeta,
    };
  }

  // 3. Cashback (separate from operational income and investments)
  if (/\bcashback\b|\bme\s*pague|\bbeneficio\s*credit|\bprograma\s*pontos/.test(combined)) {
    return {
      movementType: 'CASHBACK',
      operationType: input.institutionCategory === 'CARTAO_CREDITO' ? 'CARTAO' : 'OUTRO',
      suggestedCategory: 'Outros',
      counterparty,
      confidence: 0.92,
      needsIdentification: false,
      cardMeta: baseCardMeta,
      fxMeta,
    };
  }

  // 4. Crypto operations (Exchanges)
  if (
    input.rawCryptoMeta ||
    input.institutionCategory === 'EXCHANGE' ||
    /\bbtc\b|\beth\b|\busdt\b|\bsol\b|\bbitcoin\b|\bethereum\b|\bstaking\b|\bblockchain\b|\bcripto/.test(combined)
  ) {
    return {
      movementType: 'CRIPTO_OPERACAO',
      operationType: 'OUTRO',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      cryptoMeta: input.rawCryptoMeta,
      fxMeta,
    };
  }

  // 5. Card invoice payment (must settle obligation without inflating consumption expense)
  if (
    /pagamento\s*(?:de\s*)?fatura|pgto\s*fatura|fatura\s*(?:cartao|visa|master|nubank|itau|bradesco|inter)/.test(combined)
  ) {
    return {
      movementType: 'FATURA_CARTAO',
      operationType: 'CARTAO',
      suggestedCategory: 'Cartão',
      counterparty,
      confidence: 0.92,
      needsIdentification: false,
      cardMeta: { ...(baseCardMeta || {}), isInvoicePayment: true },
      fxMeta,
    };
  }

  // 6. Investments: Dividends / JCP / Proventos
  if (/\bdividendo\b|\bjcp\b|juros\s*sobre\s*capital|\bprovento\b|rendimento\s*fii/.test(combined)) {
    return {
      movementType: 'PROVENTO',
      operationType: 'OUTRO',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.92,
      needsIdentification: false,
      investmentMeta: extractCdiMetadata(input.description, input.rawInvestmentMeta),
      fxMeta,
    };
  }

  // 7. Investments: Redemptions / Resgates (separate principal vs yield — never treat principal as income)
  if (/\bresgate\b|\bretirada\s*aplic|\bliquidacao\s*cdb|\bvencimento\s*cdb/.test(combined)) {
    const invMeta = extractCdiMetadata(input.description, input.rawInvestmentMeta);
    if (!invMeta.principalCents && !invMeta.yieldCents) {
      // Preserve net value; user can inspect/split principal vs yield if statement omitted breakdown
      invMeta.netCents = cents(input.amountCents);
    }
    return {
      movementType: 'RESGATE',
      operationType: 'TRANSFERENCIA_PROPRIA',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      investmentMeta: invMeta,
      fxMeta,
    };
  }

  // 8. Investments: Yields / Rendimentos (CDB, RDB, CDI, Conta Remunerada, Poupança)
  // Note: CDI alone without yield/product context -> flag or treat strictly as benchmark metadata
  if (/rendimento|juros\s*poupanca|remuneracao\s*(?:cdb|rdb|cdi|conta)|credito\s*rend/.test(combined)) {
    const invMeta = extractCdiMetadata(input.description, input.rawInvestmentMeta);
    return {
      movementType: 'RENDIMENTO',
      operationType: 'OUTRO',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.91,
      needsIdentification: false,
      investmentMeta: invMeta,
      fxMeta,
    };
  }

  // 9. Investments: Applications / Aportes / Compras de Ativos (never treat as consumption expense)
  if (
    /aplicacao|aplic\s*aut|aporte\s*cdb|rdb\s*aplic|compra\s*(?:acao|acoes|fii|etf|tesouro)|subscricao/.test(combined) ||
    ((input.institutionCategory === 'CORRETORA_NACIONAL' || input.institutionCategory === 'CORRETORA_INTERNACIONAL') &&
      /\bcompra\b|\bbuy\b/.test(combined) &&
      input.direction === 'EXPENSE')
  ) {
    const invMeta = extractCdiMetadata(input.description, input.rawInvestmentMeta);
    const isEquityPurchase =
      input.institutionCategory === 'CORRETORA_NACIONAL' ||
      input.institutionCategory === 'CORRETORA_INTERNACIONAL' ||
      Boolean(invMeta.ticker) ||
      /\b(?:acao|acoes|fii|etf|tesouro|stock|reit|bond)\b/.test(combined);
    return {
      movementType: isEquityPurchase ? 'COMPRA_ATIVO' : 'APLICACAO',
      operationType: isEquityPurchase ? 'OUTRO' : 'TRANSFERENCIA_PROPRIA',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      investmentMeta: invMeta,
      fxMeta,
    };
  }

  // 10. Asset Sales (Brokerages)
  if (
    (input.institutionCategory === 'CORRETORA_NACIONAL' || input.institutionCategory === 'CORRETORA_INTERNACIONAL') &&
    /\bvenda\b|\bsell\b/.test(combined) &&
    input.direction === 'INCOME'
  ) {
    return {
      movementType: 'VENDA_ATIVO',
      operationType: 'OUTRO',
      suggestedCategory: 'Investimento',
      counterparty,
      confidence: 0.88,
      needsIdentification: false,
      investmentMeta: extractCdiMetadata(input.description, input.rawInvestmentMeta),
      fxMeta,
    };
  }

  // 11. Taxes (IR / IOF / DARF / DAS / ISS)
  if (/\birrf\b|\biof\b|\bimposto\b|\btributo\b|\bdarf\b|\bdas\b|\binss\b/.test(combined) && input.direction === 'EXPENSE') {
    return {
      movementType: 'IMPOSTO',
      operationType: /darf|das/.test(combined) ? 'BOLETO' : 'TARIFA',
      suggestedCategory: 'Impostos',
      counterparty,
      confidence: 0.89,
      needsIdentification: false,
      fxMeta,
    };
  }

  // 12. Bank Fees / Tarifas
  if (/\btarifa\b|\btaxa\s*(?:manut|bancar|ted|doc|pacote)|anuidade|\bjuros\s*(?:cheque|rotativo|mora)/.test(combined) && input.direction === 'EXPENSE') {
    return {
      movementType: 'TARIFA',
      operationType: 'TARIFA',
      suggestedCategory: 'Serviços',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      fxMeta,
    };
  }

  // 13. PIX Recebido / Enviado
  if (/\bpix\b/.test(combined) || (input.bankTransactionId && /^E\d{8}/.test(input.bankTransactionId))) {
    const catRes = categorizeTransactionDescription({
      description: input.description,
      direction: input.direction,
      customRules: input.customRules,
      fallbackCategory: input.direction === 'INCOME' ? 'Outros' : 'Outros',
    });
    return {
      movementType: input.direction === 'INCOME' ? 'PIX_RECEBIDO' : 'PIX_ENVIADO',
      operationType: 'PIX',
      suggestedCategory: catRes.category,
      counterparty,
      matchedRuleKeyword: catRes.matchedRuleKeyword,
      confidence: 0.91,
      needsIdentification: false,
      fxMeta,
    };
  }

  // 14. Explicit own-account transfer hints
  if (/mesma\s*titularidade|transf(?:erencia)?\s*entre\s*contas|entre\s*contas\s*proprias/.test(combined)) {
    return {
      movementType: 'TRANSFERENCIA',
      operationType: 'TRANSFERENCIA_PROPRIA',
      suggestedCategory: 'Transferência',
      counterparty,
      confidence: 0.9,
      needsIdentification: false,
      fxMeta,
    };
  }

  // 15. General TED/DOC/Boleto/Saque/Compra/Receita/Despesa via CategorizationService
  const catRes = categorizeTransactionDescription({
    description: input.description,
    direction: input.direction,
    customRules: input.customRules,
    fallbackCategory: 'Outros',
  });

  let opType: OperationType = 'OUTRO';
  if (/ted|doc|transferencia|transf\b/.test(combined)) opType = 'TED_DOC';
  else if (/boleto|liq\s*tit|pag\s*tit|concessionaria|luz|agua|energia/.test(combined)) opType = 'BOLETO';
  else if (/saque|atm|banco\s*24h/.test(combined)) opType = 'SAQUE';
  else if (input.institutionCategory === 'CARTAO_CREDITO' || /cartao|visa|master|elo|compra\s*deb|compra\s*cred/.test(combined)) {
    opType = 'CARTAO';
  }

  // Ambiguous generic descriptions -> Needs manual identification!
  const isFallbackMatch = !catRes.matchedRuleKeyword && !catRes.isCustomRule;
  const isVagueDescription =
    isFallbackMatch &&
    (/^(lancamento|movimento|debito|credito|doc|ted|transferencia|pagamento|compra)\s*\d*$/i.test(norm) ||
      norm.length < 4 ||
      /\bcdi\b/.test(norm)); // Standalone CDI mention without clear yield/product

  if (isVagueDescription) {
    return {
      movementType: 'NAO_IDENTIFICADO',
      operationType: opType,
      suggestedCategory: catRes.category,
      counterparty,
      confidence: 0.48,
      doubtReason: /\bcdi\b/.test(norm)
        ? 'Menção isolada a CDI — confirme se trata de rendimento, aplicação ou apenas informação de indexador.'
        : 'Descrição genérica sem contexto suficiente para classificação segura.',
      needsIdentification: true,
      cardMeta: baseCardMeta,
      fxMeta,
    };
  }

  return {
    movementType:
      opType === 'TED_DOC' && /transferencia|transf\b/.test(combined)
        ? 'TRANSFERENCIA'
        : input.direction === 'INCOME'
          ? 'RECEITA'
          : 'DESPESA',
    operationType: opType,
    suggestedCategory: catRes.category,
    counterparty,
    matchedRuleKeyword: catRes.matchedRuleKeyword,
    confidence: catRes.isCustomRule ? 0.94 : catRes.matchedRuleKeyword ? 0.86 : 0.72,
    needsIdentification: false,
    cardMeta: baseCardMeta,
    fxMeta,
  };
}
