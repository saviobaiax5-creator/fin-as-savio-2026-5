import React, { useState } from 'react';
import { CreditCard as CreditCardType, Account } from '../types';
import { formatCurrencyBRL } from '../utils/financeCalculations';
import { addMoney, fromCents, parseMoneyInput, subtractMoney, toCents } from '../domain/money/money';
import { CreditCard, Plus, AlertCircle, CheckCircle2, Trash2, ReceiptText } from 'lucide-react';
import { Sheet } from './Sheet';
import { MoneyInputField } from './MoneyInputField';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface CardsViewProps {
  cards: CreditCardType[];
  accounts: Account[];
  onAddCard: (card: Omit<CreditCardType, 'id'>) => void;
  onPayCardInvoice: (cardId: string, accountId?: string, paidAmount?: number) => void;
  onUpdateCardInvoice?: (cardId: string, amount: number, mode: 'add' | 'set') => void;
  onDeleteCard: (id: string) => void;
}

export const CardsView: React.FC<CardsViewProps> = ({
  cards,
  accounts,
  onAddCard,
  onPayCardInvoice,
  onUpdateCardInvoice,
  onDeleteCard,
}) => {
  const { hideValues } = usePrivacy();
  const [modalOpen, setModalOpen] = useState(false);
  const [payModalCard, setPayModalCard] = useState<CreditCardType | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAmountStr, setPaymentAmountStr] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [chargeModalCard, setChargeModalCard] = useState<CreditCardType | null>(null);
  const [chargeMode, setChargeMode] = useState<'add' | 'set'>('add');
  const [chargeAmountStr, setChargeAmountStr] = useState('');
  const [chargeError, setChargeError] = useState('');

  const [cardName, setCardName] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [last4, setLast4] = useState('');
  const [entityId, setEntityId] = useState<'CPF' | 'CNPJ'>('CPF');
  const [limitStr, setLimitStr] = useState('');
  const [invoiceStr, setInvoiceStr] = useState('0,00');
  const [closingDay, setClosingDay] = useState('10');
  const [dueDay, setDueDay] = useState('17');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let limitCents;
    let invoiceCents;
    try {
      limitCents = parseMoneyInput(limitStr);
    } catch {
      setErrorMsg('Informe um limite válido maior que zero.');
      return;
    }
    try {
      invoiceCents = invoiceStr.trim() ? parseMoneyInput(invoiceStr) : toCents(0);
    } catch {
      setErrorMsg('Informe um valor de fatura válido.');
      return;
    }
    const cleanLast4 = last4.replace(/\D/g, '').slice(0, 4);
    const cDay = Number(closingDay);
    const dDay = Number(dueDay);

    if (!cardName.trim() || !institutionName.trim()) {
      setErrorMsg('Informe o nome e a instituição do cartão.');
      return;
    }
    if (cleanLast4.length !== 4) {
      setErrorMsg('Informe exatamente os 4 últimos dígitos do cartão (nunca o número completo).');
      return;
    }
    if (limitCents <= 0) {
      setErrorMsg('Informe um limite válido maior que zero.');
      return;
    }
    if (cDay < 1 || cDay > 31 || dDay < 1 || dDay > 31) {
      setErrorMsg('Dias de fechamento e vencimento devem estar entre 1 e 31.');
      return;
    }

    onAddCard({
      entityId,
      institutionName: institutionName.trim(),
      cardName: cardName.trim(),
      last4: cleanLast4,
      limit: fromCents(limitCents),
      closingDay: cDay,
      dueDay: dDay,
      currentInvoiceAmount: fromCents(invoiceCents),
      status: invoiceCents > 0 ? 'OPEN' : 'PAID',
    });

    setCardName('');
    setInstitutionName('');
    setLast4('');
    setLimitStr('');
    setInvoiceStr('0,00');
    setModalOpen(false);
  };

  const activeAccounts = accounts.filter((a) => !a.archived);

  const openPayModal = (card: CreditCardType) => {
    const preferred = activeAccounts.find((a) => a.entityId === card.entityId) || activeAccounts[0];
    setPaymentAccountId(preferred?.id || '');
    setPaymentAmountStr(card.currentInvoiceAmount.toFixed(2).replace('.', ','));
    setPaymentError('');
    setPayModalCard(card);
  };

  const confirmPayInvoice = () => {
    if (!payModalCard) return;
    setPaymentError('');
    let paidCents;
    try {
      paidCents = parseMoneyInput(paymentAmountStr);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Informe um valor válido.');
      return;
    }
    if (paidCents <= 0) {
      setPaymentError('Informe um valor maior que zero.');
      return;
    }
    onPayCardInvoice(payModalCard.id, paymentAccountId || undefined, fromCents(paidCents));
    setPayModalCard(null);
  };

  const openChargeModal = (card: CreditCardType) => {
    setChargeMode('add');
    setChargeAmountStr('');
    setChargeError('');
    setChargeModalCard(card);
  };

  const confirmUpdateInvoice = () => {
    if (!chargeModalCard || !onUpdateCardInvoice) return;
    setChargeError('');
    let amountCents;
    try {
      amountCents = parseMoneyInput(chargeAmountStr);
    } catch (err) {
      setChargeError(err instanceof Error ? err.message : 'Informe um valor válido.');
      return;
    }
    if (chargeMode === 'add' && amountCents <= 0) {
      setChargeError('Informe um valor maior que zero para lançar na fatura.');
      return;
    }
    if (amountCents < 0) {
      setChargeError('O valor da fatura não pode ser negativo.');
      return;
    }
    onUpdateCardInvoice(chargeModalCard.id, fromCents(amountCents), chargeMode);
    setChargeModalCard(null);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
            Cartões de Crédito
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Faturas em aberto, limite utilizado/disponível e datas de fechamento. Armazenamos apenas os 4 últimos dígitos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setErrorMsg('');
            setModalOpen(true);
          }}
          className="bg-[#082B5C] hover:bg-[#061B3B] dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo cartão
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {cards.map((card) => {
          const limitCents = toCents(card.limit);
          const invoiceCents = toCents(card.currentInvoiceAmount);
          const available = Math.max(0, fromCents(subtractMoney(limitCents, invoiceCents)));
          const usagePct = limitCents > 0 ? Math.min(100, Math.round((invoiceCents / limitCents) * 100)) : 0;

          return (
            <div
              key={card.id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[#082B5C] dark:text-emerald-400">
                    <CreditCard className="w-5 h-5" />
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        card.entityId === 'CPF'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}
                    >
                      {card.entityId}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteCard(card.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Remover ${card.cardName}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-[#082B5C] dark:text-white">{card.cardName}</h3>
                <p className="text-xs text-slate-400 mb-4">
                  Final ···· {card.last4} ({card.institutionName})
                </p>

                <div className="space-y-2 text-xs py-3 border-y border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Limite total:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {formatarValor(card.limit, hideValues)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Disponível:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {formatarValor(available, hideValues)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${usagePct > 80 ? 'bg-red-500' : 'bg-emerald-600'}`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500 dark:text-slate-400">Fechamento / Vencimento:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Dia {card.closingDay} / Dia {card.dueDay}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <small className="text-[11px] text-slate-400 block">
                      {card.status === 'PAID' ? 'Fatura quitada' : 'Fatura atual em aberto'}
                    </small>
                    <span
                      className={`text-base font-extrabold ${
                        card.currentInvoiceAmount > 0
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {formatarValor(card.currentInvoiceAmount, hideValues)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {onUpdateCardInvoice && (
                      <button
                        type="button"
                        onClick={() => openChargeModal(card)}
                        className="px-3 min-h-10 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <ReceiptText size={14} /> Fatura
                      </button>
                    )}
                    {card.currentInvoiceAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => openPayModal(card)}
                        className="px-3.5 min-h-10 bg-[#082B5C] dark:bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-[#061B3B] dark:hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        Pagar Fatura
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Card Sheet */}
      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo cartão"
        subtitle="Armazenamos apenas os 4 últimos dígitos"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="Nome do cartão (ex.: Inter Black)"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            />
            <input
              type="text"
              required
              placeholder="Instituição (ex.: Banco Inter)"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                4 últimos dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="Ex.: 4821"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Vínculo
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value as 'CPF' | 'CNPJ')}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MoneyInputField
              label="Limite total (R$)"
              required
              placeholder="8000,00"
              value={limitStr}
              onChange={setLimitStr}
            />
            <MoneyInputField
              label="Fatura atual (R$)"
              allowZero
              value={invoiceStr}
              onChange={setInvoiceStr}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Dia fechamento
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Dia vencimento
              </label>
              <input
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-[1.5] min-h-12 bg-[#082B5C] dark:bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 size={16} /> Salvar cartão
            </button>
          </div>
        </form>
      </Sheet>

      {/* Pay Invoice Sheet */}
      <Sheet
        open={Boolean(payModalCard)}
        onClose={() => setPayModalCard(null)}
        title={payModalCard ? `Pagar fatura · ${payModalCard.cardName}` : 'Pagar fatura'}
      >
        {payModalCard && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
              Valor da fatura:{' '}
              <strong className="text-red-700 dark:text-red-400">
                {formatarValor(payModalCard.currentInvoiceAmount, hideValues)}
              </strong>
            </div>

            {paymentError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={16} /> {paymentError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Valor do pagamento (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={paymentAmountStr}
                onChange={(e) => setPaymentAmountStr(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Debitar pagamento da conta:
              </label>
              <select
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              >
                <option value="">Apenas abater fatura</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.institutionName} · {a.accountName} ({a.entityId})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPayModalCard(null)}
                className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPayInvoice}
                className="flex-[1.5] min-h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Confirmar pagamento
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Charge / Adjust Invoice Sheet */}
      <Sheet
        open={Boolean(chargeModalCard)}
        onClose={() => setChargeModalCard(null)}
        title={chargeModalCard ? `Atualizar fatura · ${chargeModalCard.cardName}` : 'Atualizar fatura'}
        subtitle="Soma novas compras ou ajusta o total fechado sem alterar saldo bancário até o pagamento."
      >
        {chargeModalCard && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-300">Fatura atual:</span>
              <strong className="text-[#082B5C] dark:text-white">
                {formatarValor(chargeModalCard.currentInvoiceAmount, hideValues)}
              </strong>
            </div>

            {chargeError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={16} /> {chargeError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setChargeMode('add');
                  setChargeAmountStr('');
                  setChargeError('');
                }}
                className={`min-h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  chargeMode === 'add'
                    ? 'bg-[#082B5C] text-white border-[#082B5C] dark:bg-emerald-600 dark:border-emerald-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Somar compra (+)
              </button>
              <button
                type="button"
                onClick={() => {
                  setChargeMode('set');
                  setChargeAmountStr(chargeModalCard.currentInvoiceAmount.toFixed(2).replace('.', ','));
                  setChargeError('');
                }}
                className={`min-h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  chargeMode === 'set'
                    ? 'bg-[#082B5C] text-white border-[#082B5C] dark:bg-emerald-600 dark:border-emerald-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                Definir valor total
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {chargeMode === 'add' ? 'Valor da compra/lançamento (R$)' : 'Novo valor da fatura (R$)'}
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={chargeAmountStr}
                onChange={(e) => {
                  setChargeAmountStr(e.target.value);
                  setChargeError('');
                }}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
              {(() => {
                try {
                  const parsedCents = parseMoneyInput(chargeAmountStr);
                  const currentCents = toCents(chargeModalCard.currentInvoiceAmount);
                  const nextCents =
                    chargeMode === 'add' ? addMoney(currentCents, parsedCents) : parsedCents;
                  return (
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5">
                      Fatura resultante:{' '}
                      <strong className="text-[#082B5C] dark:text-emerald-400">
                        R$ {formatCurrencyBRL(fromCents(nextCents))}
                      </strong>
                    </p>
                  );
                } catch {
                  return null;
                }
              })()}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setChargeModalCard(null)}
                className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmUpdateInvoice}
                className="flex-[1.5] min-h-12 bg-[#082B5C] dark:bg-emerald-600 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Salvar na fatura
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
};
