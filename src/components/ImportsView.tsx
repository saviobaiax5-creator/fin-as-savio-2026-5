import React, { useMemo, useState } from 'react';
import { Account, APP_CATEGORIES, CategoryRule, Direction, Transaction } from '../types';
import type { MoneyCents } from '../domain/money/money';
import { parseSignedMoneyInput, toCents, fromCents } from '../domain/money/money';
import { generateEntityId } from '../domain/common/id';
import { categorizeTransactionDescription } from '../domain/transactions/CategorizationService';
import { findMatchingScheduledTransaction } from '../domain/transactions/ImportReconciliationService';
import {
  checkDuplicateTransaction,
  formatCurrencyBRL,
} from '../utils/financeCalculations';
import { formatDateBR, todayLocal } from '../utils/dateUtils';
import { Upload, CheckCircle2, AlertCircle, Lock, Sparkles, Tag, Trash2, Link2 } from 'lucide-react';

interface ImportsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  categoryRules?: CategoryRule[];
  onAddCategoryRule?: (rule: Omit<CategoryRule, 'id' | 'createdAt'>) => void;
  onDeleteCategoryRule?: (id: string) => void;
  onImportTransactions: (items: Omit<Transaction, 'id'>[]) => void;
}

interface ParsedRow {
  id: string;
  date: string;
  description: string;
  amountCents: MoneyCents;
  amount: number;
  direction: Direction;
  category: string;
  autoMatchedRule?: string;
  isDuplicate: boolean;
  selected: boolean;
}

function parseSimpleCsv(text: string): Omit<ParsedRow, 'id' | 'isDuplicate' | 'selected' | 'autoMatchedRule'>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';
  const rows: Omit<ParsedRow, 'id' | 'isDuplicate' | 'selected' | 'autoMatchedRule'>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 3) continue;

    let dateStr = todayLocal();
    if (/^\d{4}-\d{2}-\d{2}$/.test(cols[0])) {
      dateStr = cols[0];
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(cols[0])) {
      const [d, m, y] = cols[0].split('/');
      dateStr = `${y}-${m}-${d}`;
    }

    const rawAmt = cols[cols.length - 1];
    let signedCents: MoneyCents;
    try {
      signedCents = parseSignedMoneyInput(rawAmt);
    } catch {
      continue;
    }
    if (signedCents === 0) continue;
    const absCents = Math.abs(signedCents) as MoneyCents;

    rows.push({
      date: dateStr,
      description: cols[1] || 'Lançamento importado',
      amountCents: absCents,
      amount: fromCents(absCents),
      direction: signedCents >= 0 ? 'INCOME' : 'EXPENSE',
      category: 'Outros',
    });
  }
  return rows;
}

function parseBasicOfx(text: string): Omit<ParsedRow, 'id' | 'isDuplicate' | 'selected' | 'autoMatchedRule'>[] {
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const rows: Omit<ParsedRow, 'id' | 'isDuplicate' | 'selected' | 'autoMatchedRule'>[] = [];

  blocks.forEach((block) => {
    const dtMatch = block.match(/<DTPOSTED>(\d{8})/i);
    const amtMatch = block.match(/<TRNAMT>([-+]?\d+[.,]?\d*)/i);
    const memoMatch = block.match(/<MEMO>([^\r\n<]+)/i) || block.match(/<NAME>([^\r\n<]+)/i);

    if (!amtMatch) return;
    const rawVal = Number(amtMatch[1].replace(',', '.'));
    if (isNaN(rawVal) || rawVal === 0) return;

    let dateStr = todayLocal();
    if (dtMatch) {
      const s = dtMatch[1];
      dateStr = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    }

    const absCents = toCents(Math.abs(rawVal));
    rows.push({
      date: dateStr,
      description: (memoMatch?.[1] || 'Movimento OFX').trim(),
      amountCents: absCents,
      amount: fromCents(absCents),
      direction: rawVal >= 0 ? 'INCOME' : 'EXPENSE',
      category: 'Outros',
    });
  });

  return rows;
}

