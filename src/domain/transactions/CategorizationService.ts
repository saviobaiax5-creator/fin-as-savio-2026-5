import type { CategoryRule, Direction } from '../../types';
import { normalizeDescription } from '../../utils/financeCalculations';

interface BuiltinRule {
  keywords: string[];
  category: string;
  direction?: Direction;
}

const BUILTIN_RULES: BuiltinRule[] = [
  {
    keywords: ['mesma titularidade', 'entre contas proprias', 'transferencia propria'],
    category: 'Transferência',
  },
  {
    keywords: ['salario', 'folha', 'remuneracao', 'pro-labore', 'prolabore', 'adiantamento salarial'],
    category: 'Salário',
    direction: 'INCOME',
  },
  {
    keywords: ['nota fiscal', 'nfse', 'servico mei', 'recebimento cliente', 'venda cliente'],
    category: 'Serviço MEI',
    direction: 'INCOME',
  },
  {
    keywords: ['das ', 'simples nacional', 'darf', 'iptu', 'ipva', 'imposto', 'tributo', 'inss', 'fgts'],
    category: 'Impostos / DAS',
    direction: 'EXPENSE',
  },
  {
    keywords: [
      'supermercado',
      'mercado',
      'padaria',
      'ifood',
      'rappi',
      'restaurante',
      'lanchonete',
      'acougue',
      'hortifruti',
      'cafe',
    ],
    category: 'Alimentação',
    direction: 'EXPENSE',
  },
  {
    keywords: ['uber', '99app', '99pop', 'posto', 'combustivel', 'gasolina', 'etanol', 'estacionamento', 'pedagio', 'sem parar'],
    category: 'Transporte',
    direction: 'EXPENSE',
  },
  {
    keywords: ['aluguel', 'condominio', 'energia', 'eletrica', 'enel', 'cpfl', 'sabesp', 'agua', 'internet', 'vivo', 'claro', 'tim'],
    category: 'Moradia',
    direction: 'EXPENSE',
  },
  {
    keywords: ['fatura', 'cartao', 'anuidade', 'mastercard', 'visa'],
    category: 'Cartão',
    direction: 'EXPENSE',
  },
  {
    keywords: ['papelaria', 'grafica', 'insumo', 'material', 'embalagem', 'fornecedor', 'frete', 'correios'],
    category: 'Insumos / Produção',
    direction: 'EXPENSE',
  },
];

export function categorizeTransactionDescription(params: {
  description: string;
  direction: Direction;
  customRules?: CategoryRule[];
  fallbackCategory?: string;
}): { category: string; matchedRuleKeyword?: string; isCustomRule?: boolean } {
  const normDesc = normalizeDescription(params.description || '');
  const fallback = params.fallbackCategory || 'Outros';

  if (!normDesc) {
    return { category: fallback };
  }

  // 1. Custom user rules take precedence
  for (const rule of params.customRules ?? []) {
    if (rule.direction && rule.direction !== params.direction) continue;
    const kw = normalizeDescription(rule.keyword);
    if (kw && normDesc.includes(kw)) {
      return {
        category: rule.category,
        matchedRuleKeyword: rule.keyword,
        isCustomRule: true,
      };
    }
  }

  // 2. Built-in Portuguese rules
  for (const rule of BUILTIN_RULES) {
    if (rule.direction && rule.direction !== params.direction) continue;
    const matched = rule.keywords.find((kw) => normDesc.includes(kw));
    if (matched) {
      return {
        category: rule.category,
        matchedRuleKeyword: matched,
        isCustomRule: false,
      };
    }
  }

  return { category: fallback };
}
