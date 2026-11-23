import React, { useState } from 'react';
import { Transaction, Boleto, Account, Debt, CreditCard, EntityScope, ChatMessage } from '../types';
import {
  filterTransactionsByPeriod,
  getTransactionAmountCents,
  toCents,
  fromCents,
} from '../utils/financeCalculations';
import { generateEntityId } from '../domain/common/id';
import { calculateCountdown } from '../utils/countdown';
import { Bot, Send, User, Sparkles } from 'lucide-react';

interface AiAssistantViewProps {
  transactions: Transaction[];
  boletos: Boleto[];
  accounts: Account[];
  cards: CreditCard[];
  debts: Debt[];
  scope: EntityScope;
  period: string;
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  transactions,
  boletos,
  accounts,
  cards,
  debts,
  scope,
  period,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-1',
      sender: 'ai',
      text: 'Olá! Sou o assistente financeiro do Sávio Finanças. Posso responder com base nos totais reais do período selecionado (CPF e CNPJ). Em que posso ajudar?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const suggestedQuestions = [
    'Quanto gastei neste período?',
    'Quais boletos estão próximos do vencimento?',
    'Quanto o MEI faturou até agora?',
    'Qual cartão tem maior fatura?',
    'Qual meu saldo em contas?',
  ];

  const buildSummaryContext = () => {
    const activeTrs = filterTransactionsByPeriod(
      transactions.filter((t) => t.status === 'CONFIRMED' && !t.isInternalTransfer),
      period
    );

    const scopedTrs = activeTrs.filter((t) => (scope === 'CONSOLIDATED' ? true : t.entityId === scope));
    const sumByCents = (list: Transaction[], dir: 'INCOME' | 'EXPENSE') =>
      list
        .filter((t) => t.direction === dir)
        .reduce((a, t) => a + getTransactionAmountCents(t), 0);

    const totalIncomeCents = sumByCents(scopedTrs, 'INCOME');
    const totalExpenseCents = sumByCents(scopedTrs, 'EXPENSE');

    const cpfTrs = activeTrs.filter((t) => t.entityId === 'CPF');
    const cnpjTrs = activeTrs.filter((t) => t.entityId === 'CNPJ');

    const totalBalance = fromCents(
      accounts
        .filter((a) => (scope === 'CONSOLIDATED' ? true : a.entityId === scope))
        .reduce((a, acc) => a + (acc.balanceCents ?? toCents(acc.balance)), 0)
    );

    const pendingBoletos = boletos.filter((b) => b.status === 'PENDING');
    const overdueCount = pendingBoletos.filter(
      (b) => calculateCountdown(b.vencimento, false).status === 'OVERDUE'
    ).length;

    const catMap = new Map<string, number>();
    scopedTrs
      .filter((t) => t.direction === 'EXPENSE')
      .forEach((t) =>
        catMap.set(t.category, (catMap.get(t.category) || 0) + getTransactionAmountCents(t))
      );

    const topExpenseCategories = Array.from(catMap.entries())
      .map(([category, centsVal]) => ({ category, total: fromCents(centsVal) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      period,
      scope,
      totalBalance,
      totalIncome: fromCents(totalIncomeCents),
      totalExpense: fromCents(totalExpenseCents),
      netResult: fromCents(totalIncomeCents - totalExpenseCents),
      cpfIncome: fromCents(sumByCents(cpfTrs, 'INCOME')),
      cpfExpense: fromCents(sumByCents(cpfTrs, 'EXPENSE')),
      cnpjIncome: fromCents(sumByCents(cnpjTrs, 'INCOME')),
      cnpjExpense: fromCents(sumByCents(cnpjTrs, 'EXPENSE')),
      pendingBoletosCount: pendingBoletos.length,
      pendingBoletosTotal: fromCents(pendingBoletos.reduce((a, b) => a + toCents(b.valorOriginal), 0)),
      overdueBoletosCount: overdueCount,
      topExpenseCategories,
      upcomingBoletos: pendingBoletos.slice(0, 5).map((b) => ({
        beneficiary: b.beneficiario,
        dueDate: b.vencimento,
        amount: b.valorOriginal,
        entity: b.entityId,
      })),
      cardsSummary: cards.map((c) => ({
        cardName: c.cardName,
        entity: c.entityId,
        currentInvoice: c.currentInvoiceAmount,
        limit: c.limit,
      })),
      totalDebt: fromCents(debts.reduce((a, d) => a + toCents(d.outstandingAmount), 0)),
    };
  };

  const handleSend = async (questionText?: string) => {
    const query = (questionText ?? input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: generateEntityId('msg'),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          summaryContext: buildSummaryContext(),
        }),
      });
      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: generateEntityId('msg'),
        sender: 'ai',
        text: res.ok
          ? data.reply || 'Não foi possível gerar uma resposta.'
          : data.error || 'Serviço de IA indisponível no momento.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: generateEntityId('msg'),
        sender: 'ai',
        text: 'Erro de rede ao conectar com o serviço de inteligência artificial.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 animate-fadeIn h-[calc(100dvh-210px)] md:h-[calc(100dvh-160px)] flex flex-col">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-md text-[10px] font-bold">
            GEMINI IA
          </span>
          <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-white">
            Inteligência Artificial Financeira
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
          Análises fundamentadas exclusivamente nos seus totais agregados reais ({period}, {scope}).
        </p>
      </div>

      {/* Suggested Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
        {suggestedQuestions.map((q, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSend(q)}
            className="sf-card-interactive px-3.5 min-h-10 rounded-full text-slate-700 dark:text-slate-200 text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Box */}
      <div className="flex-1 min-h-0 sf-card p-4 sm:p-6 overflow-y-auto space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-start gap-2.5 sm:gap-3 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-9 h-9 rounded-xl grid place-items-center text-xs font-bold shrink-0 ${
                m.sender === 'user' ? 'bg-[#061E3E] text-white' : 'bg-[#ECFDF5] text-[#059669] dark:bg-emerald-950/70 dark:text-[#10B981]'
              }`}
            >
              {m.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            <div
              className={`max-w-[85%] sm:max-w-xl p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed break-words ${
                m.sender === 'user'
                  ? 'bg-[#061E3E] text-white rounded-tr-xs'
                  : 'bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-xs'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              <span
                className={`block text-[10px] mt-2 ${
                  m.sender === 'user' ? 'text-white/75' : 'text-[#64748B] dark:text-slate-400'
                }`}
              >
                {m.timestamp}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="sf-icon-badge">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-3.5 bg-[#F8FAFC] dark:bg-slate-800 rounded-2xl text-xs sm:text-sm text-[#64748B] dark:text-slate-300 animate-pulse">
              Analisando resumo financeiro...
            </div>
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="shrink-0 sf-card p-2 sm:p-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Pergunte sobre gastos, receitas, boletos ou faturas..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1 px-3 py-2 text-base sm:text-sm outline-none bg-transparent text-[#0F172A] dark:text-white min-h-12"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={loading}
          className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-4 sm:px-5 min-h-12 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </div>
    </div>
  );
};
