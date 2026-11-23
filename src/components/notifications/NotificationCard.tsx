import React, { useMemo, useState } from 'react';
import {
  APP_CATEGORIES,
  Account,
  CreditCard,
  Direction,
  OperationType,
} from '../../types';
import {
  fromCents,
  parseMoneyInput,
  toCents,
} from '../../domain/money/money';
import { formatDateBR } from '../../utils/dateUtils';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import type {
  BankNotificationViewItem,
  NotificationKind,
  NotificationReviewResolution,
} from '../../domain/notifications/notification.types';
import { MoneyInputField } from '../MoneyInputField';
import {
  AlertTriangle,
  Check,
  CreditCard as CreditCardIcon,
  Eye,
  EyeOff,
  Landmark,
  Trash2,
} from 'lucide-react';

const KIND_LABELS: Record<NotificationKind, string> = {
  CREDIT_PURCHASE: 'Compra no crédito (fatura)',
  DEBIT_PURCHASE: 'Compra no débito / saída',
  PIX_IN: 'Pix recebido (entrada)',
  PIX_OUT: 'Pix enviado (saída)',
  INVOICE_PAYMENT: 'Pagamento de fatura',
  INTERNAL_TRANSFER: 'Transferência própria',
  BOLETO: 'Pagamento de boleto / guia',
  FEE: 'Tarifa / encargo bancário',
  REFUND: 'Estorno / reembolso',
  DECLINED: 'Operação recusada',
  UNKNOWN: 'Revisão manual necessária',
};

const EDITABLE_KINDS: NotificationKind[] = [
  'CREDIT_PURCHASE',
  'DEBIT_PURCHASE',
  'PIX_IN',
  'PIX_OUT',
  'INVOICE_PAYMENT',
  'INTERNAL_TRANSFER',
  'BOLETO',
  'FEE',
  'REFUND',
];

function inferDirectionAndOp(kind: NotificationKind, fallbackDir: Direction | null): {
  direction: Direction;
  operationType: OperationType;
  isInternalTransfer: boolean;
} {
  switch (kind) {
    case 'PIX_IN':
      return { direction: 'INCOME', operationType: 'PIX', isInternalTransfer: false };
    case 'REFUND':
      return { direction: 'INCOME', operationType: 'OUTRO', isInternalTransfer: false };
    case 'PIX_OUT':
      return { direction: 'EXPENSE', operationType: 'PIX', isInternalTransfer: false };
    case 'CREDIT_PURCHASE':
    case 'INVOICE_PAYMENT':
      return { direction: 'EXPENSE', operationType: 'CARTAO', isInternalTransfer: false };
    case 'DEBIT_PURCHASE':
      return { direction: 'EXPENSE', operationType: 'CARTAO', isInternalTransfer: false };
    case 'BOLETO':
      return { direction: 'EXPENSE', operationType: 'BOLETO', isInternalTransfer: false };
    case 'FEE':
      return { direction: 'EXPENSE', operationType: 'TARIFA', isInternalTransfer: false };
    case 'INTERNAL_TRANSFER':
      return {
        direction: fallbackDir || 'EXPENSE',
        operationType: 'TRANSFERENCIA_PROPRIA',
        isInternalTransfer: true,
      };
    default:
      return { direction: fallbackDir || 'EXPENSE', operationType: 'OUTRO', isInternalTransfer: false };
  }
}

interface NotificationCardProps {
  item: BankNotificationViewItem;
  accounts: Account[];
  creditCards: CreditCard[];
  maskSensitivePreview: boolean;
  onConfirm: (resolution: NotificationReviewResolution) => void;
  onDiscard: (notificationId: string, reason?: string) => void;
}

