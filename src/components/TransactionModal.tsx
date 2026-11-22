import React, { useState, useEffect } from 'react';
import {
  Transaction,
  TransactionStatus,
  Account,
  APP_CATEGORIES,
  OPERATION_TYPES,
  OPERATION_TYPE_LABELS,
  OperationType,
} from '../types';
import {
  fromCents,
  getTransactionAmountCents,
  parseMoneyInput,
} from '../domain/money/money';
import {
  generateMonthlyRecurrenceBatch,
  previewMonthlyRecurrence,
  InstallmentAmountMode,
  RecurrenceMode,
} from '../domain/transactions/RecurrenceService';
import { formatDateBR, todayLocal } from '../utils/dateUtils';
import { loadDraft, saveDraft, clearDraft } from '../core/lifecycle/draftPreserver';
import { MoneyInputField } from './MoneyInputField';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { X, Check, AlertCircle, Repeat } from 'lucide-react';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Omit<Transaction, 'id'>, editId?: string) => void;
  onSaveBatch?: (transactions: Transaction[]) => void;
  accounts: Account[];
  defaultEntity?: 'CPF' | 'CNPJ';
  editingTransaction?: Transaction | null;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onSaveBatch,
  accounts,
  defaultEntity = 'CPF',
  editingTransaction = null,
}) => {
  const [direction, setDirection] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [entityId, setEntityId] = useState<'CPF' | 'CNPJ'>(defaultEntity);
  const [status, setStatus] = useState<Exclude<TransactionStatus, 'CANCELLED'>>('CONFIRMED');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('Alimentação');
  const [operationType, setOperationType] = useState<OperationType>('PIX');
  const [counterparty, setCounterparty] = useState('');
  const [externalId, setExternalId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => todayLocal());
  const [accountId, setAccountId] = useState<string>('');
  const [isInternalTransfer, setIsInternalTransfer] = useState(false);
  const [repeatKind, setRepeatKind] = useState<'SINGLE' | RecurrenceMode>('SINGLE');
  const [occurrencesStr, setOccurrencesStr] = useState('3');
  const [amountMode, setAmountMode] = useState<InstallmentAmountMode>('PER_OCCURRENCE');
  const [futureStatus, setFutureStatus] = useState<'PENDING' | 'PLANNED'>('PENDING');
  const [errorMsg, setErrorMsg] = useState('');
  const [restoredDraftBanner, setRestoredDraftBanner] = useState(false);

  const DRAFT_KEY = 'transaction_modal_new';

  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (editingTransaction) {
      setRestoredDraftBanner(false);
      const existingCents = getTransactionAmountCents(editingTransaction);
      setDirection(editingTransaction.direction);
      setEntityId(editingTransaction.entityId);
      setStatus(
        editingTransaction.status === 'PENDING' || editingTransaction.status === 'PLANNED'
          ? editingTransaction.status
          : 'CONFIRMED'
      );
      setDescription(editingTransaction.description);
      setCategory(
        (APP_CATEGORIES as readonly string[]).includes(editingTransaction.category)
          ? editingTransaction.category
          : 'Outros'
      );
      setOperationType(editingTransaction.operationType || 'OUTRO');
      setCounterparty(editingTransaction.counterparty || '');
      setExternalId(editingTransaction.externalId || '');
      setAmount(fromCents(existingCents).toFixed(2).replace('.', ','));
      setDate(editingTransaction.date);
      setAccountId(editingTransaction.accountId);
      setIsInternalTransfer(Boolean(editingTransaction.isInternalTransfer));
    } else {
      const selectableAccounts = accounts.filter((a) => !a.archived);
      const preferredAccount =
        selectableAccounts.find((a) => a.entityId === defaultEntity) || selectableAccounts[0] || accounts[0];
      const draft = loadDraft<{
        direction: 'INCOME' | 'EXPENSE';
        entityId: 'CPF' | 'CNPJ';
        status: Exclude<TransactionStatus, 'CANCELLED'>;
        description: string;
        category: string;
        operationType: OperationType;
        counterparty: string;
        externalId: string;
        amount: string;
        date: string;
        accountId: string;
        isInternalTransfer: boolean;
        repeatKind: 'SINGLE' | RecurrenceMode;
        occurrencesStr: string;
        amountMode: InstallmentAmountMode;
        futureStatus: 'PENDING' | 'PLANNED';
      }>(DRAFT_KEY);

      if (draft && (draft.description || draft.amount || draft.counterparty)) {
        setDirection(draft.direction);
        setEntityId(draft.entityId);
        setStatus(draft.status);
        setDescription(draft.description);
        setCategory(draft.category);
        setOperationType(draft.operationType);
        setCounterparty(draft.counterparty);
        setExternalId(draft.externalId);
        setAmount(draft.amount);
        setDate(draft.date);
        setAccountId(draft.accountId || preferredAccount?.id || '');
        setIsInternalTransfer(draft.isInternalTransfer);
        setRepeatKind(draft.repeatKind);
        setOccurrencesStr(draft.occurrencesStr);
        setAmountMode(draft.amountMode);
        setFutureStatus(draft.futureStatus);
        setRestoredDraftBanner(true);
      } else {
        setRestoredDraftBanner(false);
        setDirection('EXPENSE');
        setEntityId(defaultEntity);
        setStatus('CONFIRMED');
        setDescription('');
        setCategory(defaultEntity === 'CNPJ' ? 'Serviço MEI' : 'Alimentação');
        setOperationType('PIX');
        setCounterparty('');
        setExternalId('');
        setAmount('');
        setDate(todayLocal());
        setIsInternalTransfer(false);
        setRepeatKind('SINGLE');
        setOccurrencesStr('3');
        setAmountMode('PER_OCCURRENCE');
        setFutureStatus('PENDING');
        setAccountId(preferredAccount?.id || '');
      }
    }
  }, [isOpen, defaultEntity, editingTransaction, accounts]);

  useEffect(() => {
    if (!isOpen || editingTransaction) return;
    if (!description && !amount && !counterparty) return;
    saveDraft(DRAFT_KEY, {
      direction,
      entityId,
      status,
      description,
      category,
      operationType,
      counterparty,
      externalId,
      amount,
      date,
      accountId,
      isInternalTransfer,
      repeatKind,
      occurrencesStr,
      amountMode,
      futureStatus,
    });
  }, [
    isOpen,
    editingTransaction,
    direction,
    entityId,
    status,
    description,
    category,
    operationType,
    counterparty,
    externalId,
    amount,
    date,
    accountId,
    isInternalTransfer,
    repeatKind,
    occurrencesStr,
    amountMode,
    futureStatus,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const currentAccount = accounts.find((a) => a.id === accountId);
    if (!currentAccount || currentAccount.entityId !== entityId) {
      const firstValid = accounts.find(
        (a) => (!a.archived || a.id === editingTransaction?.accountId) && a.entityId === entityId
      );
      setAccountId(firstValid?.id || '');
    }
  }, [entityId, isOpen, accounts, accountId, editingTransaction]);

  if (!isOpen) return null;

  const availableAccounts = accounts.filter(
    (a) => (!a.archived || a.id === editingTransaction?.accountId) && a.entityId === entityId
  );
  const selectedAccountObj =
    availableAccounts.find((a) => a.id === accountId) || availableAccounts[0] || null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!description.trim()) {
      setErrorMsg('Informe uma descrição para o lançamento.');
      return;
    }

    let amountCents;
    try {
      amountCents = parseMoneyInput(amount);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Informe um valor válido (ex.: 150,00).'
      );
      return;
    }

    if (amountCents <= 0) {
      setErrorMsg('Informe um valor maior que zero (ex.: 150,00).');
      return;
    }
    if (!selectedAccountObj) {
      setErrorMsg(`Nenhuma conta ${entityId} cadastrada. Cadastre uma conta ${entityId} antes de lançar.`);
      return;
    }

    if (selectedAccountObj.entityId !== entityId) {
      setErrorMsg('A conta selecionada não pertence à titularidade deste lançamento.');
      return;
    }

    const basePayload: Omit<Transaction, 'id'> = {
      entityId,
      accountId: selectedAccountObj.id,
      date,
      description: description.trim(),
      category,
      account: `${selectedAccountObj.institutionName} · ${selectedAccountObj.accountName}`,
      amountCents,
      amount: fromCents(amountCents),
      direction,
      status: editingTransaction?.status === 'CANCELLED' ? 'CANCELLED' : status,
      origin: editingTransaction?.origin || 'MANUAL',
      isInternalTransfer: isInternalTransfer || operationType === 'TRANSFERENCIA_PROPRIA',
      operationType,
      counterparty: counterparty.trim() || undefined,
      externalId: externalId.trim() || undefined,
    };

    if (!editingTransaction && repeatKind !== 'SINGLE' && onSaveBatch) {
      const occurrences = Number(occurrencesStr);
      if (!Number.isSafeInteger(occurrences) || occurrences < 2 || occurrences > 60) {
        setErrorMsg('Informe entre 2 e 60 parcelas ou meses para repetição.');
        return;
      }
      try {
        const batch = generateMonthlyRecurrenceBatch({
          baseTransaction: basePayload,
          occurrences,
          mode: repeatKind,
          amountMode: repeatKind === 'INSTALLMENT' ? amountMode : 'PER_OCCURRENCE',
          futureStatus,
        });
        onSaveBatch(batch);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao gerar parcelas ou recorrência.'
        );
        return;
      }
      clearDraft(DRAFT_KEY);
      onClose();
      return;
    }

    onSave(basePayload, editingTransaction?.id);
    if (!editingTransaction) {
      clearDraft(DRAFT_KEY);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end md:items-center justify-center">
      <div
        className="bg-white dark:bg-slate-900 w-full md:max-w-lg rounded-t-3xl md:rounded-2xl max-h-[94dvh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 dark:border-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-title"
      >
        <header className="shrink-0 bg-[#082B5C] text-white p-5 flex justify-between items-center">
          <h2 id="transaction-title" className="text-lg font-bold">
            {editingTransaction ? 'Editar lançamento' : 'Novo lançamento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-w-11 min-h-11 grid place-items-center text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Fechar formulário"
          >
            <X size={22} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
            {restoredDraftBanner && !editingTransaction && (
              <div className="p-3 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 rounded-xl text-xs flex items-center justify-between gap-2">
                <span>Rascunho anterior restaurado automaticamente após minimização.</span>
                <button
                  type="button"
                  onClick={() => {
                    clearDraft(DRAFT_KEY);
                    setDescription('');
                    setAmount('');
                    setCounterparty('');
                    setExternalId('');
                    setRestoredDraftBanner(false);
                  }}
                  className="font-bold underline cursor-pointer shrink-0"
                >
                  Limpar
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Natureza
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('INCOME')}
                  className={`min-h-12 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                    direction === 'INCOME'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Receita (+)
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('EXPENSE')}
                  className={`min-h-12 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                    direction === 'EXPENSE'
                      ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-400 shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Despesa (−)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-entity" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Vínculo (Titularidade)
                </label>
                <select
                  id="tx-entity"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value as 'CPF' | 'CNPJ')}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                >
                  <option value="CPF">CPF (Pessoal)</option>
                  <option value="CNPJ">CNPJ (MEI / Empresa)</option>
                </select>
              </div>

              <div>
                <label htmlFor="tx-optype" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Tipo de operação
                </label>
                <select
                  id="tx-optype"
                  value={operationType}
                  onChange={(e) => {
                    const op = e.target.value as OperationType;
                    setOperationType(op);
                    if (op === 'TRANSFERENCIA_PROPRIA') setIsInternalTransfer(true);
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                >
                  {OPERATION_TYPES.map((op) => (
                    <option key={op} value={op}>
                      {OPERATION_TYPE_LABELS[op]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tx-desc" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Descrição
              </label>
              <input
                id="tx-desc"
                type="text"
                required
                placeholder="Ex.: Remuneração, Mercado, Venda..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-cat" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Categoria
                </label>
                <select
                  id="tx-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                >
                  {APP_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <MoneyInputField
                id="tx-amount"
                label="Valor (R$)"
                required
                value={amount}
                onChange={setAmount}
                placeholder="0,00"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="tx-date" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Data
                </label>
                <input
                  id="tx-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-base text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                />
              </div>

              <div>
                <label htmlFor="tx-status" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Situação
                </label>
                <select
                  id="tx-status"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as Exclude<TransactionStatus, 'CANCELLED'>)
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-base font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                >
                  <option value="CONFIRMED">Confirmado (Realizado)</option>
                  <option value="PENDING">Pendente (Projetado)</option>
                  <option value="PLANNED">Planejado (Previsão)</option>
                </select>
              </div>

              <div>
                <label htmlFor="tx-account" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Conta vinculada
                </label>
                <select
                  id="tx-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-base font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                >
                  {availableAccounts.length === 0 ? (
                    <option value="" disabled>
                      Nenhuma conta {entityId} disponível
                    </option>
                  ) : (
                    availableAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.institutionName} ({acc.entityId}){acc.archived ? ' [Arquivada]' : ''}
                      </option>
                    ))
                  )}
                </select>
                {availableAccounts.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    Cadastre uma conta {entityId} em Contas Bancárias para associar este lançamento.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-counterparty" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Pagador / Recebedor (opcional)
                </label>
                <input
                  id="tx-counterparty"
                  type="text"
                  placeholder="Ex.: Supermercado Central"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                />
              </div>

              <div>
                <label htmlFor="tx-external-id" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  ID / E2E Pix (opcional)
                </label>
                <input
                  id="tx-external-id"
                  type="text"
                  placeholder="Ex.: E000000002026..."
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternalTransfer}
                onChange={(e) => setIsInternalTransfer(e.target.checked)}
                className="w-5 h-5 min-h-5 accent-emerald-600"
              />
              <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium">
                Transferência entre contas próprias (não somar como receita/despesa)
              </span>
            </label>

            {!editingTransaction && onSaveBatch && (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#082B5C] dark:text-white flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-emerald-600" />
                    Repetição / Parcelamento mensal
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'SINGLE', label: 'Único' },
                      { id: 'INSTALLMENT', label: 'Parcelado (1/N)' },
                      { id: 'RECURRING', label: 'Fixo mensal' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRepeatKind(opt.id)}
                      className={`min-h-10 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        repeatKind === opt.id
                          ? 'bg-[#082B5C] text-white border-[#082B5C] dark:bg-emerald-600 dark:border-emerald-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {repeatKind !== 'SINGLE' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="tx-occurrences"
                          className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Quantidade de meses/parcelas (2–60)
                        </label>
                        <input
                          id="tx-occurrences"
                          type="number"
                          min={2}
                          max={60}
                          value={occurrencesStr}
                          onChange={(e) => setOccurrencesStr(e.target.value)}
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-11"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="tx-future-status"
                          className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Status dos próximos meses
                        </label>
                        <select
                          id="tx-future-status"
                          value={futureStatus}
                          onChange={(e) =>
                            setFutureStatus(e.target.value as 'PENDING' | 'PLANNED')
                          }
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-11"
                        >
                          <option value="PENDING">Pendente (Projetado)</option>
                          <option value="PLANNED">Planejado (Previsão)</option>
                        </select>
                      </div>
                    </div>

                    {repeatKind === 'INSTALLMENT' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAmountMode('PER_OCCURRENCE')}
                          className={`min-h-10 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            amountMode === 'PER_OCCURRENCE'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-400'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          Valor informado é cada parcela
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmountMode('SPLIT_TOTAL')}
                          className={`min-h-10 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                            amountMode === 'SPLIT_TOTAL'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-400'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          Dividir valor total em {occurrencesStr || 'N'}x
                        </button>
                      </div>
                    )}

                    {(() => {
                      try {
                        const parsedCents = parseMoneyInput(amount);
                        const occ = Number(occurrencesStr);
                        if (parsedCents <= 0 || !Number.isSafeInteger(occ) || occ < 2 || occ > 60) {
                          return null;
                        }
                        const prev = previewMonthlyRecurrence({
                          startDate: date,
                          amountCents: parsedCents,
                          occurrences: occ,
                          mode: repeatKind,
                          amountMode: repeatKind === 'INSTALLMENT' ? amountMode : 'PER_OCCURRENCE',
                        });
                        return (
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                            Serão criados <strong>{prev.occurrences} lançamentos</strong> de{' '}
                            <strong>{formatDateBR(prev.firstDate)}</strong> até{' '}
                            <strong>{formatDateBR(prev.lastDate)}</strong> · Parcela{' '}
                            <strong>
                              R$ {fromCents(prev.regularAmountCents).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </strong>{' '}
                            · Total{' '}
                            <strong className="text-[#082B5C] dark:text-emerald-400">
                              R$ {fromCents(prev.totalAmountCents).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </strong>
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[calc(16px+env(safe-area-inset-bottom))] flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl font-semibold text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[1.5] min-h-12 bg-[#082B5C] hover:bg-[#061B3B] dark:bg-[#00A65A] dark:hover:bg-[#00A65A]/90 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-5 h-5" />
              {editingTransaction ? 'Atualizar' : 'Salvar lançamento'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