export const ImportsView: React.FC<ImportsViewProps> = ({
  accounts,
  transactions,
  categoryRules = [],
  onAddCategoryRule,
  onDeleteCategoryRule,
  onImportTransactions,
}) => {
  const activeAccounts = accounts.filter((a) => !a.archived);
  const [fileName, setFileName] = useState('');
  const [targetAccountId, setTargetAccountId] = useState(activeAccounts[0]?.id || accounts[0]?.id || '');
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [ruleKeyword, setRuleKeyword] = useState('');
  const [ruleCategory, setRuleCategory] = useState<string>('Alimentação');
  const [ruleError, setRuleError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setStatusMsg('');
    setFileName(file.name);

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.ofx')) {
      setErrorMsg('Nesta etapa, a pré-visualização local suporta arquivos .csv e .ofx.');
      setPreviewRows([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = lower.endsWith('.ofx') ? parseBasicOfx(content) : parseSimpleCsv(content);
      if (parsed.length === 0) {
        setErrorMsg('Não foi possível identificar lançamentos válidos neste arquivo.');
        setPreviewRows([]);
        return;
      }

      const confirmedOnly = transactions.filter((t) => t.status === 'CONFIRMED');
      const withDup = parsed.map((row) => {
        const dup = checkDuplicateTransaction(confirmedOnly, row);
        const catRes = categorizeTransactionDescription({
          description: row.description,
          direction: row.direction,
          customRules: categoryRules,
          fallbackCategory: row.category,
        });
        return {
          ...row,
          category: catRes.category,
          autoMatchedRule: catRes.matchedRuleKeyword,
          id: generateEntityId('imp'),
          isDuplicate: dup,
          selected: !dup,
        };
      });
      setPreviewRows(withDup);
    };
    reader.readAsText(file);
  };

  // Compute live scheduled matches for the selected targetAccountId
  const scheduledMatchesByRowId = useMemo(() => {
    const acc = activeAccounts.find((a) => a.id === targetAccountId) || activeAccounts[0];
    const map = new Map<string, Transaction>();
    if (!acc || previewRows.length === 0) return map;

    const consumedIds = new Set<string>();
    for (const row of previewRows) {
      const match = findMatchingScheduledTransaction(
        {
          date: row.date,
          amount: row.amount,
          amountCents: row.amountCents,
          accountId: acc.id,
          direction: row.direction,
        },
        transactions,
        consumedIds
      );
      if (match) {
        consumedIds.add(match.id);
        map.set(row.id, match);
      }
    }
    return map;
  }, [previewRows, targetAccountId, activeAccounts, transactions]);

  const confirmImport = () => {
    const acc = activeAccounts.find((a) => a.id === targetAccountId) || activeAccounts[0];
    if (!acc) {
      setErrorMsg('Selecione uma conta bancária ativa de destino.');
      return;
    }

    const chosen = previewRows.filter((r) => r.selected);
    if (chosen.length === 0) {
      setErrorMsg('Selecione ao menos um lançamento para importar.');
      return;
    }

    const payload: Omit<Transaction, 'id'>[] = chosen.map((r) => ({
      entityId: acc.entityId,
      accountId: acc.id,
      date: r.date,
      description: r.description,
      category: r.category,
      account: `${acc.institutionName} · ${acc.accountName}`,
      amountCents: r.amountCents,
      amount: r.amount,
      direction: r.direction,
      status: 'CONFIRMED',
      origin: 'IMPORT',
    }));

    onImportTransactions(payload);
    setStatusMsg(`Lote de ${payload.length} lançamento(s) processado na conta ${acc.institutionName}.`);
    setPreviewRows([]);
    setFileName('');
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddCategoryRule) return;
    setRuleError('');
    const kw = ruleKeyword.trim();
    if (kw.length < 2) {
      setRuleError('Informe uma palavra-chave com pelo menos 2 caracteres.');
      return;
    }
    onAddCategoryRule({ keyword: kw, category: ruleCategory });
    setRuleKeyword('');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#082B5C] dark:text-white">
          Extratos & Conciliação OFX/CSV
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Auto-categorização por regras, deduplicação por idempotência e baixa automática de lançamentos Pendentes/Planejados compatíveis.
        </p>
      </div>

      {statusMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
            Importar extrato (.ofx ou .csv)
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Conta de destino dos lançamentos
            </label>
            <select
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institutionName} · {a.accountName} ({a.entityId})
                </option>
              ))}
            </select>
          </div>

          <label className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-emerald-500 rounded-2xl p-7 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40">
            <Upload className="w-8 h-8 text-slate-400 mb-2" />
            <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
              {fileName || 'Clique para selecionar extrato (.ofx ou .csv)'}
            </span>
            <input type="file" accept=".ofx,.csv" onChange={handleFileChange} className="hidden" />
          </label>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
              Sincronização Automática DDA & Open Finance
            </h3>
            <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 rounded-md text-[10px] font-bold">
              Em breve (Fase 5)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            A busca automática de boletos DDA e extratos Open Finance depende de integração bancária contratada e backend dedicado. Nenhuma credencial bancária é armazenada no navegador.
          </p>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Lock size={15} className="shrink-0" />
            <span>Contingência manual via OFX, CSV e leitura de boletos já está 100% operacional.</span>
          </div>
        </div>
      </div>

      {/* Preview Before Saving */}
      {previewRows.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#082B5C] dark:text-white">
                Pré-visualização & Conciliação ({previewRows.length} lançamentos detectados)
              </h3>
              <p className="text-xs text-slate-400">
                Duplicatas já confirmadas são desmarcadas; itens compatíveis com agendamentos recebem baixa automática.
              </p>
            </div>
            <button
              type="button"
              onClick={confirmImport}
              className="px-5 min-h-11 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Confirmar Importação ({previewRows.filter((r) => r.selected).length})
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[28rem] overflow-y-auto">
            {previewRows.map((row) => {
              const matchedScheduled = scheduledMatchesByRowId.get(row.id);
              return (
                <div
                  key={row.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <label className="flex items-start sm:items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(e) =>
                        setPreviewRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, selected: e.target.checked } : item
                          )
                        )
                      }
                      className="w-5 h-5 min-h-5 accent-emerald-600 shrink-0 mt-0.5 sm:mt-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-800 dark:text-white truncate">
                        {row.description}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                        <span>{formatDateBR(row.date)}</span>
                        {row.autoMatchedRule && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1">
                            <Sparkles size={10} /> Auto: {row.autoMatchedRule}
                          </span>
                        )}
                        {matchedScheduled && (
                          <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 text-[10px] font-bold inline-flex items-center gap-1">
                            <Link2 size={10} /> Concilia &quot;{matchedScheduled.description}&quot; ({formatDateBR(matchedScheduled.date)})
                          </span>
                        )}
                        {row.isDuplicate && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                            Possível duplicidade
                          </span>
                        )}
                      </div>
                    </div>
                  </label>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-8 sm:pl-0 shrink-0">
                    <select
                      value={row.category}
                      onChange={(e) =>
                        setPreviewRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, category: e.target.value } : item
                          )
                        )
                      }
                      aria-label={`Categoria de ${row.description}`}
                      className="border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 min-h-9"
                    >
                      {APP_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <span
                      className={`text-sm font-extrabold shrink-0 ${
                        row.direction === 'INCOME'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {row.direction === 'INCOME' ? '+ ' : '− '}
                      R$ {formatCurrencyBRL(row.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom Auto-Categorization Rules */}
      {onAddCategoryRule && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#082B5C] dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-600" /> Regras Personalizadas de Auto-Categorização
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sempre que a descrição de um extrato importado contiver a palavra-chave, a categoria escolhida será aplicada automaticamente.
            </p>
          </div>

          <form onSubmit={handleSaveRule} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Se a descrição contiver:
              </label>
              <input
                type="text"
                placeholder="Ex.: Uber, Enel, Padaria..."
                value={ruleKeyword}
                onChange={(e) => {
                  setRuleKeyword(e.target.value);
                  setRuleError('');
                }}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Aplicar categoria:
              </label>
              <select
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
              >
                {APP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="min-h-11 px-4 bg-[#082B5C] hover:bg-[#061B3B] dark:bg-[#00A65A] dark:hover:bg-[#00A65A]/90 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Adicionar regra
            </button>
          </form>

          {ruleError && (
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{ruleError}</p>
          )}

          {categoryRules.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {categoryRules.map((rule) => (
                <div
                  key={rule.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                    &quot;{rule.keyword}&quot;
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {rule.category}
                  </span>
                  {onDeleteCategoryRule && (
                    <button
                      type="button"
                      onClick={() => onDeleteCategoryRule(rule.id)}
                      aria-label={`Excluir regra ${rule.keyword}`}
                      className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
