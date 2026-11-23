export type BankType = 'fisico' | 'digital';
export type DetectedBankType = BankType | 'desconhecido';
export type DetectionConfidence = 'alta' | 'media' | 'baixa';
export type InstitutionSelectorGroup = 'Digital' | 'Cooperativa' | 'Fisico';

export interface BankRepositoryEntry {
  codigo: string;
  ispb: string;
  nome: string;
  tipo: BankType;
  aliases: string[];
  institutionId?: string;
}

export interface InstituicaoFinanceiraItem {
  id: string;
  nome: string;
  sigla: string;
  codigo: string;
  tipo: string;
  grupo: 'Digital' | 'Cooperativa';
  cor: string;
  texto: string;
}

export interface BankVisualCatalogItem {
  id: string;
  nome: string;
  sigla: string;
  codigo: string;
  tipo: string;
  grupo: InstitutionSelectorGroup;
  cor: string;
  texto: string;
  institutionId?: string;
  aliases?: string[];
}

export interface DetectedBankResult {
  code?: string;
  ispb?: string;
  name?: string;
  type: DetectedBankType;
  confidence: DetectionConfidence;
  institutionId?: string;
  matchedBy?: 'OFX_CODE' | 'OFX_ORG' | 'CONTENT_ALIAS' | 'FILENAME_ALIAS' | 'BRASIL_API';
}

