import React, { useState } from 'react';
import { Asset } from '../types';
import { toCents, fromCents, formatCurrencyBRL } from '../utils/financeCalculations';
import { parseMoneyInput } from '../domain/money/money';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { MoneyInputField } from './MoneyInputField';
import { todayLocal } from '../utils/dateLocal';
import { TrendingUp, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Sheet } from './Sheet';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';

interface AssetsViewProps {
  assets: Asset[];
  onAddAsset: (asset: Omit<Asset, 'id'>) => void;
  onDeleteAsset: (id: string) => void;
}

export const AssetsView: React.FC<AssetsViewProps> = ({ assets, onAddAsset, onDeleteAsset }) => {
  const { hideValues } = usePrivacy();
  const isDesktop = useIsDesktop();
  const [modalOpen, setModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [assetType, setAssetType] = useState<Asset['assetType']>('Reserva');
  const [institutionName, setInstitutionName] = useState('');
  const [entityId, setEntityId] = useState<'CPF' | 'CNPJ'>('CPF');
  const [valueStr, setValueStr] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const totalAssets = fromCents(assets.reduce((acc, a) => acc + toCents(a.currentValue), 0));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    let valCents;
    try {
      valCents = parseMoneyInput(valueStr);
    } catch {
      setErrorMsg('Informe um valor atual válido.');
      return;
    }
    if (!description.trim() || !institutionName.trim()) {
      setErrorMsg('Informe a descrição e a instituição/local do ativo.');
      return;
    }
    if (valCents < 0) {
      setErrorMsg('Informe um valor atual válido.');
      return;
    }

    onAddAsset({
      entityId,
      assetType,
      institutionName: institutionName.trim(),
      description: description.trim(),
      currentValue: fromCents(valCents),
      valuationDate: todayLocal(),
    });

    setDescription('');
    setInstitutionName('');
    setValueStr('');
    setModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
            Patrimônio e Investimentos
          </h2>
          <p className="font-sans text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Reservas, aplicações financeiras, estoque e bens patrimoniais.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setErrorMsg('');
            setModalOpen(true);
          }}
          className="bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white px-4 min-h-11 rounded-xl text-xs sm:text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo ativo
        </button>
      </div>

      <div className="sf-card p-5 sm:p-6 flex items-center justify-between gap-4">
        <div>
          <span className="font-sans text-xs font-medium text-[#64748B] dark:text-slate-400">Patrimônio Bruto Consolidado</span>
          <div className="font-money text-2xl sm:text-3xl font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
            {formatarValor(totalAssets, hideValues)}
          </div>
        </div>
        <div className="sf-icon-badge">
          <TrendingUp size={20} strokeWidth={2} />
        </div>
      </div>

      <div className="sf-card overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">Ativos cadastrados</h3>
          <span className="text-xs text-[#64748B]">{assets.length} ativos</span>
        </div>

        {!isDesktop ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {assets.map((a) => (
              <div key={a.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-bold text-sm text-[#0F172A] dark:text-white">{a.description}</div>
                    <div className="text-xs text-[#64748B] dark:text-slate-400">
                      {a.institutionName} · {a.assetType}
                    </div>
                  </div>
                  <div className="font-money text-sm font-bold text-[#059669] dark:text-[#10B981]">
                    {formatarValor(a.currentValue, hideValues)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.entityId === 'CPF'
                        ? 'bg-[#ECFDF5] text-[#059669] dark:bg-emerald-950/60 dark:text-[#10B981]'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    }`}
                  >
                    {a.entityId}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteAsset(a.id)}
                    className="min-w-10 min-h-10 grid place-items-center text-slate-400 hover:text-red-600 cursor-pointer"
                    aria-label={`Remover ${a.description}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-slate-800/60 text-[#64748B] border-b border-slate-100 dark:border-slate-800">
                  <th className="py-3 px-6 font-semibold">Descrição / Ativo</th>
                  <th className="py-3 px-6 font-semibold">Tipo</th>
                  <th className="py-3 px-6 font-semibold">Instituição</th>
                  <th className="py-3 px-6 font-semibold">Vínculo</th>
                  <th className="py-3 px-6 font-semibold text-right">Valor Atual</th>
                  <th className="py-3 px-6 font-semibold text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6 font-semibold text-[#0F172A] dark:text-white">{a.description}</td>
                    <td className="py-4 px-6">
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-[#64748B] dark:text-slate-300 rounded-md text-[10px] font-medium">
                        {a.assetType}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-[#64748B] dark:text-slate-300">{a.institutionName}</td>
                    <td className="py-4 px-6">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.entityId === 'CPF'
                            ? 'bg-[#ECFDF5] text-[#059669] dark:bg-emerald-950/60 dark:text-[#10B981]'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {a.entityId}
                      </span>
                    </td>
                    <td className="font-money py-4 px-6 text-right font-bold text-[#059669] dark:text-[#10B981]">
                      {formatarValor(a.currentValue, hideValues)}
                    </td>
                    <td className="py-4 px-6 text-center">
                      <button
                        type="button"
                        onClick={() => onDeleteAsset(a.id)}
                        className="p-2 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Asset Sheet */}
      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo ativo / investimento"
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
            placeholder="Descrição (ex.: Tesouro Selic, Estoque)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
          />

          <input
            type="text"
            required
            placeholder="Instituição ou custódia (ex.: Rico, Banco Inter)"
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
          />

          <div className="grid grid-cols-2 gap-3">
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as Asset['assetType'])}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            >
              <option value="Reserva">Reserva</option>
              <option value="Renda Fixa">Renda Fixa</option>
              <option value="Renda Variável">Renda Variável</option>
              <option value="Fundos">Fundos</option>
              <option value="Produtos Boticário">Produtos Boticário</option>
              <option value="Outros">Outros</option>
            </select>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value as 'CPF' | 'CNPJ')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12"
            >
              <option value="CPF">CPF</option>
              <option value="CNPJ">CNPJ</option>
            </select>
          </div>

          <MoneyInputField
            label="Valor atual (R$)"
            allowZero
            required
            placeholder="0,00"
            value={valueStr}
            onChange={setValueStr}
          />

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
              className="flex-[1.5] min-h-12 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 size={16} /> Salvar ativo
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
};
