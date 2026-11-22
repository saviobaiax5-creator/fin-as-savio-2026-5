import type { InstitutionCategory, InstitutionProfile } from '../../types/extractions';

const NOW_ISO = '2026-01-01T00:00:00.000Z';

export const BUILTIN_INSTITUTIONS: InstitutionProfile[] = [
  {
    id: 'inst-bb',
    name: 'Banco do Brasil S.A.',
    commercialName: 'Banco do Brasil',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '001',
    website: 'https://www.bb.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-cef',
    name: 'Caixa Econômica Federal',
    commercialName: 'Caixa',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '104',
    website: 'https://www.caixa.gov.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-bradesco',
    name: 'Banco Bradesco S.A.',
    commercialName: 'Bradesco',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '237',
    website: 'https://banco.bradesco',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-itau',
    name: 'Itaú Unibanco S.A.',
    commercialName: 'Itaú',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '341',
    website: 'https://www.itau.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-santander',
    name: 'Banco Santander (Brasil) S.A.',
    commercialName: 'Santander',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '033',
    website: 'https://www.santander.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-sicoob',
    name: 'Sistema de Cooperativas de Crédito do Brasil',
    commercialName: 'Sicoob',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '756',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-sicredi',
    name: 'Banco Cooperativo Sicredi S.A.',
    commercialName: 'Sicredi',
    category: 'BANCO_FISICO',
    country: 'Brasil',
    code: '748',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-nubank',
    name: 'Nu Pagamentos S.A.',
    commercialName: 'Nubank',
    category: 'BANCO_DIGITAL',
    country: 'Brasil',
    code: '260',
    website: 'https://nubank.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-inter',
    name: 'Banco Inter S.A.',
    commercialName: 'Inter',
    category: 'BANCO_DIGITAL',
    country: 'Brasil',
    code: '077',
    website: 'https://www.inter.co',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-c6',
    name: 'Banco C6 S.A.',
    commercialName: 'C6 Bank',
    category: 'BANCO_DIGITAL',
    country: 'Brasil',
    code: '336',
    website: 'https://www.c6bank.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-neon',
    name: 'Neon Pagamentos S.A.',
    commercialName: 'Neon',
    category: 'BANCO_DIGITAL',
    country: 'Brasil',
    code: '655',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-pagbank',
    name: 'PagSeguro Internet Instituição de Pagamento S.A.',
    commercialName: 'PagBank',
    category: 'BANCO_DIGITAL',
    country: 'Brasil',
    code: '290',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-mercadopago',
    name: 'Mercado Pago Instituição de Pagamento Ltda.',
    commercialName: 'Mercado Pago',
    category: 'CARTEIRA_DIGITAL',
    country: 'Brasil',
    code: '323',
    website: 'https://www.mercadopago.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-picpay',
    name: 'PicPay Instituição de Pagamento S.A.',
    commercialName: 'PicPay',
    category: 'CARTEIRA_DIGITAL',
    country: 'Brasil',
    code: '380',
    website: 'https://picpay.com',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-wise',
    name: 'Wise Payments Limited',
    commercialName: 'Wise',
    category: 'CARTEIRA_DIGITAL',
    country: 'Reino Unido',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-xp',
    name: 'XP Investimentos CCTVM S.A.',
    commercialName: 'XP Investimentos',
    category: 'CORRETORA_NACIONAL',
    country: 'Brasil',
    code: '102',
    website: 'https://www.xpi.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-btg',
    name: 'Banco BTG Pactual S.A.',
    commercialName: 'BTG Pactual',
    category: 'CORRETORA_NACIONAL',
    country: 'Brasil',
    code: '208',
    website: 'https://www.btgpactual.com',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-rico',
    name: 'Rico Investimentos',
    commercialName: 'Rico',
    category: 'CORRETORA_NACIONAL',
    country: 'Brasil',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-clear',
    name: 'Clear Corretora',
    commercialName: 'Clear',
    category: 'CORRETORA_NACIONAL',
    country: 'Brasil',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-avenue',
    name: 'Avenue Securities LLC',
    commercialName: 'Avenue',
    category: 'CORRETORA_INTERNACIONAL',
    country: 'Estados Unidos',
    website: 'https://avenue.us',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-ibkr',
    name: 'Interactive Brokers LLC',
    commercialName: 'Interactive Brokers',
    category: 'CORRETORA_INTERNACIONAL',
    country: 'Estados Unidos',
    website: 'https://www.interactivebrokers.com',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-nomad',
    name: 'Nomad Fintech Inc.',
    commercialName: 'Nomad',
    category: 'CORRETORA_INTERNACIONAL',
    country: 'Estados Unidos',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-binance',
    name: 'Binance Holdings Ltd.',
    commercialName: 'Binance',
    category: 'EXCHANGE',
    country: 'Global',
    website: 'https://www.binance.com',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-mercadobitcoin',
    name: 'Mercado Bitcoin Serviços Digitais Ltda.',
    commercialName: 'Mercado Bitcoin',
    category: 'EXCHANGE',
    country: 'Brasil',
    website: 'https://www.mercadobitcoin.com.br',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
  {
    id: 'inst-coinbase',
    name: 'Coinbase Global Inc.',
    commercialName: 'Coinbase',
    category: 'EXCHANGE',
    country: 'Estados Unidos',
    website: 'https://www.coinbase.com',
    status: 'ACTIVE',
    isBuiltin: true,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  },
];

const KEYWORD_ALIASES: Array<{ keywords: string[]; institutionId: string }> = [
  { keywords: ['banco do brasil', 'bb s.a', 'bb sa'], institutionId: 'inst-bb' },
  { keywords: ['caixa economica', 'caixa econômica', 'cef'], institutionId: 'inst-cef' },
  { keywords: ['bradesco'], institutionId: 'inst-bradesco' },
  { keywords: ['itau', 'itaú', 'unibanco'], institutionId: 'inst-itau' },
  { keywords: ['santander'], institutionId: 'inst-santander' },
  { keywords: ['sicoob'], institutionId: 'inst-sicoob' },
  { keywords: ['sicredi'], institutionId: 'inst-sicredi' },
  { keywords: ['nubank', 'nu pagamentos', 'nu financeira'], institutionId: 'inst-nubank' },
  { keywords: ['banco inter', 'inter s.a', 'intermedium'], institutionId: 'inst-inter' },
  { keywords: ['c6 bank', 'banco c6'], institutionId: 'inst-c6' },
  { keywords: ['neon'], institutionId: 'inst-neon' },
  { keywords: ['pagbank', 'pagseguro'], institutionId: 'inst-pagbank' },
  { keywords: ['mercado pago', 'mercadopago'], institutionId: 'inst-mercadopago' },
  { keywords: ['picpay'], institutionId: 'inst-picpay' },
  { keywords: ['wise', 'transferwise'], institutionId: 'inst-wise' },
  { keywords: ['xp investimentos', 'xp cctvm'], institutionId: 'inst-xp' },
  { keywords: ['btg pactual', 'btg'], institutionId: 'inst-btg' },
  { keywords: ['rico investimentos', 'rico corretora'], institutionId: 'inst-rico' },
  { keywords: ['clear corretora'], institutionId: 'inst-clear' },
  { keywords: ['avenue'], institutionId: 'inst-avenue' },
  { keywords: ['interactive brokers', 'ibkr'], institutionId: 'inst-ibkr' },
  { keywords: ['nomad'], institutionId: 'inst-nomad' },
  { keywords: ['binance'], institutionId: 'inst-binance' },
  { keywords: ['mercado bitcoin'], institutionId: 'inst-mercadobitcoin' },
  { keywords: ['coinbase'], institutionId: 'inst-coinbase' },
];

export function mergeInstitutionsCatalog(userInstitutions: InstitutionProfile[]): InstitutionProfile[] {
  const byId = new Map<string, InstitutionProfile>();
  for (const b of BUILTIN_INSTITUTIONS) {
    byId.set(b.id, b);
  }
  for (const u of userInstitutions) {
    byId.set(u.id, u);
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.commercialName.localeCompare(b.commercialName, 'pt-BR')
  );
}

export function resolveInstitutionMatch(params: {
  bankCode?: string;
  bankNameHint?: string;
  fileNameHint?: string;
  catalog: InstitutionProfile[];
}): InstitutionProfile | undefined {
  const normalizedCode = (params.bankCode || '').replace(/\D/g, '').replace(/^0+/, '').padStart(3, '0');
  if (params.bankCode && normalizedCode !== '000') {
    const byCode = params.catalog.find(
      (i) => i.code && i.code.replace(/\D/g, '').padStart(3, '0') === normalizedCode
    );
    if (byCode) return byCode;
  }

  const haystack = `${params.bankNameHint || ''} ${params.fileNameHint || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!haystack.trim()) return undefined;

  for (const entry of KEYWORD_ALIASES) {
    if (entry.keywords.some((kw) => haystack.includes(kw))) {
      const found = params.catalog.find((i) => i.id === entry.institutionId);
      if (found) return found;
    }
  }

  return params.catalog.find((i) => {
    const comm = i.commercialName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return comm.length >= 3 && haystack.includes(comm);
  });
}

export function inferCategoryFromText(text: string): InstitutionCategory {
  const lower = text.toLowerCase();
  if (/binance|mercado bitcoin|coinbase|kraken|bybit|bitcoin|cripto|btc|eth/.test(lower)) {
    return 'EXCHANGE';
  }
  if (/avenue|interactive brokers|nomad|charles schwab|schwab|reit/.test(lower)) {
    return 'CORRETORA_INTERNACIONAL';
  }
  if (/xp |btg|clear|rico|corretora|nota de corretagem|b3|fii/.test(lower)) {
    return 'CORRETORA_NACIONAL';
  }
  if (/mercado pago|picpay|wise|paypal|carteira/.test(lower)) {
    return 'CARTEIRA_DIGITAL';
  }
  if (/nubank|inter|c6|neon|pagbank/.test(lower)) {
    return 'BANCO_DIGITAL';
  }
  if (/fatura|cart[aã]o|visa|mastercard|elo|amex/.test(lower)) {
    return 'CARTAO_CREDITO';
  }
  if (/banco do brasil|caixa|bradesco|ita[uú]|santander|sicoob|sicredi/.test(lower)) {
    return 'BANCO_FISICO';
  }
  return 'OUTRA';
}