export const INSTITUICOES_FINANCEIRAS: InstituicaoFinanceiraItem[] = [
  // --- BANCOS DIGITAIS E CARTEIRAS (20) ---
  { id: '99pay', nome: '99Pay', sigla: '99', codigo: '301', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#FFCC00', texto: '#1E293B' },
  { id: 'nubank', nome: 'Nubank', sigla: 'NU', codigo: '260', tipo: 'Conta Digital', grupo: 'Digital', cor: '#820AD1', texto: '#FFFFFF' },
  { id: 'inter', nome: 'Banco Inter', sigla: 'IN', codigo: '077', tipo: 'Banco Digital', grupo: 'Digital', cor: '#FF7A00', texto: '#FFFFFF' },
  { id: 'picpay', nome: 'PicPay', sigla: 'PP', codigo: '380', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#21C25E', texto: '#FFFFFF' },
  { id: 'mercadopago', nome: 'Mercado Pago', sigla: 'MP', codigo: '323', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#009EE3', texto: '#FFFFFF' },
  { id: 'c6bank', nome: 'C6 Bank', sigla: 'C6', codigo: '336', tipo: 'Banco Digital', grupo: 'Digital', cor: '#1A1A1A', texto: '#FFFFFF' },
  { id: 'pagbank', nome: 'PagBank', sigla: 'PB', codigo: '290', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#00A859', texto: '#FFFFFF' },
  { id: 'iti', nome: 'iti Itaú', sigla: 'IT', codigo: '341', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#EC008C', texto: '#FFFFFF' },
  { id: 'neon', nome: 'Neon', sigla: 'NE', codigo: '735', tipo: 'Banco Digital', grupo: 'Digital', cor: '#00D7D7', texto: '#0F172A' },
  { id: 'next', nome: 'Next', sigla: 'NX', codigo: '237', tipo: 'Banco Digital', grupo: 'Digital', cor: '#00FF5F', texto: '#0F172A' },
  { id: 'willbank', nome: 'Will Bank', sigla: 'WL', codigo: '280', tipo: 'Banco Digital', grupo: 'Digital', cor: '#FFD400', texto: '#0F172A' },
  { id: 'btgpactual', nome: 'BTG Pactual', sigla: 'BT', codigo: '208', tipo: 'Banco Digital', grupo: 'Digital', cor: '#001E62', texto: '#FFFFFF' },
  { id: 'sofisadireto', nome: 'Sofisa Direto', sigla: 'SD', codigo: '637', tipo: 'Banco Digital', grupo: 'Digital', cor: '#00A88F', texto: '#FFFFFF' },
  { id: 'original', nome: 'Banco Original', sigla: 'OR', codigo: '212', tipo: 'Banco Digital', grupo: 'Digital', cor: '#00A859', texto: '#FFFFFF' },
  { id: 'pan', nome: 'Banco PAN', sigla: 'PN', codigo: '623', tipo: 'Banco Digital', grupo: 'Digital', cor: '#00AEEF', texto: '#FFFFFF' },
  { id: 'bs2', nome: 'Banco BS2', sigla: 'BS', codigo: '218', tipo: 'Banco Digital', grupo: 'Digital', cor: '#0033A0', texto: '#FFFFFF' },
  { id: 'nomad', nome: 'Nomad', sigla: 'NM', codigo: '000', tipo: 'Conta Global', grupo: 'Digital', cor: '#FFD100', texto: '#0F172A' },
  { id: 'wise', nome: 'Wise', sigla: 'WS', codigo: '000', tipo: 'Conta Global', grupo: 'Digital', cor: '#9FE870', texto: '#163300' },
  { id: 'recargapay', nome: 'RecargaPay', sigla: 'RP', codigo: '350', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#0055FF', texto: '#FFFFFF' },
  { id: 'ame', nome: 'Ame Digital', sigla: 'AM', codigo: '364', tipo: 'Carteira Digital', grupo: 'Digital', cor: '#F60054', texto: '#FFFFFF' },

  // --- COOPERATIVAS DE CRÉDITO (10) ---
  { id: 'sicredi', nome: 'Sicredi', sigla: 'SI', codigo: '748', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#3FA110', texto: '#FFFFFF' },
  { id: 'sicoob', nome: 'Sicoob', sigla: 'SC', codigo: '756', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#003641', texto: '#FFFFFF' },
  { id: 'cresol', nome: 'Cresol', sigla: 'CR', codigo: '133', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#F37021', texto: '#FFFFFF' },
  { id: 'unicred', nome: 'Unicred', sigla: 'UN', codigo: '136', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#00594C', texto: '#FFFFFF' },
  { id: 'ailos', nome: 'Ailos / Viacredi', sigla: 'AI', codigo: '085', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#005CA9', texto: '#FFFFFF' },
  { id: 'uniprime', nome: 'Uniprime', sigla: 'UP', codigo: '084', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#004B87', texto: '#FFFFFF' },
  { id: 'sisprime', nome: 'Sisprime', sigla: 'SP', codigo: '084', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#006633', texto: '#FFFFFF' },
  { id: 'credisis', nome: 'CrediSIS', sigla: 'CS', codigo: '097', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#007A33', texto: '#FFFFFF' },
  { id: 'credicoamo', nome: 'Credicoamo', sigla: 'CC', codigo: '098', tipo: 'Cooperativa Rural', grupo: 'Cooperativa', cor: '#006837', texto: '#FFFFFF' },
  { id: 'sulcredi', nome: 'Sulcredi', sigla: 'SL', codigo: '322', tipo: 'Cooperativa', grupo: 'Cooperativa', cor: '#005A9C', texto: '#FFFFFF' },
];

const EXTRA_VISUAL_CATALOG: BankVisualCatalogItem[] = [
  { id: 'bb', nome: 'Banco do Brasil', sigla: 'BB', codigo: '001', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#FFEF00', texto: '#003DA5', institutionId: 'inst-bb', aliases: ['banco do brasil', 'bb'] },
  { id: 'caixa', nome: 'Caixa Econômica Federal', sigla: 'CX', codigo: '104', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#005CA9', texto: '#FFFFFF', institutionId: 'inst-cef', aliases: ['caixa', 'caixa economica', 'cef'] },
  { id: 'bradesco', nome: 'Bradesco', sigla: 'BR', codigo: '237', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#CC092F', texto: '#FFFFFF', institutionId: 'inst-bradesco', aliases: ['bradesco'] },
  { id: 'itau', nome: 'Itaú Unibanco', sigla: 'IU', codigo: '341', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#EC7000', texto: '#FFFFFF', institutionId: 'inst-itau', aliases: ['itau', 'itau unibanco', 'unibanco'] },
  { id: 'santander', nome: 'Santander', sigla: 'SA', codigo: '033', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#EC0000', texto: '#FFFFFF', institutionId: 'inst-santander', aliases: ['santander'] },
  { id: 'safra', nome: 'Safra', sigla: 'SF', codigo: '422', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#1E3A8A', texto: '#FFFFFF', institutionId: 'inst-safra', aliases: ['safra', 'banco safra'] },
  { id: 'banrisul', nome: 'Banrisul', sigla: 'BS', codigo: '041', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#005CA9', texto: '#FFFFFF', institutionId: 'inst-banrisul', aliases: ['banrisul'] },
  { id: 'brb', nome: 'BRB', sigla: 'RB', codigo: '070', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#0056A3', texto: '#FFFFFF', institutionId: 'inst-brb', aliases: ['brb', 'banco de brasilia'] },
  { id: 'bnb', nome: 'Banco do Nordeste', sigla: 'BN', codigo: '004', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#A6192E', texto: '#FFFFFF', institutionId: 'inst-bnb', aliases: ['banco do nordeste', 'bnb'] },
  { id: 'basa', nome: 'Banco da Amazônia', sigla: 'BA', codigo: '003', tipo: 'Banco Físico', grupo: 'Fisico', cor: '#007A33', texto: '#FFFFFF', institutionId: 'inst-basa', aliases: ['banco da amazonia', 'basa'] },
  { id: 'xp', nome: 'XP Investimentos', sigla: 'XP', codigo: '102', tipo: 'Corretora / Digital', grupo: 'Digital', cor: '#111827', texto: '#FACC15', institutionId: 'inst-xp', aliases: ['xp', 'xp investimentos'] },
  { id: 'cora', nome: 'Cora', sigla: 'CO', codigo: '403', tipo: 'Banco PJ Digital', grupo: 'Digital', cor: '#FE3E6D', texto: '#FFFFFF', institutionId: 'inst-cora', aliases: ['cora'] },
  { id: 'stone', nome: 'Stone', sigla: 'ST', codigo: '197', tipo: 'Conta PJ Digital', grupo: 'Digital', cor: '#00A868', texto: '#FFFFFF', institutionId: 'inst-stone', aliases: ['stone'] },
  { id: 'bv', nome: 'Banco BV', sigla: 'BV', codigo: '655', tipo: 'Banco Digital', grupo: 'Digital', cor: '#1D4ED8', texto: '#FFFFFF', institutionId: 'inst-neon', aliases: ['bv', 'banco bv', 'votorantim', 'neon/bv'] },
];

const INSTITUTION_ID_MAP: Record<string, string> = {
  '99pay': 'inst-99pay',
  nubank: 'inst-nubank',
  inter: 'inst-inter',
  picpay: 'inst-picpay',
  mercadopago: 'inst-mercadopago',
  c6bank: 'inst-c6',
  pagbank: 'inst-pagbank',
  iti: 'inst-iti',
  neon: 'inst-neon',
  next: 'inst-next',
  willbank: 'inst-willbank',
  btgpactual: 'inst-btg',
  sofisadireto: 'inst-sofisadireto',
  original: 'inst-original',
  pan: 'inst-pan',
  bs2: 'inst-bs2',
  nomad: 'inst-nomad',
  wise: 'inst-wise',
  recargapay: 'inst-recargapay',
  ame: 'inst-ame',
  sicredi: 'inst-sicredi',
  sicoob: 'inst-sicoob',
  cresol: 'inst-cresol',
  unicred: 'inst-unicred',
  ailos: 'inst-ailos',
  uniprime: 'inst-uniprime',
  sisprime: 'inst-sisprime',
  credisis: 'inst-credisis',
  credicoamo: 'inst-credicoamo',
  sulcredi: 'inst-sulcredi',
};

export const ALL_INSTITUTION_CATALOG: BankVisualCatalogItem[] = [
  ...INSTITUICOES_FINANCEIRAS.map((item) => ({
    ...item,
    institutionId: INSTITUTION_ID_MAP[item.id] || `inst-${item.id}`,
  })),
  ...EXTRA_VISUAL_CATALOG,
];

export const BANKS_REPOSITORY: BankRepositoryEntry[] = [
  // Bancos Físicos e Cooperativas Tradicionais
  {
    codigo: '001',
    ispb: '00000000',
    nome: 'Banco do Brasil',
    tipo: 'fisico',
    institutionId: 'inst-bb',
    aliases: ['banco do brasil', 'bb s.a', 'bb sa', 'bco do brasil', 'bco brasil', 'ourocard'],
  },
  {
    codigo: '104',
    ispb: '00360305',
    nome: 'Caixa Econômica Federal',
    tipo: 'fisico',
    institutionId: 'inst-cef',
    aliases: ['caixa economica federal', 'caixa economica', 'caixa econ', 'cef'],
  },
  {
    codigo: '237',
    ispb: '60746948',
    nome: 'Bradesco',
    tipo: 'fisico',
    institutionId: 'inst-bradesco',
    aliases: ['bradesco', 'banco bradesco', 'bradescard', 'bco bradesco'],
  },
  {
    codigo: '341',
    ispb: '60701190',
    nome: 'Itaú Unibanco',
    tipo: 'fisico',
    institutionId: 'inst-itau',
    aliases: ['itau unibanco', 'itau', 'unibanco', 'itaucard', 'banco itau', 'personnalite', 'uniclass'],
  },
  {
    codigo: '033',
    ispb: '90400888',
    nome: 'Santander',
    tipo: 'fisico',
    institutionId: 'inst-santander',
    aliases: ['santander', 'banco santander', 'santander brasil', 'bco santander'],
  },
  {
    codigo: '422',
    ispb: '58160789',
    nome: 'Safra',
    tipo: 'fisico',
    institutionId: 'inst-safra',
    aliases: ['banco safra', 'safra', 'safrafinanceira'],
  },
  {
    codigo: '748',
    ispb: '01181521',
    nome: 'Sicredi',
    tipo: 'fisico',
    institutionId: 'inst-sicredi',
    aliases: ['sicredi', 'banco cooperativo sicredi'],
  },
  {
    codigo: '756',
    ispb: '02038232',
    nome: 'Sicoob',
    tipo: 'fisico',
    institutionId: 'inst-sicoob',
    aliases: ['sicoob', 'bancoob', 'banco cooperativo sicoob', 'cooperativas de credito do brasil'],
  },
  {
    codigo: '041',
    ispb: '92702067',
    nome: 'Banrisul',
    tipo: 'fisico',
    institutionId: 'inst-banrisul',
    aliases: ['banrisul', 'banco do estado do rio grande do sul'],
  },
  {
    codigo: '070',
    ispb: '00000208',
    nome: 'BRB',
    tipo: 'fisico',
    institutionId: 'inst-brb',
    aliases: ['banco de brasilia', 'brb', 'banco regional de brasilia'],
  },
  {
    codigo: '004',
    ispb: '07237373',
    nome: 'Banco do Nordeste',
    tipo: 'fisico',
    institutionId: 'inst-bnb',
    aliases: ['banco do nordeste', 'bnb', 'nordeste do brasil'],
  },
  {
    codigo: '003',
    ispb: '04902979',
    nome: 'Banco da Amazônia',
    tipo: 'fisico',
    institutionId: 'inst-basa',
    aliases: ['banco da amazonia', 'basa'],
  },

  // Bancos Digitais, Carteiras & Contas Globais
  {
    codigo: '260',
    ispb: '18236120',
    nome: 'Nubank',
    tipo: 'digital',
    institutionId: 'inst-nubank',
    aliases: ['nubank', 'nu pagamentos', 'nu financeira', 'nuconta', 'nu bank'],
  },
  {
    codigo: '077',
    ispb: '00416968',
    nome: 'Banco Inter',
    tipo: 'digital',
    institutionId: 'inst-inter',
    aliases: ['banco inter', 'inter s.a', 'inter sa', 'intermedium', 'conta inter', 'inter&co'],
  },
  {
    codigo: '336',
    ispb: '31872495',
    nome: 'C6 Bank',
    tipo: 'digital',
    institutionId: 'inst-c6',
    aliases: ['c6 bank', 'banco c6', 'c6bank', 'c6 s.a', 'c6 sa'],
  },
  {
    codigo: '290',
    ispb: '08561701',
    nome: 'PagBank',
    tipo: 'digital',
    institutionId: 'inst-pagbank',
    aliases: ['pagbank', 'pagseguro', 'pagseguro internet'],
  },
  {
    codigo: '323',
    ispb: '10573521',
    nome: 'Mercado Pago',
    tipo: 'digital',
    institutionId: 'inst-mercadopago',
    aliases: ['mercado pago', 'mercadopago', 'mercadolivre'],
  },
  {
    codigo: '380',
    ispb: '22896431',
    nome: 'PicPay',
    tipo: 'digital',
    institutionId: 'inst-picpay',
    aliases: ['picpay', 'pic pay', 'picpay servicos'],
  },
  {
    codigo: '212',
    ispb: '92894922',
    nome: 'Banco Original',
    tipo: 'digital',
    institutionId: 'inst-original',
    aliases: ['banco original', 'original s.a', 'original sa'],
  },
  {
    codigo: '655',
    ispb: '01858774',
    nome: 'Neon/BV',
    tipo: 'digital',
    institutionId: 'inst-neon',
    aliases: ['neon pagamentos', 'banco bv', 'banco votorantim', 'bv financeira'],
  },
  {
    codigo: '208',
    ispb: '30306294',
    nome: 'BTG Pactual',
    tipo: 'digital',
    institutionId: 'inst-btg',
    aliases: ['btg pactual', 'banco btg', 'btg banking', 'btg+'],
  },
  {
    codigo: '102',
    ispb: '02332886',
    nome: 'XP Investimentos',
    tipo: 'digital',
    institutionId: 'inst-xp',
    aliases: ['xp investimentos', 'banco xp', 'xp cctvm', 'rico investimentos', 'clear corretora'],
  },
  {
    codigo: '403',
    ispb: '37880206',
    nome: 'Cora',
    tipo: 'digital',
    institutionId: 'inst-cora',
    aliases: ['cora scd', 'banco cora', 'cora sociedade de credito', 'cora'],
  },
  {
    codigo: '197',
    ispb: '16501555',
    nome: 'Stone',
    tipo: 'digital',
    institutionId: 'inst-stone',
    aliases: ['stone pagamentos', 'stone instituicao de pagamento', 'conta stone', 'stone'],
  },
  {
    codigo: '280',
    ispb: '36272465',
    nome: 'Will Bank',
    tipo: 'digital',
    institutionId: 'inst-willbank',
    aliases: ['will bank', 'willbank', 'will financeira', 'meupag'],
  },

  // Expansão Base Completa: Novos Bancos Digitais, Carteiras, Contas Globais & Cooperativas
  {
    codigo: '301',
    ispb: '05684234',
    nome: '99Pay',
    tipo: 'digital',
    institutionId: 'inst-99pay',
    aliases: ['99pay', '99 pay', 'bipp', '99 tecnologia'],
  },
  {
    codigo: '735',
    ispb: '20855875',
    nome: 'Neon',
    tipo: 'digital',
    institutionId: 'inst-neon',
    aliases: ['banco neon', 'neon pagamentos', 'conta neon', 'neon'],
  },
  {
    codigo: '341',
    ispb: '60701190',
    nome: 'iti Itaú',
    tipo: 'digital',
    institutionId: 'inst-iti',
    aliases: ['iti itau', 'conta iti', 'iti pagamentos', 'banco iti'],
  },
  {
    codigo: '237',
    ispb: '60746948',
    nome: 'Next',
    tipo: 'digital',
    institutionId: 'inst-next',
    aliases: ['banco next', 'next.me', 'conta next'],
  },
  {
    codigo: '637',
    ispb: '60889128',
    nome: 'Sofisa Direto',
    tipo: 'digital',
    institutionId: 'inst-sofisadireto',
    aliases: ['sofisa direto', 'banco sofisa', 'sofisa'],
  },
  {
    codigo: '623',
    ispb: '59285411',
    nome: 'Banco PAN',
    tipo: 'digital',
    institutionId: 'inst-pan',
    aliases: ['banco pan', 'bancopan', 'panamericano'],
  },
  {
    codigo: '218',
    ispb: '71027866',
    nome: 'Banco BS2',
    tipo: 'digital',
    institutionId: 'inst-bs2',
    aliases: ['banco bs2', 'bs2 empresas', 'bonsucesso', 'bs2'],
  },
  {
    codigo: '350',
    ispb: '11275560',
    nome: 'RecargaPay',
    tipo: 'digital',
    institutionId: 'inst-recargapay',
    aliases: ['recargapay', 'recarga pay'],
  },
  {
    codigo: '364',
    ispb: '18054114',
    nome: 'Ame Digital',
    tipo: 'digital',
    institutionId: 'inst-ame',
    aliases: ['ame digital', 'conta ame'],
  },
  {
    codigo: '000',
    ispb: '',
    nome: 'Nomad',
    tipo: 'digital',
    institutionId: 'inst-nomad',
    aliases: ['nomad global', 'nomad fintech', 'nomad'],
  },
  {
    codigo: '000',
    ispb: '',
    nome: 'Wise',
    tipo: 'digital',
    institutionId: 'inst-wise',
    aliases: ['wise payments', 'transferwise', 'wise'],
  },
  {
    codigo: '133',
    ispb: '10398952',
    nome: 'Cresol',
    tipo: 'fisico',
    institutionId: 'inst-cresol',
    aliases: ['cresol', 'banco cresol', 'cooperativa cresol'],
  },
  {
    codigo: '136',
    ispb: '00315557',
    nome: 'Unicred',
    tipo: 'fisico',
    institutionId: 'inst-unicred',
    aliases: ['unicred', 'confederacao nacional das cooperativas centrais unicred'],
  },
  {
    codigo: '085',
    ispb: '05463212',
    nome: 'Ailos / Viacredi',
    tipo: 'fisico',
    institutionId: 'inst-ailos',
    aliases: ['ailos', 'viacredi', 'cooperativa central de credito urbano', 'cecred'],
  },
  {
    codigo: '084',
    ispb: '02398976',
    nome: 'Uniprime',
    tipo: 'fisico',
    institutionId: 'inst-uniprime',
    aliases: ['uniprime', 'uniprime central'],
  },
  {
    codigo: '084',
    ispb: '01658426',
    nome: 'Sisprime',
    tipo: 'fisico',
    institutionId: 'inst-sisprime',
    aliases: ['sisprime', 'sisprime do brasil'],
  },
  {
    codigo: '097',
    ispb: '04632856',
    nome: 'CrediSIS',
    tipo: 'fisico',
    institutionId: 'inst-credisis',
    aliases: ['credisis', 'central de cooperativas de credito credisis'],
  },
  {
    codigo: '098',
    ispb: '81723108',
    nome: 'Credicoamo',
    tipo: 'fisico',
    institutionId: 'inst-credicoamo',
    aliases: ['credicoamo', 'credicoamo credito rural'],
  },
  {
    codigo: '322',
    ispb: '17298092',
    nome: 'Sulcredi',
    tipo: 'fisico',
    institutionId: 'inst-sulcredi',
    aliases: ['sulcredi', 'cooperativa sulcredi'],
  },
];

export const banksRepository = BANKS_REPOSITORY;

const BRASIL_API_CACHE_KEY = 'savio_financas_brasilapi_cache_v1';
const memoryBrasilApiCache = new Map<string, BankRepositoryEntry | null>();

export function normalizeBankText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_/|\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompeCode(rawCode?: string | number | null): string {
  if (rawCode === undefined || rawCode === null) return '';
  const digits = String(rawCode).replace(/\D/g, '');
  if (!digits) return '';
  const stripped = digits.replace(/^0+/, '');
  if (!stripped) return '';
  return stripped.length <= 3 ? stripped.padStart(3, '0') : stripped;
}

export function findBankVisualBranding(
  institutionName?: string,
  code?: string
): {
  sigla: string;
  cor: string;
  texto: string;
  codigo?: string;
  nome?: string;
  id?: string;
} {
  const normName = normalizeBankText(institutionName || '');
  const normCode = normalizeCompeCode(code);

  if (normName) {
    // 1. Exact or strong substring match against catalog names and aliases
    let best: { item: BankVisualCatalogItem; score: number } | undefined;
    for (const item of ALL_INSTITUTION_CATALOG) {
      const candidates = [item.nome, item.id, ...(item.aliases || [])];
      for (const cand of candidates) {
        const normCand = normalizeBankText(cand);
        if (!normCand) continue;
        if (normName === normCand) {
          return {
            sigla: item.sigla,
            cor: item.cor,
            texto: item.texto,
            codigo: item.codigo,
            nome: item.nome,
            id: item.id,
          };
        }
        if (normCand.length >= 3 && normName.includes(normCand)) {
          const score = normCand.length + (item.nome.toLowerCase() === normCand ? 5 : 0);
          if (!best || score > best.score) {
            best = { item, score };
          }
        } else if (normName.length >= 3 && normCand.includes(normName)) {
          const score = normName.length;
          if (!best || score > best.score) {
            best = { item, score };
          }
        }
      }
    }
    if (best) {
      return {
        sigla: best.item.sigla,
        cor: best.item.cor,
        texto: best.item.texto,
        codigo: best.item.codigo,
        nome: best.item.nome,
        id: best.item.id,
      };
    }
  }

  if (normCode) {
    // Prefer parent/traditional catalog items when only COMPE code is supplied
    const byCode =
      EXTRA_VISUAL_CATALOG.find((item) => item.codigo === normCode) ||
      ALL_INSTITUTION_CATALOG.find((item) => item.codigo === normCode);
    if (byCode) {
      return {
        sigla: byCode.sigla,
        cor: byCode.cor,
        texto: byCode.texto,
        codigo: byCode.codigo,
        nome: byCode.nome,
        id: byCode.id,
      };
    }
  }

  // Crisp offline 2-letter fallback for custom institutions
  const words = (institutionName || '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(de|do|da|dos|das|e|s\.a\.?|sa|banco)$/i.test(w));
  const rawLetters =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`
      : (institutionName || 'BK').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'BK';

  return {
    sigla: rawLetters.toUpperCase(),
    cor: '#061E3E',
    texto: '#FFFFFF',
    codigo: normCode || undefined,
    nome: institutionName || undefined,
  };
}

export function findBankByCodeOrIspb(
  codeOrIspb?: string | number | null
): BankRepositoryEntry | undefined {
  if (codeOrIspb === undefined || codeOrIspb === null) return undefined;
  const digits = String(codeOrIspb).replace(/\D/g, '');
  if (!digits) return undefined;

  if (digits.length === 8) {
    const byIspb = BANKS_REPOSITORY.find((b) => b.ispb && b.ispb === digits);
    if (byIspb) return byIspb;
  }

  const compe = normalizeCompeCode(digits);
  if (compe) {
    const byCode = BANKS_REPOSITORY.find((b) => b.codigo === compe);
    if (byCode) return byCode;
  }

  // Also check in-memory BrasilAPI cache
  if (compe) {
    const cached = memoryBrasilApiCache.get(compe);
    if (cached) return cached;
  }

  return undefined;
}

function readLocalStorageBrasilApiCache(): Record<string, BankRepositoryEntry> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(BRASIL_API_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStorageBrasilApiCache(code: string, entry: BankRepositoryEntry): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const current = readLocalStorageBrasilApiCache();
    current[code] = entry;
    localStorage.setItem(BRASIL_API_CACHE_KEY, JSON.stringify(current));
  } catch {
    // ignore storage quota errors
  }
}

export function clearBrasilApiBankCache(): void {
  memoryBrasilApiCache.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BRASIL_API_CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

function inferBankTypeFromApiName(name: string): BankType {
  const norm = normalizeBankText(name);
  if (
    /pagamentos|instituicao de pagamento|\bip\b|\bscd\b|fintech|digital|nu |inter|c6|neon|stone|cora|picpay|pagbank|mercado pago|will|btg|xp |99pay|sofisa|pan|bs2|recargapay|ame /i.test(
      norm
    )
  ) {
    return 'digital';
  }
  return 'fisico';
}

export async function lookupBankByCodeWithBrasilApi(
  code: string,
  fetcher?: typeof fetch
): Promise<BankRepositoryEntry | null> {
  const normalized = normalizeCompeCode(code);
  if (!normalized || normalized.length > 3) return null;

  const staticHit = BANKS_REPOSITORY.find((b) => b.codigo === normalized);
  if (staticHit) return staticHit;

  if (memoryBrasilApiCache.has(normalized)) {
    return memoryBrasilApiCache.get(normalized) ?? null;
  }

  const persisted = readLocalStorageBrasilApiCache();
  if (persisted[normalized]) {
    memoryBrasilApiCache.set(normalized, persisted[normalized]);
    return persisted[normalized];
  }

  const fetchImpl = fetcher || (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) return null;

  const apiCodeNumber = Number(normalized);
  if (!Number.isFinite(apiCodeNumber) || apiCodeNumber <= 0) return null;

  try {
    const resp = await fetchImpl(`https://brasilapi.com.br/api/banks/v1/${apiCodeNumber}`);
    if (!resp.ok) {
      memoryBrasilApiCache.set(normalized, null);
      return null;
    }
    const payload = (await resp.json()) as {
      ispb?: string;
      name?: string;
      code?: number | null;
      fullName?: string;
    };
    const displayName = (payload?.name || payload?.fullName || '').trim();
    if (!displayName) {
      memoryBrasilApiCache.set(normalized, null);
      return null;
    }
    const entry: BankRepositoryEntry = {
      codigo: normalized,
      ispb: String(payload.ispb || '').replace(/\D/g, '').padStart(8, '0'),
      nome: displayName,
      tipo: inferBankTypeFromApiName(`${payload.name || ''} ${payload.fullName || ''}`),
      aliases: [
        normalizeBankText(displayName),
        ...(payload.fullName ? [normalizeBankText(payload.fullName)] : []),
      ].filter(Boolean),
    };
    memoryBrasilApiCache.set(normalized, entry);
    writeLocalStorageBrasilApiCache(normalized, entry);
    return entry;
  } catch {
    return null;
  }
}

function extractOfxTag(content: string, tag: string): string | undefined {
  const xmlRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const xmlMatch = content.match(xmlRegex);
  if (xmlMatch?.[1]?.trim()) return xmlMatch[1].trim();

  const sgmlRegex = new RegExp(`<${tag}>([^\\r\\n<]+)`, 'i');
  const sgmlMatch = content.match(sgmlRegex);
  if (sgmlMatch?.[1]?.trim()) return sgmlMatch[1].trim();
  return undefined;
}

function matchesAliasInText(normalizedText: string, alias: string): boolean {
  const normAlias = normalizeBankText(alias);
  if (!normAlias || !normalizedText) return false;
  // Require word boundaries for short aliases to prevent substring false positives (e.g. "iti" / "cef" / "brb" / "pan" / "ame")
  if (normAlias.length <= 4) {
    const escaped = normAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    return regex.test(normalizedText);
  }
  return normalizedText.includes(normAlias);
}

function findBestBankByAliases(
  normalizedText: string
): { bank: BankRepositoryEntry; matchedAlias: string } | undefined {
  if (!normalizedText) return undefined;

  let best: { bank: BankRepositoryEntry; matchedAlias: string; score: number } | undefined;

  for (const bank of BANKS_REPOSITORY) {
    const candidates = [bank.nome, ...bank.aliases];
    for (const candidate of candidates) {
      const normCand = normalizeBankText(candidate);
      if (matchesAliasInText(normalizedText, normCand)) {
        const score = normCand.length;
        if (!best || score > best.score) {
          best = { bank, matchedAlias: normCand, score };
        }
      }
    }
  }

  return best ? { bank: best.bank, matchedAlias: best.matchedAlias } : undefined;
}

export function detectBankFromStatement(
  fileContent: string,
  fileName = ''
): DetectedBankResult {
  const raw = fileContent || '';
  const headerSlice = raw.slice(0, 4000);
  const isOfx = /<OFX>|<STMTTRN>|OFXHEADER|<BANKID>|<BANKACCTFROM>/i.test(headerSlice);

  // Priority 1: OFX tags (<BANKID>, <FID>, <ORG>)
  if (isOfx) {
    const bankIdRaw = extractOfxTag(headerSlice, 'BANKID') || extractOfxTag(headerSlice, 'FID');
    const orgRaw = extractOfxTag(headerSlice, 'ORG');

    // If <ORG> identifies a specific sub-brand (e.g. "iti Itaú" on code 341, "Next" on 237, "Sisprime" on 084), prefer <ORG>
    if (orgRaw) {
      const orgHit = findBestBankByAliases(normalizeBankText(orgRaw));
      if (orgHit) {
        const normalizedBankId = normalizeCompeCode(bankIdRaw);
        if (!normalizedBankId || orgHit.bank.codigo === normalizedBankId || orgHit.bank.codigo === '000') {
          return {
            code: orgHit.bank.codigo,
            ispb: orgHit.bank.ispb || undefined,
            name: orgHit.bank.nome,
            type: orgHit.bank.tipo,
            confidence: 'alta',
            institutionId: orgHit.bank.institutionId,
            matchedBy: 'OFX_ORG',
          };
        }
      }
    }

    if (bankIdRaw) {
      const matchedByCode = findBankByCodeOrIspb(bankIdRaw);
      if (matchedByCode) {
        return {
          code: matchedByCode.codigo,
          ispb: matchedByCode.ispb || undefined,
          name: matchedByCode.nome,
          type: matchedByCode.tipo,
          confidence: 'alta',
          institutionId: matchedByCode.institutionId,
          matchedBy: 'OFX_CODE',
        };
      }
    }

    if (orgRaw) {
      const orgHit = findBestBankByAliases(normalizeBankText(orgRaw));
      if (orgHit) {
        return {
          code: orgHit.bank.codigo,
          ispb: orgHit.bank.ispb || undefined,
          name: orgHit.bank.nome,
          type: orgHit.bank.tipo,
          confidence: 'alta',
          institutionId: orgHit.bank.institutionId,
          matchedBy: 'OFX_ORG',
        };
      }
    }

    const fallbackCode = normalizeCompeCode(bankIdRaw);
    if (fallbackCode) {
      return {
        code: fallbackCode,
        name: orgRaw || undefined,
        type: 'desconhecido',
        confidence: orgRaw ? 'media' : 'baixa',
      };
    }
  }

  // Priority 2: Content header (CSV / PDF / XLSX) & Alias normalization
  const normHeader = normalizeBankText(headerSlice);
  const contentAliasHit = findBestBankByAliases(normHeader);
  if (contentAliasHit) {
    return {
      code: contentAliasHit.bank.codigo,
      ispb: contentAliasHit.bank.ispb || undefined,
      name: contentAliasHit.bank.nome,
      type: contentAliasHit.bank.tipo,
      confidence: contentAliasHit.matchedAlias.length >= 5 ? 'alta' : 'media',
      institutionId: contentAliasHit.bank.institutionId,
      matchedBy: 'CONTENT_ALIAS',
    };
  }

  // Check explicit COMPE code in CSV/PDF header lines (e.g. "Banco: 260" or "Código 077")
  const explicitCodeMatch = headerSlice.match(
    /(?:banco|codigo|c[oó]digo|compe|bankid)\s*[:#-]?\s*(\d{3})\b/i
  );
  if (explicitCodeMatch?.[1]) {
    const byHeaderCode = findBankByCodeOrIspb(explicitCodeMatch[1]);
    if (byHeaderCode) {
      return {
        code: byHeaderCode.codigo,
        ispb: byHeaderCode.ispb || undefined,
        name: byHeaderCode.nome,
        type: byHeaderCode.tipo,
        confidence: 'alta',
        institutionId: byHeaderCode.institutionId,
        matchedBy: 'CONTENT_ALIAS',
      };
    }
  }

  // Priority 3: File name fallback
  const normFileName = normalizeBankText(fileName.replace(/\.[a-z0-9]+$/i, ''));
  const fileAliasHit = findBestBankByAliases(normFileName);
  if (fileAliasHit) {
    return {
      code: fileAliasHit.bank.codigo,
      ispb: fileAliasHit.bank.ispb || undefined,
      name: fileAliasHit.bank.nome,
      type: fileAliasHit.bank.tipo,
      confidence: 'media',
      institutionId: fileAliasHit.bank.institutionId,
      matchedBy: 'FILENAME_ALIAS',
    };
  }

  // Fallback with explicit COMPE code from header for BrasilAPI resolution if present
  if (explicitCodeMatch?.[1]) {
    return {
      code: normalizeCompeCode(explicitCodeMatch[1]),
      type: 'desconhecido',
      confidence: 'baixa',
    };
  }

  return {
    type: 'desconhecido',
    confidence: 'baixa',
  };
}

export async function detectBankFromStatementAsync(
  fileContent: string,
  fileName = '',
  fetcher?: typeof fetch
): Promise<DetectedBankResult> {
  const syncResult = detectBankFromStatement(fileContent, fileName);
  if (syncResult.type !== 'desconhecido') {
    return syncResult;
  }

  if (syncResult.code) {
    const apiEntry = await lookupBankByCodeWithBrasilApi(syncResult.code, fetcher);
    if (apiEntry) {
      return {
        code: apiEntry.codigo,
        ispb: apiEntry.ispb || undefined,
        name: apiEntry.nome,
        type: apiEntry.tipo,
        confidence: 'alta',
        institutionId: apiEntry.institutionId,
        matchedBy: 'BRASIL_API',
      };
    }
  }

  return syncResult;
}
