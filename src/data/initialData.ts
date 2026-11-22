import { Transaction, Account, CreditCard, Boleto, Debt, Asset, DocumentItem } from '../types';
import type { AppDataset } from '../services/backupService';

/**
 * Inicialização estritamente vazia para novas instalações e novos usuários.
 * Nenhum dado fictício, saldo simulado ou movimentação pré-preenchida deve nascer ativo.
 */
export const initialAccounts: Account[] = [];
export const initialTransactions: Transaction[] = [];
export const initialCreditCards: CreditCard[] = [];
export const initialBoletos: Boleto[] = [];
export const initialDebts: Debt[] = [];
export const initialAssets: Asset[] = [];
export const initialDocuments: DocumentItem[] = [];

export const EMPTY_APP_DATASET: AppDataset = {
  accounts: [],
  transactions: [],
  creditCards: [],
  boletos: [],
  debts: [],
  assets: [],
  documents: [],
  salaries: {
    sources: [],
    records: [],
    adjustments: [],
  },
  budgets: [],
  categoryRules: [],
};

/**
 * Identificadores exatos dos antigos registros de demonstração apenas para
 * diagnóstico conservador (nunca utilizados para exclusão automática silenciosa).
 */
export const LEGACY_DEMO_FINGERPRINT_IDS = {
  accounts: ['acc-1', 'acc-2', 'acc-3', 'acc-4', 'acc-5'],
  transactions: ['tr-1', 'tr-2', 'tr-3', 'tr-4', 'tr-5', 'tr-6', 'tr-7', 'tr-8', 'tr-9', 'tr-10', 'tr-11'],
  creditCards: ['card-1', 'card-2', 'card-3'],
  boletos: ['bol-1', 'bol-2', 'bol-3'],
  debts: ['debt-1'],
  assets: ['ast-1', 'ast-2', 'ast-3'],
} as const;
