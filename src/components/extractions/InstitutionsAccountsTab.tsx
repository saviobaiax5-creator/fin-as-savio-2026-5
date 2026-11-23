import React, { useMemo, useState } from 'react';
import type { Account, CreditCard, EntityId } from '../../types';
import {
  INSTITUTION_CATEGORY_LABELS,
  type AccountExtensionMeta,
  type InstitutionCategory,
  type InstitutionProfile,
} from '../../types/extractions';
import { InstitutionCategoryBadge } from './InstitutionCategoryBadge';
import { inferAccountCategory } from '../../domain/extractions/consolidationEngine';
import { maskAccountNumber, maskTaxDocument } from '../../domain/extractions/fileSecurity';
import { formatCurrencyBRL } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { toCents } from '../../domain/money/money';
import { generateEntityId } from '../../domain/common/id';
import { Sheet } from '../Sheet';
import {
  Building2,
  Plus,
  Landmark,
  CreditCard as CreditCardIcon,
  Shield,
  Filter,
} from 'lucide-react';
import { InstitutionAvatar } from '../InstitutionAvatar';
import { InstitutionSelectorDrawer } from '../InstitutionSelectorDrawer';

interface InstitutionsAccountsTabProps {
  institutions: InstitutionProfile[];
  accounts: Account[];
  creditCards: CreditCard[];
  accountExtensions: AccountExtensionMeta[];
  onSaveInstitution: (inst: InstitutionProfile) => void;
  onSaveAccountExtension: (ext: AccountExtensionMeta) => void;
  onCreateBankAccount: (
    account: Omit<Account, 'id'>,
    extension: Omit<AccountExtensionMeta, 'id' | 'updatedAt'>
  ) => void;
  onFilterExtractionsByAccount?: (accountId: string) => void;
}

const ALL_CATEGORIES: InstitutionCategory[] = [
  'BANCO_FISICO',
  'BANCO_DIGITAL',
  'CARTEIRA_DIGITAL',
  'CORRETORA_NACIONAL',
  'CORRETORA_INTERNACIONAL',
  'EXCHANGE',
  'CARTAO_CREDITO',
  'OUTRA',
];

