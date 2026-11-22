import React, { useState } from 'react';
import { Account, Debt } from '../types';
import { toCents, fromCents, formatCurrencyBRL } from '../utils/financeCalculations';
import { parseMoneyInput } from '../domain/money/money';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { MoneyInputField } from './MoneyInputField';
import { Plus, ShieldAlert, Trash2, AlertCircle, CheckCircle2, Banknote } from 'lucide-react';
import { Sheet } from './Sheet';

interface DebtsViewProps {
  debts: Debt[];
  accounts?: Account[];
  onAddDebt: (debt: Omit<Debt, 'id'>) => void;
  onAmortizeDebt?: (debtId: string, paidAmount: number, accountId?: string) => void;
  onDeleteDebt: (id: string) => void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({
  debts,
  accounts = [],
  onAddDebt,
  onAmortizeDebt,
  onDeleteDebt,
}) => {
  const isDesktop = useIsDesktop();
  const [modalOpen, setModalOpen] = useState(false);
  const [amortizeTarget, setAmortizeTarget] = useState<Debt | null>(null);
  const [amortizeAmountStr, setAmortizeAmountStr] = useState('');
  const [amortizeAccountId, setAmortizeAccountId] = useState('');
  const [amortizeError, setAmortizeError] = useState('');

  const [creditorName, setCreditorName] = useState('');
  const [description, setDescription] = useState('');
  const [entityId, setEntityId] = useState<'CPF' | 'CNPJ'>('CPF');
  const [originalStr, setOriginalStr] = useState('');
  const [outstandingStr, setOutstandingStr] = useState('');
  const [installmentStr, setInstallmentStr] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [errorMsg, setErrorMsg] = useState('');

  const activeAccounts = accounts.filter((a) => !a.archived);

  const openAmortizeModal = (debt: Debt) => {
    const suggested =
      debt.installmentAmount && debt.installmentAmount > 0 && debt.installmentAmount < debt.outstandingAmount
        ? debt.installmentAmount
        : debt.outstandingAmount;
    const preferred = activeAccounts.find((a) => a.entityId === debt.entityId) || activeAccounts[0];
    setAmortizeAmountStr(suggested.toFixed(2).replace('.', ','));
    setAmortizeAccountId(preferred?.id || '');
    setAmortizeError('');
    setAmortizeTarget(debt);
  };

  const totalDebt = fromCents(
    debts
      .filter((d) => d.status !== 'PAID')
      .reduce((acc, d) => acc + toCents(d.outstandingAmount), 0)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let origCents;
    let outCents;
    let instCents;
    try {
      origCents = parseMoneyInput(originalStr);
      outCents = outstandingStr.trim() ? parseMoneyInput(outstandingStr) : origCents;
      instCents = installmentStr.trim() ? parseMoneyInput(installmentStr) : undefined;
    } catch {
      setErrorMsg('Informe valores monetários válidos (ex.: 1500,00).');
      return;
    }
    const dDay = Number(dueDay);

    if (!creditorName.trim() || !description.trim()) {
      setErrorMsg('Informe o credor e a descrição da dívida.');
      return;
    }
    if (origCents <= 0 || outCents < 0) {
      setErrorMsg('Informe valores válidos.');
      return;
    }
    if (dDay < 1 || dDay > 31) {
      setErrorMsg('O dia de vencimento deve ser entre 1 e 31.');
      return;
    }

    onAddDebt({
      entityId,
      creditorName: creditorName.trim(),
      description: description.trim(),
      originalAmount: fromCents(origCents),
      outstandingAmount: fromCents(outCents),
      installmentAmount: instCents !== undefined && instCents > 0 ? fromCents(instCents) : undefined,
      dueDay: dDay,
      status: outCents === 0 ? 'PAID' : 'ACTIVE',
    });

    setCreditorName('');
    setDescription('');
    setOriginalStr('');
    setOutstandingStr('');
    setInstallmentStr('');
    setModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
            Dívidas e Compromissos Futuros
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Acompanhamento de financiamentos, empréstimos e parcelamentos de longo prazo.
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
          Registrar dívida
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-slate-400">Saldo Devedor Total</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-red-700 dark:text-red-400 mt-1">
            R$ {formatCurrencyBRL(totalDebt)}
          </div>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 rounded-2xl">
          <ShieldAlert className="w-8 h-8" />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">Compromissos ativos</h3>
          <span className="text-xs text-slate-400">{debts.length} registros</span>
        </div>

        {debts.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhuma dívida cadastrada.
          </p>
        ) : !isDesktop ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {debts.map((d) => (
              <div key={d.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {d.creditorName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{d.description}</div>
                  </div>
                  <div className="text-sm font-extrabold text-red-700 dark:text-red-400">
                    R$ {formatCurrencyBRL(d.outstandingAmount)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Parcela:{' '}
                    {d.installmentAmount ? `R$ ${formatCurrencyBRL(d.installmentAmount)}` : '—'} · Dia{' '}
                    {d.dueDay}
                  </span>
                  <div className="flex items-center gap-1">
                    {onAmortizeDebt && d.status !== 'PAID' && d.outstandingAmount > 0 && (
                      <button
                        type="button"
                        onClick={() => openAmortizeModal(d)}
                        className="px-2.5 min-h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Banknote size={14} /> Amortizar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteDebt(d.id)}
                      className="min-w-10 min-h-10 grid place-items-center text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Remover ${d.creditorName}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-6 font-semibold">Credor / Descrição</th>
                  <th className="py-3 px-6 font-semibold">Vínculo</th>
                  <th className="py-3 px-6 font-semibold text-right">Valor Original</th>
                  <th className="py-3 px-6 font-semibold text-right">Saldo Devedor</th>
                  <th className="py-3 px-6 font-semibold text-right">Parcela Mensal</th>
                  <th className="py-3 px-6 font-semibold text-center">Vencimento</th>
                  <th className="py-3 px-6 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {debts.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800 dark:text-white">{d.creditorName}</div>
                      <small className="text-slate-400">{d.description}</small>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px] font-bold">
                        {d.entityId}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-medium text-slate-600 dark:text-slate-300">
                      R$ {formatCurrencyBRL(d.originalAmount)}
                    </td>
                    <td className="py-4 px-6 text-right font-extrabold text-red-700 dark:text-red-400">
                      R$ {formatCurrencyBRL(d.outstandingAmount)}
                    </td>
                    <td className="py-4 px-6 text-right font-bold text-slate-800 dark:text-slate-200">
                      {d.installmentAmount ? `R$ ${formatCurrencyBRL(d.installmentAmount)}` : '—'}
                    </td>
                    <td className="py-4 px-6 text-center text-slate-600 dark:text-slate-300 font-medium">
                      Dia {d.dueDay}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex items-center gap-1">
                        {onAmortizeDebt && d.status !== 'PAID' && d.outstandingAmount > 0 && (
                          <button
                            type="button"
                            onClick={() => openAmortizeModal(d)}
                            className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="Registrar pagamento / amortização"
                          >
                            <Banknote size={14} /> Amortizar
                          </button>
                        )}
                        {d.status === 'PAID' && (
                          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-bold">
                            Quitada
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteDebt(d.id)}
                          className="p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Debt Sheet */}
      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar dívida / financiamento"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} /> {errorMsg}
            </div>
          )}

          <input
            type="text"
            required
            placeholder="Credor (ex.: Banco do Brasil, Financeira)"
            value={creditorName}
            onChange={(e) => setCreditorName(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
          />

          <input
            type="text"
            required
            placeholder="Descrição (ex.: Financiamento veículo)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MoneyInputField
              label="Valor original (R$)"
              required
              placeholder="0,00"
              value={originalStr}
              onChange={setOriginalStr}
            />
            <MoneyInputField
              label="Saldo devedor (R$)"
              allowZero
              placeholder="0,00"
              value={outstandingStr}
              onChange={setOutstandingStr}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Parcela (R$)"
              value={installmentStr}
              onChange={(e) => setInstallmentStr(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            />
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Dia"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            />
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value as 'CPF' | 'CNPJ')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
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
              <CheckCircle2 size={16} /> Salvar dívida
            </button>
          </div>
        </form>
      </Sheet>

      {/* Amortize Debt Sheet */}
      <Sheet
        open={Boolean(amortizeTarget)}
        onClose={() => setAmortizeTarget(null)}
        title={amortizeTarget ? `Amortizar · ${amortizeTarget.creditorName}` : 'Amortizar dívida'}
        subtitle="Abate o saldo devedor e opcionalmente registra a saída na conta bancária"
      >
        {amortizeTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAmortizeError('');
              if (!onAmortizeDebt) return;

              let centsVal;
              try {
                centsVal = parseMoneyInput(amortizeAmountStr);
              } catch (err) {
                setAmortizeError(err instanceof Error ? err.message : 'Informe um valor válido.');
                return;
              }
              if (centsVal <= 0) {
                setAmortizeError('Informe um valor maior que zero.');
                return;
              }

              onAmortizeDebt(
                amortizeTarget.id,
                fromCents(centsVal),
                amortizeAccountId || undefined
              );
              setAmortizeTarget(null);
            }}
            className="space-y-4"
          >
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
              <div className="font-bold text-slate-800 dark:text-white">{amortizeTarget.description}</div>
              <div>
                Saldo devedor atual:{' '}
                <strong className="text-red-700 dark:text-red-400">
                  R$ {formatCurrencyBRL(amortizeTarget.outstandingAmount)}
                </strong>
              </div>
            </div>

            {amortizeError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={16} /> {amortizeError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Valor do pagamento / amortização (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amortizeAmountStr}
                onChange={(e) => setAmortizeAmountStr(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Debitar pagamento da conta:
              </label>
              <select
                value={amortizeAccountId}
                onChange={(e) => setAmortizeAccountId(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              >
                <option value="">Apenas abater saldo devedor (sem lançar em conta)</option>
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
                onClick={() => setAmortizeTarget(null)}
                className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-[1.5] min-h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Confirmar amortização
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
};
