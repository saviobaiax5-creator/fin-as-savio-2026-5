import { Account, Boleto, Transaction } from '../types';

export interface AccountDeletionCheck {
  allowed: boolean;
  linkedTransactionsCount: number;
  linkedInternalTransfersCount: number;
  linkedBoletosCount: number;
  suggestArchive: boolean;
  reason?: string;
}

export function canDeleteAccount(
  accountId: string,
  context: {
    transactions: Transaction[];
    boletos?: Boleto[];
    account?: Account;
  }
): AccountDeletionCheck {
  const linkedTx = context.transactions.filter((t) => t.accountId === accountId);
  const linkedInternalTransfersCount = linkedTx.filter((t) => t.isInternalTransfer).length;

  let linkedBoletosCount = 0;
  if (context.boletos && context.account) {
    const instLower = context.account.institutionName.trim().toLowerCase();
    linkedBoletosCount = context.boletos.filter(
      (b) => b.status === 'PAID' && instLower && b.instituicao.toLowerCase().includes(instLower)
    ).length;
  }

  if (linkedTx.length > 0) {
    return {
      allowed: false,
      linkedTransactionsCount: linkedTx.length,
      linkedInternalTransfersCount,
      linkedBoletosCount,
      suggestArchive: true,
      reason: `Exclusão bloqueada: existem ${linkedTx.length} lançamento(s) vinculado(s) a esta conta${
        linkedInternalTransfersCount > 0
          ? ` (incluindo ${linkedInternalTransfersCount} transferência(s) própria(s))`
          : ''
      }. Arquive a conta para preservar o histórico e a integridade do saldo.`,
    };
  }

  return {
    allowed: true,
    linkedTransactionsCount: 0,
    linkedInternalTransfersCount: 0,
    linkedBoletosCount,
    suggestArchive: false,
  };
}

export function toggleAccountArchiveState(accounts: Account[], accountId: string): Account[] {
  return accounts.map((a) => (a.id === accountId ? { ...a, archived: !a.archived } : a));
}
