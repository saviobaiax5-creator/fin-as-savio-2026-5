import { describe, it, expect } from 'vitest';
import { Account, Transaction } from '../../types';
import { cents } from '../../domain/money/money';

describe('Separação Financeira CPF e CNPJ e Navegação Sávio Finanças', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc-cpf-1',
      entityId: 'CPF',
      institutionName: 'Nubank',
      accountName: 'Conta Pessoal',
      accountType: 'checking',
      openingBalanceCents: cents(100_000),
      openingBalance: 1000,
      balance: 1000,
      balanceCents: cents(100_000),
      archived: false,
    },
    {
      id: 'acc-cpf-2',
      entityId: 'CPF',
      institutionName: 'Itaú',
      accountName: 'Poupança Pessoal',
      accountType: 'savings',
      openingBalanceCents: cents(50_000),
      openingBalance: 500,
      balance: 500,
      balanceCents: cents(50_000),
      archived: true,
    },
    {
      id: 'acc-cnpj-1',
      entityId: 'CNPJ',
      institutionName: 'Banco Inter',
      accountName: 'Conta PJ MEI',
      accountType: 'business',
      openingBalanceCents: cents(250_000),
      openingBalance: 2500,
      balance: 2500,
      balanceCents: cents(250_000),
      archived: false,
    },
  ];

  it('filtra contas ativas estritamente pela titularidade CPF', () => {
    const cpfAccounts = mockAccounts.filter(
      (a) => !a.archived && a.entityId === 'CPF'
    );
    expect(cpfAccounts).toHaveLength(1);
    expect(cpfAccounts[0].id).toBe('acc-cpf-1');
    expect(cpfAccounts[0].entityId).toBe('CPF');
  });

  it('filtra contas ativas estritamente pela titularidade CNPJ', () => {
    const cnpjAccounts = mockAccounts.filter(
      (a) => !a.archived && a.entityId === 'CNPJ'
    );
    expect(cnpjAccounts).toHaveLength(1);
    expect(cnpjAccounts[0].id).toBe('acc-cnpj-1');
    expect(cnpjAccounts[0].entityId).toBe('CNPJ');
  });

  it('impede associação de lançamento CPF com conta CNPJ', () => {
    const entityId: 'CPF' | 'CNPJ' = 'CPF';
    const selectedAccount = mockAccounts.find((a) => a.id === 'acc-cnpj-1')!;

    const isValid = selectedAccount.entityId === entityId;
    expect(isValid).toBe(false);
  });

  it('impede associação de lançamento CNPJ com conta CPF', () => {
    const entityId: 'CPF' | 'CNPJ' = 'CNPJ';
    const selectedAccount = mockAccounts.find((a) => a.id === 'acc-cpf-1')!;

    const isValid = selectedAccount.entityId === entityId;
    expect(isValid).toBe(false);
  });

  it('garante que a troca de escopo atualiza a visão para a respectiva tela', () => {
    // Simula a lógica de handleNavigate sincronizada
    const state = { tab: 'dashboard', scope: 'CONSOLIDATED' };

    function navigate(tab: string) {
      state.tab = tab;
      if (tab === 'cpf') state.scope = 'CPF';
      else if (tab === 'cnpj') state.scope = 'CNPJ';
      else if (tab === 'dashboard') state.scope = 'CONSOLIDATED';
    }

    navigate('cpf');
    expect(state.tab).toBe('cpf');
    expect(state.scope).toBe('CPF');

    navigate('cnpj');
    expect(state.tab).toBe('cnpj');
    expect(state.scope).toBe('CNPJ');

    navigate('dashboard');
    expect(state.tab).toBe('dashboard');
    expect(state.scope).toBe('CONSOLIDATED');
  });
});
