import React, { useState, useMemo } from 'react';
import { Boleto, Account } from '../types';
import { calculateCountdown } from '../utils/countdown';
import { validateAndParseBoleto } from '../utils/boletoValidator';
import { parseCurrencyInput, formatCurrencyBRL } from '../utils/financeCalculations';
import { parseMoneyInput, fromCents, subtractMoney, toCents } from '../domain/money/money';
import { generateEntityId } from '../domain/common/id';
import { todayLocal } from '../utils/dateUtils';
import { Sheet } from './Sheet';
import { Check, AlertCircle, Sparkles, Search, Plus, Trash2 } from 'lucide-react';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface BoletosViewProps {
  boletos: Boleto[];
  accounts: Account[];
  onAddBoleto: (boleto: Boleto) => void;
  onPayBoleto: (id: string, accountId: string, paidAmount?: number) => void;
  onDeleteBoleto?: (id: string) => void;
}

export const BoletosView: React.FC<BoletosViewProps> = ({
  boletos,
  accounts,
  onAddBoleto,
  onPayBoleto,
  onDeleteBoleto,
}) => {
  const { hideValues } = usePrivacy();
  const [entryMode, setEntryMode] = useState<'barcode' | 'manual'>('barcode');
  const [linhaInput, setLinhaInput] = useState('');
  const [beneficiarioInput, setBeneficiarioInput] = useState('');
  const [descricaoInput, setDescricaoInput] = useState('');
  const [valorInput, setValorInput] = useState('');
  const [vencimentoInput, setVencimentoInput] = useState(() => todayLocal());
  const [entityInput, setEntityInput] = useState<'CPF' | 'CNPJ'>('CPF');
  const [categoryInput, setCategoryInput] = useState('Moradia');

  const [analyzing, setAnalyzing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [entityFilter, setEntityFilter] = useState<'ALL' | 'CPF' | 'CNPJ'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID' | 'OVERDUE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [payingBoleto, setPayingBoleto] = useState<Boleto | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [paidAmountStr, setPaidAmountStr] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');

  const checkBarcodeDuplicate = (rawCode: string, normalizedCode: string): boolean => {
    const cleanRaw = rawCode.replace(/\D/g, '');
    return boletos.some((b) => {
      const existingClean = b.linhaDigitavel.replace(/\D/g, '');
      if (!existingClean) return false;
      if (existingClean === cleanRaw) return true;
      const parsedExisting = validateAndParseBoleto(existingClean);
      return Boolean(normalizedCode && parsedExisting.normalizedBarcode === normalizedCode);
    });
  };

  const handleAnalyzeBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmed = linhaInput.trim();
    if (!trimmed) return;

    const validation = validateAndParseBoleto(trimmed);
    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Linha digitável inválida.');
      return;
    }

    if (checkBarcodeDuplicate(trimmed, validation.normalizedBarcode)) {
      setErrorMsg('Alerta de duplicidade: este boleto já está cadastrado no sistema.');
      return;
    }

    setAnalyzing(true);
    let aiData: Partial<Boleto> | null = null;

    try {
      const res = await fetch('/api/ai/parse-boleto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhaDigitavel: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        aiData = data.boleto || null;
      }
    } catch {
      // AI enrichment is optional when FEBRABAN validation succeeded
    } finally {
      setAnalyzing(false);
    }

    const isArrecadacao = validation.normalizedBarcode.startsWith('8');
    const resolvedAmount =
      validation.amount > 0 ? validation.amount : parseCurrencyInput(valorInput) || aiData?.valorOriginal || 0;

    if (resolvedAmount <= 0) {
      setErrorMsg(
        'Código validado matematicamente, mas sem valor embutido. Informe o valor no campo abaixo ou cadastre na aba Manual.'
      );
      setValorInput('');
      setVencimentoInput(validation.dueDate || vencimentoInput);
      setEntryMode('manual');
      return;
    }

    const newBol: Boleto = {
      id: generateEntityId('bol'),
      beneficiario:
        beneficiarioInput.trim() || aiData?.beneficiario || (isArrecadacao ? 'Arrecadação / Concessionária' : 'Título Bancário'),
      pagador: aiData?.pagador || (isArrecadacao ? 'CNPJ / Titular' : 'Titular CPF'),
      instituicao: aiData?.instituicao || 'Emissor FEBRABAN',
      linhaDigitavel: validation.normalizedBarcode,
      vencimento: validation.dueDate || aiData?.vencimento || vencimentoInput,
      valorOriginal: resolvedAmount,
      descricao: descricaoInput.trim() || aiData?.descricao || 'Boleto validado por código FEBRABAN',
      status: 'PENDING',
      entityId: aiData?.entityId || (isArrecadacao ? 'CNPJ' : entityInput),
      category: isArrecadacao ? 'Impostos / DAS' : categoryInput,
    };

    onAddBoleto(newBol);
    setLinhaInput('');
    setBeneficiarioInput('');
    setDescricaoInput('');
    setSuccessMsg(
      `Boleto válido adicionado! Valor R$ ${formatCurrencyBRL(newBol.valorOriginal)} · Vencimento ${newBol.vencimento
        .split('-')
        .reverse()
        .join('/')}.`
    );
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!beneficiarioInput.trim()) {
      setErrorMsg('Informe o nome do beneficiário.');
      return;
    }

    let parsedValue: number;
    try {
      const parsedCents = parseMoneyInput(valorInput);
      if (parsedCents <= 0) {
        setErrorMsg('Informe um valor válido maior que zero.');
        return;
      }
      parsedValue = fromCents(parsedCents);
    } catch {
      setErrorMsg('Informe um valor válido maior que zero.');
      return;
    }

    const cleanCode = linhaInput.replace(/\D/g, '');
    if (cleanCode) {
      const check = validateAndParseBoleto(cleanCode);
      if (!check.isValid) {
        setErrorMsg(check.error || 'A linha digitável informada é inválida.');
        return;
      }
      if (checkBarcodeDuplicate(cleanCode, check.normalizedBarcode)) {
        setErrorMsg('Alerta de duplicidade: este código de barras já está cadastrado.');
        return;
      }
    }

    const newBol: Boleto = {
      id: generateEntityId('bol'),
      beneficiario: beneficiarioInput.trim(),
      pagador: entityInput === 'CNPJ' ? 'CNPJ MEI' : 'Titular CPF',
      instituicao: 'Cadastro manual',
      linhaDigitavel: cleanCode,
      vencimento: vencimentoInput,
      valorOriginal: parsedValue,
      descricao: descricaoInput.trim() || beneficiarioInput.trim(),
      status: 'PENDING',
      entityId: entityInput,
      category: categoryInput,
    };

    onAddBoleto(newBol);
    setBeneficiarioInput('');
    setDescricaoInput('');
    setValorInput('');
    setLinhaInput('');
    setSuccessMsg('Conta / boleto cadastrado com sucesso!');
  };

  const filteredBoletos = useMemo(() => {
    return boletos.filter((b) => {
      const countdown = calculateCountdown(b.vencimento, b.status === 'PAID');
      const matchesEntity = entityFilter === 'ALL' || b.entityId === entityFilter;
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'PAID' && b.status === 'PAID') ||
        (statusFilter === 'PENDING' && b.status === 'PENDING') ||
        (statusFilter === 'OVERDUE' && countdown.status === 'OVERDUE');
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        b.beneficiario.toLowerCase().includes(q) ||
        b.descricao.toLowerCase().includes(q);
      return matchesEntity && matchesStatus && matchesSearch;
    });
  }, [boletos, entityFilter, statusFilter, searchQuery]);

  const grouped = useMemo(() => {
    const overdue: Boleto[] = [];
    const upcoming: Boleto[] = [];
    const future: Boleto[] = [];
    const paid: Boleto[] = [];

    filteredBoletos.forEach((b) => {
      if (b.status === 'PAID') {
        paid.push(b);
        return;
      }
      const c = calculateCountdown(b.vencimento, false);
      if (c.status === 'OVERDUE') overdue.push(b);
      else if (c.status === 'DUE_TODAY' || c.status === 'UPCOMING') upcoming.push(b);
      else future.push(b);
    });

    return {
      overdue: overdue.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      upcoming: upcoming.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      future: future.sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
      paid: paid.sort((a, b) => b.vencimento.localeCompare(a.vencimento)),
    };
  }, [filteredBoletos]);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  const openPaymentConfirm = (b: Boleto) => {
    const preferred = activeAccounts.find((a) => a.entityId === b.entityId) || activeAccounts[0];
    setPaymentAccountId(preferred?.id || '');
    setPaidAmountStr(b.valorOriginal.toFixed(2).replace('.', ','));
    setPaymentError('');
    setPayingBoleto(b);
  };

  const confirmPayment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!payingBoleto) return;

    if (!paymentAccountId) {
      setPaymentError('Selecione uma conta bancária ativa para registrar a baixa do boleto.');
      return;
    }

    let parsedPaid: number;
    try {
      const paidCents = parseMoneyInput(paidAmountStr);
      if (paidCents <= 0) {
        setPaymentError('Informe um valor pago válido maior que zero.');
        return;
      }
      parsedPaid = fromCents(paidCents);
    } catch {
      setPaymentError('Informe um valor pago válido maior que zero.');
      return;
    }

    onPayBoleto(payingBoleto.id, paymentAccountId, parsedPaid);
    setSuccessMsg(
      `Pagamento de "${payingBoleto.beneficiario}" registrado (R$ ${formatCurrencyBRL(
        parsedPaid
      )}) com débito na conta selecionada.`
    );
    setPayingBoleto(null);
  };

  const renderGroup = (title: string, items: Boleto[], accentClass: string) => {
    if (items.length === 0) return null;
    return (
      <div className="sf-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className={`font-display text-sm font-bold ${accentClass}`}>{title}</h3>
          <span className="text-xs text-[#64748B] dark:text-slate-400">{items.length} item(ns)</span>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((b) => {
            const countdown = calculateCountdown(b.vencimento, b.status === 'PAID');
            return (
              <div key={b.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {b.beneficiario}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {b.descricao}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-money text-sm font-extrabold text-[#0F172A] dark:text-white">
                      {formatarValor(b.status === 'PAID' && typeof b.paidAmount === 'number' ? b.paidAmount : b.valorOriginal, hideValues)}
                    </div>
                    {b.status === 'PAID' && typeof b.paidAmount === 'number' && Math.abs(b.paidAmount - b.valorOriginal) > 0.009 && (
                      <div className="font-money text-[10px] text-[#64748B] dark:text-slate-400">
                        Orig.: {formatarValor(b.valorOriginal, hideValues)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${countdown.badgeColor}`}>
                      {countdown.shortLabel}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {b.vencimento.split('-').reverse().join('/')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {b.entityId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {b.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => openPaymentConfirm(b)}
                        className="px-3 min-h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Pagar
                      </button>
                    )}
                    {onDeleteBoleto && (
                      <button
                        type="button"
                        onClick={() => onDeleteBoleto(b.id)}
                        className="min-w-10 min-h-10 grid place-items-center text-slate-400 hover:text-red-600 cursor-pointer"
                        aria-label={`Remover ${b.beneficiario}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-6 font-semibold">Beneficiário / Descrição</th>
                <th className="py-3 px-6 font-semibold">Vínculo</th>
                <th className="py-3 px-6 font-semibold">Vencimento & Contador</th>
                <th className="py-3 px-6 font-semibold text-right">Valor Original</th>
                <th className="py-3 px-6 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((b) => {
                const countdown = calculateCountdown(b.vencimento, b.status === 'PAID');
                return (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800 dark:text-white">{b.beneficiario}</div>
                      <small className="text-slate-400">{b.descricao}</small>
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.entityId === 'CPF'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {b.entityId}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {b.vencimento.split('-').reverse().join('/')}
                      </div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${countdown.badgeColor}`}>
                        {countdown.label}
                      </span>
                    </td>
                    <td className="font-money py-4 px-6 text-right font-extrabold text-[#0F172A] dark:text-white">
                      <div>
                        {formatarValor(b.status === 'PAID' && typeof b.paidAmount === 'number' ? b.paidAmount : b.valorOriginal, hideValues)}
                      </div>
                      {b.status === 'PAID' && typeof b.paidAmount === 'number' && Math.abs(b.paidAmount - b.valorOriginal) > 0.009 && (
                        <small className="font-normal text-[#64748B] dark:text-slate-400">
                          Original: {formatarValor(b.valorOriginal, hideValues)}
                        </small>
                      )}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex items-center gap-2">
                        {b.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => openPaymentConfirm(b)}
                            className="px-3 py-1.5 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                          >
                            Marcar como Pago
                          </button>
                        )}
                        {onDeleteBoleto && (
                          <button
                            type="button"
                            onClick={() => onDeleteBoleto(b.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-md text-[10px] font-bold">
            VALIDAÇÃO FEBRABAN MOD 10/11
          </span>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-white">
            Boletos e Contas a Pagar
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
          Validação matemática real de código de barras (44, 47 e 48 dígitos), prevenção de duplicidade e controle por vencimento.
        </p>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Entry Card */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="sf-icon-badge">
              <Sparkles size={18} strokeWidth={2} />
            </span>
            <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
              Adicionar Boleto ou Conta a Pagar
            </h3>
          </div>

          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setEntryMode('barcode')}
              className={`px-3 min-h-9 rounded-lg text-xs font-semibold cursor-pointer ${
                entryMode === 'barcode'
                  ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white'
                  : 'text-[#64748B] dark:text-slate-400'
              }`}
            >
              Linha digitável
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('manual')}
              className={`px-3 min-h-9 rounded-lg text-xs font-semibold cursor-pointer ${
                entryMode === 'manual'
                  ? 'bg-white dark:bg-slate-900 text-[#0F172A] dark:text-white'
                  : 'text-[#64748B] dark:text-slate-400'
              }`}
            >
              Cadastro manual
            </button>
          </div>
        </div>

        {entryMode === 'barcode' ? (
          <form onSubmit={handleAnalyzeBarcode} className="space-y-4">
            <div>
              <label htmlFor="bol-linha" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Linha digitável ou código de barras (44, 47 ou 48 dígitos)
              </label>
              <input
                id="bol-linha"
                type="text"
                required
                placeholder="Digite ou cole os dígitos do boleto"
                value={linhaInput}
                onChange={(e) => setLinhaInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-white outline-none focus:border-emerald-500 bg-slate-50/50 dark:bg-slate-800 min-h-12"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Beneficiário (opcional — ex.: Enel, Condomínio)"
                value={beneficiarioInput}
                onChange={(e) => setBeneficiarioInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              />
              <select
                aria-label="Vínculo do boleto"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value as 'CPF' | 'CNPJ')}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              >
                <option value="CPF">Vínculo CPF (Pessoal)</option>
                <option value="CNPJ">Vínculo CNPJ (Empresa)</option>
              </select>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Validação matemática Módulo 10/11 e deduplicação automática por código normalizado.
              </span>
              <button
                type="submit"
                disabled={analyzing}
                className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-6 min-h-12 rounded-xl text-sm font-bold transition-all cursor-pointer shrink-0"
              >
                {analyzing ? 'Validando boleto...' : 'Validar e Adicionar Boleto'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Beneficiário (ex.: Aluguel, Fornecedor)"
                value={beneficiarioInput}
                onChange={(e) => setBeneficiarioInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              />
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder="Valor R$ (ex.: 250,00)"
                value={valorInput}
                onChange={(e) => setValorInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="date"
                required
                value={vencimentoInput}
                onChange={(e) => setVencimentoInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              />
              <select
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value as 'CPF' | 'CNPJ')}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              >
                <option value="CPF">CPF (Pessoal)</option>
                <option value="CNPJ">CNPJ (Empresa)</option>
              </select>
              <select
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
              >
                <option value="Moradia">Moradia</option>
                <option value="Impostos / DAS">Impostos / DAS</option>
                <option value="Insumos / Produção">Insumos / Produção</option>
                <option value="Cartão">Cartão</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Descrição ou código de barras (opcional)"
              value={descricaoInput}
              onChange={(e) => setDescricaoInput(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
            />

            <button
              type="submit"
              className="w-full sm:w-auto bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-6 min-h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={16} /> Salvar Conta a Pagar
            </button>
          </form>
        )}
      </div>

      {/* Filters */}
      <div className="sf-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por beneficiário ou descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none bg-slate-50/50 dark:bg-slate-800 dark:text-white focus:border-emerald-500 min-h-12"
          />
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          <select
            aria-label="Filtrar vínculo"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value as 'ALL' | 'CPF' | 'CNPJ')}
            className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none min-h-12"
          >
            <option value="ALL">CPF e CNPJ</option>
            <option value="CPF">Apenas CPF</option>
            <option value="CNPJ">Apenas CNPJ</option>
          </select>

          <select
            aria-label="Filtrar situação"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'PAID' | 'OVERDUE')}
            className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none min-h-12"
          >
            <option value="ALL">Todas situações</option>
            <option value="PENDING">Pendentes</option>
            <option value="OVERDUE">Vencidos</option>
            <option value="PAID">Pagos</option>
          </select>
        </div>
      </div>

      {/* Grouped Lists */}
      {filteredBoletos.length === 0 ? (
        <div className="sf-card p-8 text-center text-sm text-[#64748B] dark:text-slate-400">
          Nenhum boleto encontrado com os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-5">
          {renderGroup('1. Boletos Vencidos', grouped.overdue, 'text-red-700 dark:text-red-400')}
          {renderGroup('2. Próximos do Vencimento (Hoje até 3 dias)', grouped.upcoming, 'text-amber-700 dark:text-amber-400')}
          {renderGroup('3. Boletos Futuros', grouped.future, 'text-[#0F172A] dark:text-white')}
          {renderGroup('4. Boletos Pagos', grouped.paid, 'text-[#059669] dark:text-[#10B981]')}
        </div>
      )}

      {/* Payment Sheet (Conta obrigatória + Valor pago) */}
      <Sheet
        open={Boolean(payingBoleto)}
        onClose={() => setPayingBoleto(null)}
        title="Confirmar pagamento de boleto"
        subtitle={payingBoleto ? payingBoleto.beneficiario : undefined}
      >
        {payingBoleto && (
          <form onSubmit={confirmPayment} className="space-y-4">
            {paymentError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800 text-xs space-y-1">
              <div className="font-bold text-[#0F172A] dark:text-white">{payingBoleto.beneficiario}</div>
              <div className="text-[#64748B] dark:text-slate-400">
                Valor original: <strong className="font-money text-[#0F172A] dark:text-slate-200">{formatarValor(payingBoleto.valorOriginal, hideValues)}</strong>
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                Vencimento: {payingBoleto.vencimento.split('-').reverse().join('/')}
              </div>
            </div>

            <div>
              <label htmlFor="pay-amount" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Valor efetivamente pago (R$) *
              </label>
              <input
                id="pay-amount"
                type="text"
                inputMode="decimal"
                required
                value={paidAmountStr}
                onChange={(e) => {
                  setPaidAmountStr(e.target.value);
                  setPaymentError('');
                }}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
              />
              {(() => {
                let diffCents = 0;
                try {
                  const paidCents = parseMoneyInput(paidAmountStr);
                  const origCents = toCents(payingBoleto.valorOriginal);
                  diffCents = subtractMoney(paidCents, origCents);
                } catch {
                  return null;
                }
                if (diffCents === 0) return null;
                const absDiff = fromCents(Math.abs(diffCents) as ReturnType<typeof toCents>);
                return (
                  <p className={`text-[11px] font-semibold mt-1 ${diffCents > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {diffCents > 0
                      ? `Inclui juros/multa de ${formatarValor(absDiff, hideValues)}`
                      : `Com desconto de ${formatarValor(absDiff, hideValues)}`}
                  </p>
                );
              })()}
            </div>

            <div>
              <label htmlFor="pay-account" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Conta pagadora (obrigatória) *
              </label>
              {activeAccounts.length === 0 ? (
                <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 font-semibold">
                  Cadastre ou reative uma conta bancária em &quot;Contas&quot; para poder dar baixa em boletos.
                </p>
              ) : (
                <select
                  id="pay-account"
                  required
                  value={paymentAccountId}
                  onChange={(e) => {
                    setPaymentAccountId(e.target.value);
                    setPaymentError('');
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-white min-h-12"
                >
                  <option value="" disabled>
                    Selecione uma conta bancária...
                  </option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.institutionName} · {a.accountName} ({a.entityId})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPayingBoleto(null)}
                className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={activeAccounts.length === 0}
                className="flex-[1.5] min-h-12 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Confirmar baixa
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
};