export const NotificationCard: React.FC<NotificationCardProps> = ({
  item,
  accounts,
  creditCards,
  maskSensitivePreview,
  onConfirm,
  onDiscard,
}) => {
  const { hideValues } = usePrivacy();
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const { payload } = item;

  const initialKind: NotificationKind =
    payload.kind === 'DECLINED' || payload.kind === 'UNKNOWN' ? 'DEBIT_PURCHASE' : payload.kind;

  // Auto-match best account & card strictly from user's own accounts/cards
  const matchedCard = useMemo(() => {
    if (payload.cardLast4) {
      const byLast4 = creditCards.find((c) => c.last4 === payload.cardLast4);
      if (byLast4) return byLast4;
    }
    if (payload.institutionName) {
      const inst = payload.institutionName.toLowerCase();
      return creditCards.find((c) => c.institutionName.toLowerCase().includes(inst));
    }
    return creditCards[0];
  }, [creditCards, payload.cardLast4, payload.institutionName]);

  const matchedAccount = useMemo(() => {
    if (payload.institutionName) {
      const inst = payload.institutionName.toLowerCase();
      const byInst = activeAccounts.find((a) =>
        a.institutionName.toLowerCase().includes(inst)
      );
      if (byInst) return byInst;
    }
    return activeAccounts[0];
  }, [activeAccounts, payload.institutionName]);

  const [showExcerpt, setShowExcerpt] = useState(!maskSensitivePreview);
  const [kind, setKind] = useState<NotificationKind>(initialKind);
  const [description, setDescription] = useState(() => {
    if (payload.merchantOrCounterparty) {
      return payload.merchantOrCounterparty;
    }
    if (payload.title) return payload.title;
    return KIND_LABELS[initialKind];
  });
  const [amountStr, setAmountStr] = useState(() =>
    payload.amountCents !== null && payload.amountCents > 0
      ? fromCents(payload.amountCents).toFixed(2).replace('.', ',')
      : ''
  );
  const [date, setDate] = useState(payload.occurredDate);
  const [category, setCategory] = useState(
    (APP_CATEGORIES as readonly string[]).includes(payload.suggestedCategory)
      ? payload.suggestedCategory
      : 'Outros'
  );
  const [accountId, setAccountId] = useState(matchedAccount?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(() => {
    const second = activeAccounts.find((a) => a.id !== matchedAccount?.id);
    return second?.id || '';
  });
  const [creditCardId, setCreditCardId] = useState(matchedCard?.id || '');
  const [entityId, setEntityId] = useState<'CPF' | 'CNPJ'>(
    matchedCard?.entityId || matchedAccount?.entityId || 'CPF'
  );
  const [formError, setFormError] = useState('');

  const isPending = item.status === 'PENDING';
  const needsCard = kind === 'CREDIT_PURCHASE' || kind === 'INVOICE_PAYMENT';
  const needsAccount = kind !== 'CREDIT_PURCHASE';
  const isTransfer = kind === 'INTERNAL_TRANSFER';

  const handleConfirmClick = () => {
    setFormError('');
    let parsedCents;
    try {
      parsedCents = parseMoneyInput(amountStr);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Informe um valor válido.');
      return;
    }

    if (parsedCents <= 0) {
      setFormError('Informe um valor maior que zero antes de confirmar.');
      return;
    }

    if (!description.trim()) {
      setFormError('Informe uma descrição para registrar o lançamento.');
      return;
    }

    if (needsCard && !creditCardId) {
      setFormError('Selecione um cartão de crédito cadastrado.');
      return;
    }

    if (needsAccount && !accountId) {
      setFormError('Selecione a conta bancária vinculada.');
      return;
    }

    if (isTransfer && (!destinationAccountId || destinationAccountId === accountId)) {
      setFormError('Selecione uma conta de destino diferente da origem.');
      return;
    }

    const inferred = inferDirectionAndOp(kind, payload.direction);

    onConfirm({
      notificationId: item.id,
      kind,
      entityId,
      accountId,
      destinationAccountId: isTransfer ? destinationAccountId : undefined,
      creditCardId: needsCard ? creditCardId : undefined,
      description: description.trim(),
      category:
        kind === 'INVOICE_PAYMENT' || kind === 'CREDIT_PURCHASE'
          ? 'Cartão'
          : kind === 'INTERNAL_TRANSFER'
          ? 'Transferência'
          : category,
      date,
      amountCents: parsedCents,
      direction: inferred.direction,
      operationType: inferred.operationType,
      counterparty: payload.merchantOrCounterparty || undefined,
      isInternalTransfer: inferred.isInternalTransfer,
    });
  };

  const formattedTime = new Date(item.receivedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <article className="sf-card rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header row with unboxed metadata */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#64748B] dark:text-slate-400">
            <span className="font-semibold text-[#0F172A] dark:text-slate-200">
              {payload.institutionName || item.packageName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatDateBR(payload.occurredDate)} às {formattedTime}
            </span>
            <span aria-hidden="true">·</span>
            <span>{KIND_LABELS[payload.kind]}</span>
            {payload.cardLast4 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Final {payload.cardLast4}</span>
              </>
            )}
          </div>

          <h4 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white truncate">
            {payload.merchantOrCounterparty || payload.title || 'Notificação bancária'}
          </h4>
        </div>

        <div className="text-left sm:text-right shrink-0">
          {payload.amountCents !== null && payload.amountCents > 0 ? (
            <div
              className={`font-money text-base sm:text-lg font-extrabold ${
                payload.direction === 'INCOME'
                  ? 'text-[#059669] dark:text-[#10B981]'
                  : payload.kind === 'DECLINED'
                  ? 'text-slate-400 line-through'
                  : 'text-[#0F172A] dark:text-white'
              }`}
            >
              {formatarValor(fromCents(payload.amountCents), hideValues)}
            </div>
          ) : (
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Valor não informado
            </div>
          )}
          <div className="text-[11px] text-slate-400 tabular-nums">
            Confiança {Math.round(payload.parseConfidence * 100)}%
          </div>
        </div>
      </div>

      {/* Minimized / Masked excerpt */}
      <div className="flex items-start justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-300">
        <p className="leading-relaxed break-words flex-1">
          {showExcerpt
            ? payload.sanitizedExcerpt
            : 'Conteúdo mascarado por privacidade. Toque no ícone ao lado para visualizar o trecho sanitizado.'}
        </p>
        <button
          type="button"
          onClick={() => setShowExcerpt((v) => !v)}
          aria-label={showExcerpt ? 'Ocultar texto da notificação' : 'Revelar texto da notificação'}
          className="min-w-9 min-h-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
        >
          {showExcerpt ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Warnings (declined / hidden / missing amount) */}
      {(payload.isDeclined || payload.isHiddenContent || payload.warnings.length > 0) && (
        <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl px-3.5 py-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {payload.warnings.map((w, idx) => (
              <p key={idx}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Editable review form (only when PENDING) */}
      {isPending ? (
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {formError && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Tipo de movimentação
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as NotificationKind)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              >
                {EDITABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <MoneyInputField
              label="Valor conferido (R$)"
              value={amountStr}
              onChange={setAmountStr}
              placeholder="0,00"
            />

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Descrição / Estabelecimento
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              >
                {APP_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Vínculo
              </label>
              <select
                value={entityId}
                onChange={(e) => setEntityId(e.target.value as 'CPF' | 'CNPJ')}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              >
                <option value="CPF">CPF (Pessoal)</option>
                <option value="CNPJ">CNPJ (MEI)</option>
              </select>
            </div>

            {needsAccount && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Landmark size={12} />
                  {isTransfer ? 'Conta de origem' : 'Conta bancária'}
                </label>
                <select
                  value={accountId}
                  onChange={(e) => {
                    const nextAccId = e.target.value;
                    setAccountId(nextAccId);
                    const chosen = activeAccounts.find((a) => a.id === nextAccId);
                    if (chosen) setEntityId(chosen.entityId);
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
                >
                  <option value="">Selecione a conta</option>
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.institutionName} · {a.accountName} ({a.entityId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isTransfer && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Conta de destino
                </label>
                <select
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
                >
                  <option value="">Selecione o destino</option>
                  {activeAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.institutionName} · {a.accountName} ({a.entityId})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {needsCard && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <CreditCardIcon size={12} />
                  Cartão de crédito
                </label>
                <select
                  value={creditCardId}
                  onChange={(e) => {
                    const nextCardId = e.target.value;
                    setCreditCardId(nextCardId);
                    const chosen = creditCards.find((c) => c.id === nextCardId);
                    if (chosen) setEntityId(chosen.entityId);
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
                >
                  <option value="">Selecione o cartão</option>
                  {creditCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cardName} ··· {c.last4} ({c.institutionName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() =>
                onDiscard(
                  item.id,
                  payload.isDeclined
                    ? 'Transação recusada descartada pelo usuário'
                    : 'Descartada na revisão manual'
                )
              }
              className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 size={15} />
              Descartar
            </button>

            {!payload.isDeclined && (
              <button
                type="button"
                onClick={handleConfirmClick}
                className="min-h-11 px-5 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Check size={16} />
                {kind === 'CREDIT_PURCHASE'
                  ? 'Lançar na fatura do cartão'
                  : kind === 'INVOICE_PAYMENT'
                  ? 'Confirmar pagamento de fatura'
                  : 'Confirmar lançamento'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {item.status === 'CONFIRMED'
              ? `Confirmada em ${item.confirmedAt ? new Date(item.confirmedAt).toLocaleDateString('pt-BR') : '—'}`
              : `Descartada: ${item.discardReason || 'Sem motivo informado'}`}
          </span>
          {item.confirmedTransactionId && (
            <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
              Ref: {item.confirmedTransactionId}
            </span>
          )}
        </div>
      )}
    </article>
  );
};