export const InstitutionsAccountsTab: React.FC<InstitutionsAccountsTabProps> = ({
  institutions,
  accounts,
  creditCards,
  accountExtensions,
  onSaveInstitution,
  onSaveAccountExtension,
  onCreateBankAccount,
  onFilterExtractionsByAccount,
}) => {
  const { hideValues } = usePrivacy();
  const [catFilter, setCatFilter] = useState<'ALL' | InstitutionCategory>('ALL');
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [editingExt, setEditingExt] = useState<AccountExtensionMeta | null>(null);

  // New Institution form
  const [instName, setInstName] = useState('');
  const [instCommName, setInstCommName] = useState('');
  const [instCat, setInstCat] = useState<InstitutionCategory>('BANCO_DIGITAL');
  const [instCountry, setInstCountry] = useState('Brasil');
  const [instCode, setInstCode] = useState('');
  const [instNotes, setInstNotes] = useState('');

  // New Account / Product form
  const [accInstId, setAccInstId] = useState(institutions[0]?.id || '');
  const [accName, setAccName] = useState('');
  const [accEntity, setAccEntity] = useState<EntityId>('CPF');
  const [accHolderName, setAccHolderName] = useState('');
  const [accHolderDoc, setAccHolderDoc] = useState('');
  const [accAgency, setAccAgency] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accCurrency, setAccCurrency] = useState('BRL');
  const [accOpeningBalance, setAccOpeningBalance] = useState('0');
  const [accProductType, setAccProductType] = useState<Account['accountType']>('checking');
  const [accNetworks, setAccNetworks] = useState('');

  const extById = useMemo(
    () => new Map(accountExtensions.map((e) => [e.id, e])),
    [accountExtensions]
  );

  const visibleAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const cat = inferAccountCategory({
        account: acc,
        extension: extById.get(acc.id),
        institutions,
      });
      return catFilter === 'ALL' || cat === catFilter;
    });
  }, [accounts, extById, institutions, catFilter]);

  const visibleCards = useMemo(() => {
    if (catFilter !== 'ALL' && catFilter !== 'CARTAO_CREDITO') return [];
    return creditCards;
  }, [creditCards, catFilter]);

  const handleCreateInstitution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instName.trim()) return;
    const nowIso = new Date().toISOString();
    onSaveInstitution({
      id: generateEntityId('inst'),
      name: instName.trim(),
      commercialName: (instCommName || instName).trim(),
      category: instCat,
      country: instCountry.trim() || 'Brasil',
      code: instCode.trim() || undefined,
      status: 'ACTIVE',
      notes: instNotes.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    setInstName('');
    setInstCommName('');
    setInstCode('');
    setInstNotes('');
    setInstModalOpen(false);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const chosenInst = institutions.find((i) => i.id === accInstId) || institutions[0];
    if (!chosenInst || !accName.trim()) return;

    const balNum = Number(accOpeningBalance.replace(',', '.')) || 0;
    const balCents = toCents(balNum);
    const mappedType: Account['accountType'] =
      chosenInst.category === 'CORRETORA_NACIONAL' || chosenInst.category === 'CORRETORA_INTERNACIONAL'
        ? 'investment'
        : chosenInst.category === 'CARTEIRA_DIGITAL' || chosenInst.category === 'EXCHANGE'
          ? 'checking'
          : accProductType;

    onCreateBankAccount(
      {
        entityId: accEntity,
        institutionName: chosenInst.commercialName,
        accountName: accName.trim(),
        accountType: mappedType,
        openingBalance: balNum,
        openingBalanceCents: balCents,
        balance: balNum,
        balanceCents: balCents,
        archived: false,
      },
      {
        targetKind: 'ACCOUNT',
        institutionId: chosenInst.id,
        institutionCategory: chosenInst.category,
        holderEntity: accEntity,
        holderName: accHolderName.trim() || undefined,
        maskedHolderDoc: accHolderDoc.trim() ? maskTaxDocument(accHolderDoc) : undefined,
        holderDocType: accEntity,
        agency: accAgency.trim() || undefined,
        maskedAccountNumber: accNumber.trim() ? maskAccountNumber(accNumber) : undefined,
        currency: accCurrency.toUpperCase(),
        status: 'ACTIVE',
        balanceStatus: 'UPDATED',
        blockchainNetworks:
          chosenInst.category === 'EXCHANGE' && accNetworks.trim()
            ? accNetworks.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
      }
    );

    setAccName('');
    setAccHolderDoc('');
    setAccAgency('');
    setAccNumber('');
    setAccOpeningBalance('0');
    setAccModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base sm:text-lg font-extrabold text-[#0F172A] dark:text-white">
            Instituições Financeiras, Contas & Produtos
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400">
            Separação por natureza da instituição (bancos físicos, digitais, carteiras, corretoras nacionais/internacionais, exchanges e cartões).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setInstModalOpen(true)}
            className="min-h-11 px-3.5 rounded-xl border border-[#E2E8F0] dark:border-white/15 text-[#0F172A] dark:text-white bg-white dark:bg-[#11185A] hover:bg-slate-50 dark:hover:bg-white/10 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Building2 size={15} /> Nova instituição
          </button>
          <button
            type="button"
            onClick={() => setAccModalOpen(true)}
            className="min-h-11 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
          >
            <Plus size={15} /> Cadastrar conta / produto
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="sf-card rounded-2xl p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-[#64748B] dark:text-slate-400 inline-flex items-center gap-1 mr-1">
          <Filter size={13} /> Categoria:
        </span>
        <button
          type="button"
          onClick={() => setCatFilter('ALL')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
            catFilter === 'ALL'
              ? 'bg-[#061E3E] text-white dark:bg-[#059669]'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          Todas
        </button>
        {ALL_CATEGORIES.filter((c) => c !== 'OUTRA').map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCatFilter(cat)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
              catFilter === cat
                ? 'bg-[#061E3E] text-white dark:bg-[#059669]'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {INSTITUTION_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Accounts List */}
      <div className="sf-card rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <span className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
            <Landmark size={16} className="text-[#059669] dark:text-[#10B981]" />
            Contas, Carteiras, Corretoras & Exchanges ({visibleAccounts.length})
          </span>
        </div>

        {visibleAccounts.length === 0 ? (
          <div className="p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Nenhuma conta cadastrada nesta categoria. Clique em &quot;Cadastrar conta / produto&quot; ou importe um extrato.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleAccounts.map((acc) => {
              const ext = extById.get(acc.id);
              const cat = inferAccountCategory({ account: acc, extension: ext, institutions });
              const currency = ext?.currency || 'BRL';

              return (
                <div
                  key={acc.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <InstitutionAvatar name={acc.institutionName} size="md" className="mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {acc.institutionName} · {acc.accountName}
                        </span>
                        <InstitutionCategoryBadge category={cat} compact />
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {acc.entityId}
                        </span>
                        {acc.archived && (
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold">
                            ENCERRADA / ARQUIVADA
                          </span>
                        )}
                      </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                      {ext?.agency && <span>Agência: {ext.agency}</span>}
                      {ext?.maskedAccountNumber && <span>Conta: {ext.maskedAccountNumber}</span>}
                      {ext?.maskedHolderDoc && <span>Titular: {ext.maskedHolderDoc}</span>}
                      <span>Moeda: {currency}</span>
                      {ext?.blockchainNetworks && ext.blockchainNetworks.length > 0 && (
                        <span>Redes: {ext.blockchainNetworks.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-money text-sm font-extrabold text-[#0F172A] dark:text-white">
                        {currency === 'BRL'
                          ? formatarValor(acc.balance, hideValues)
                          : `${currency} ${hideValues ? '•••••' : formatCurrencyBRL(acc.balance)}`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {ext?.balanceStatus === 'OUTDATED'
                          ? 'Saldo desatualizado'
                          : 'Saldo calculado'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onFilterExtractionsByAccount && (
                        <button
                          type="button"
                          onClick={() => onFilterExtractionsByAccount(acc.id)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-[#0F172A] dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Extrações
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingExt(
                            ext || {
                              id: acc.id,
                              targetKind: 'ACCOUNT',
                              institutionId:
                                institutions.find(
                                  (i) => i.commercialName.toLowerCase() === acc.institutionName.toLowerCase()
                                )?.id || '',
                              institutionCategory: cat,
                              holderEntity: acc.entityId,
                              currency: 'BRL',
                              status: acc.archived ? 'CLOSED' : 'ACTIVE',
                              balanceStatus: 'UPDATED',
                              updatedAt: new Date().toISOString(),
                            }
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        Detalhes
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Linked Credit Cards */}
      {visibleCards.length > 0 && (
        <div className="sf-card rounded-2xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
            <span className="font-display text-xs sm:text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
              <CreditCardIcon size={16} className="text-purple-600" />
              Cartões de Crédito Vinculados ({visibleCards.length})
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleCards.map((card) => {
              const ext = extById.get(card.id);
              return (
                <div
                  key={card.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex items-start gap-3">
                    <InstitutionAvatar name={card.institutionName} size="md" className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {card.cardName} · •••• {card.last4}
                        </span>
                        <InstitutionCategoryBadge category="CARTAO_CREDITO" compact />
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold">
                          {card.entityId}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Emissor: {card.institutionName} · Vencimento dia {card.dueDay} · Limite{' '}
                        {formatarValor(card.limit, hideValues)} (limite não é contado como saldo ou dívida)
                        {ext?.cardNetwork ? ` · Bandeira: ${ext.cardNetwork}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Fatura atual</span>
                    <span className="text-sm font-extrabold tabular-nums text-[#DC3545]">
                      {formatarValor(card.currentInvoiceAmount, hideValues)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
        <Shield size={15} className="shrink-0" />
        <span>
          Números de conta, agências e CPF/CNPJ são protegidos e exibidos mascarados por padrão.
        </span>
      </div>

      {/* Modal: Nova Instituição */}
      <Sheet
        open={instModalOpen}
        onClose={() => setInstModalOpen(false)}
        title="Cadastrar instituição financeira"
        subtitle="Classifique pela natureza operacional real da instituição"
      >
        <form onSubmit={handleCreateInstitution} className="space-y-3 text-xs sm:text-sm">
          <InstitutionSelectorDrawer
            selectedName={instCommName || instName}
            defaultOpen={false}
            title="Preencher pelo catálogo offline"
            onSelect={(inst) => {
              setInstName(inst.nome);
              setInstCommName(inst.nome);
              setInstCode(inst.codigo === '000' ? '' : inst.codigo);
              if (inst.grupo === 'Cooperativa' || inst.grupo === 'Fisico') {
                setInstCat('BANCO_FISICO');
              } else if (/Carteira|Conta Global/i.test(inst.tipo)) {
                setInstCat('CARTEIRA_DIGITAL');
              } else {
                setInstCat('BANCO_DIGITAL');
              }
            }}
          />

          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Nome oficial da instituição
            </label>
            <div className="flex items-center gap-2">
              {(instCommName || instName).trim() && (
                <InstitutionAvatar name={instCommName || instName} code={instCode} size="md" />
              )}
              <input
                type="text"
                required
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                placeholder="Ex.: Banco BTG Pactual S.A."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Nome comercial
              </label>
              <input
                type="text"
                value={instCommName}
                onChange={(e) => setInstCommName(e.target.value)}
                placeholder="Ex.: BTG Pactual"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Categoria obrigatória
              </label>
              <select
                value={instCat}
                onChange={(e) => setInstCat(e.target.value as InstitutionCategory)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              >
                {ALL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {INSTITUTION_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                País
              </label>
              <input
                type="text"
                value={instCountry}
                onChange={(e) => setInstCountry(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Código (COMPE/ISPB)
              </label>
              <input
                type="text"
                value={instCode}
                onChange={(e) => setInstCode(e.target.value)}
                placeholder="Opcional"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Observações
            </label>
            <textarea
              rows={2}
              value={instNotes}
              onChange={(e) => setInstNotes(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            className="w-full min-h-11 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] text-white font-bold cursor-pointer transition-colors"
          >
            Salvar instituição
          </button>
        </form>
      </Sheet>

      {/* Modal: Nova Conta / Produto */}
      <Sheet
        open={accModalOpen}
        onClose={() => setAccModalOpen(false)}
        title="Cadastrar conta ou produto financeiro"
        subtitle="Uma instituição pode possuir múltiplas contas, carteiras ou corretoras"
      >
        <form onSubmit={handleCreateAccount} className="space-y-3 text-xs sm:text-sm">
          <div>
            <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Instituição vinculada
            </label>
            <select
              value={accInstId}
              onChange={(e) => setAccInstId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
            >
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.commercialName} ({INSTITUTION_CATEGORY_LABELS[i.category]})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Nome personalizado da conta
              </label>
              <input
                type="text"
                required
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Ex.: Conta Corrente Principal"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Titularidade obrigatória
              </label>
              <select
                value={accEntity}
                onChange={(e) => setAccEntity(e.target.value as EntityId)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              >
                <option value="CPF">Pessoa Física · CPF</option>
                <option value="CNPJ">Pessoa Jurídica · CNPJ</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Titular
              </label>
              <input
                type="text"
                value={accHolderName}
                onChange={(e) => setAccHolderName(e.target.value)}
                placeholder="Nome / Razão social"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                CPF/CNPJ (será mascarado)
              </label>
              <input
                type="text"
                value={accHolderDoc}
                onChange={(e) => setAccHolderDoc(e.target.value)}
                placeholder="Opcional"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Agência
              </label>
              <input
                type="text"
                value={accAgency}
                onChange={(e) => setAccAgency(e.target.value)}
                placeholder="0001"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Conta (mascarada)
              </label>
              <input
                type="text"
                value={accNumber}
                onChange={(e) => setAccNumber(e.target.value)}
                placeholder="Ex.: 12345-6"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Moeda
              </label>
              <select
                value={accCurrency}
                onChange={(e) => setAccCurrency(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              >
                <option value="BRL">BRL (R$)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Tipo de conta
              </label>
              <select
                value={accProductType}
                onChange={(e) => setAccProductType(e.target.value as Account['accountType'])}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              >
                <option value="checking">Conta corrente</option>
                <option value="savings">Poupança</option>
                <option value="business">Conta PJ</option>
                <option value="wallet">Carteira / Exchange</option>
                <option value="investment">Corretora / Investimento</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Saldo inicial
              </label>
              <input
                type="text"
                value={accOpeningBalance}
                onChange={(e) => setAccOpeningBalance(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
          </div>
          {institutions.find((i) => i.id === accInstId)?.category === 'EXCHANGE' && (
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Redes blockchain utilizadas (separadas por vírgula)
              </label>
              <input
                type="text"
                value={accNetworks}
                onChange={(e) => setAccNetworks(e.target.value)}
                placeholder="Ex.: Bitcoin, Ethereum, Arbitrum, Solana"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              />
            </div>
          )}
          <button
            type="submit"
            className="w-full min-h-11 rounded-xl bg-[#059669] hover:bg-emerald-700 text-white font-bold cursor-pointer transition-colors"
          >
            Confirmar cadastro da conta
          </button>
        </form>
      </Sheet>

      {/* Modal: Editar Metadados Estendidos da Conta */}
      <Sheet
        open={Boolean(editingExt)}
        onClose={() => setEditingExt(null)}
        title="Metadados da Conta / Produto"
        subtitle="Categorização, moeda e mascaramento"
      >
        {editingExt && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveAccountExtension({ ...editingExt, updatedAt: new Date().toISOString() });
              setEditingExt(null);
            }}
            className="space-y-3 text-xs sm:text-sm"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Categoria da Instituição</label>
                <select
                  value={editingExt.institutionCategory}
                  onChange={(e) =>
                    setEditingExt({
                      ...editingExt,
                      institutionCategory: e.target.value as InstitutionCategory,
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {INSTITUTION_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Moeda principal</label>
                <select
                  value={editingExt.currency}
                  onChange={(e) => setEditingExt({ ...editingExt, currency: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
                >
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Agência</label>
                <input
                  type="text"
                  value={editingExt.agency || ''}
                  onChange={(e) => setEditingExt({ ...editingExt, agency: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Número da conta (mascarado)</label>
                <input
                  type="text"
                  value={editingExt.maskedAccountNumber || ''}
                  onChange={(e) =>
                    setEditingExt({
                      ...editingExt,
                      maskedAccountNumber: maskAccountNumber(e.target.value),
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Status de atualização do saldo</label>
              <select
                value={editingExt.balanceStatus || 'UPDATED'}
                onChange={(e) =>
                  setEditingExt({
                    ...editingExt,
                    balanceStatus: e.target.value as AccountExtensionMeta['balanceStatus'],
                  })
                }
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 min-h-11"
              >
                <option value="UPDATED">Atualizado</option>
                <option value="OUTDATED">Desatualizado</option>
                <option value="UNKNOWN">Desconhecido</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full min-h-11 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] text-white font-bold cursor-pointer transition-colors"
            >
              Salvar detalhes
            </button>
          </form>
        )}
      </Sheet>
    </div>
  );
};
