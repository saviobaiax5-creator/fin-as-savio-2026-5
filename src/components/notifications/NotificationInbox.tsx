import React, { useMemo, useState } from 'react';
import type { Account, CreditCard } from '../../types';
import type {
  BankNotificationStatus,
  BankNotificationViewItem,
  NotificationCaptureSettings,
  NotificationPermissionStatus,
  NotificationReviewResolution,
} from '../../domain/notifications/notification.types';
import { NotificationCard } from './NotificationCard';
import { NotificationSettings } from './NotificationSettings';
import { BellRing, RefreshCw, Settings2, ShieldAlert } from 'lucide-react';

interface NotificationInboxProps {
  items: BankNotificationViewItem[];
  accounts: Account[];
  creditCards: CreditCard[];
  settings: NotificationCaptureSettings;
  permissionStatus: NotificationPermissionStatus;
  syncing: boolean;
  onSyncNow: () => Promise<void>;
  onConfirmItem: (resolution: NotificationReviewResolution) => Promise<void>;
  onDiscardItem: (notificationId: string, reason?: string) => Promise<void>;
  onUpdateSettings: (next: NotificationCaptureSettings) => Promise<void>;
  onOpenAndroidSettings: () => Promise<void>;
  onPurgeDiscarded: () => Promise<void>;
  onRevokeAndWipe: () => Promise<void>;
}

type InboxTab = BankNotificationStatus | 'SETTINGS';

export const NotificationInbox: React.FC<NotificationInboxProps> = ({
  items,
  accounts,
  creditCards,
  settings,
  permissionStatus,
  syncing,
  onSyncNow,
  onConfirmItem,
  onDiscardItem,
  onUpdateSettings,
  onOpenAndroidSettings,
  onPurgeDiscarded,
  onRevokeAndWipe,
}) => {
  const [activeTab, setActiveTab] = useState<InboxTab>('PENDING');

  const counts = useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    let discarded = 0;
    for (const it of items) {
      if (it.status === 'PENDING') pending += 1;
      else if (it.status === 'CONFIRMED') confirmed += 1;
      else if (it.status === 'DISCARDED') discarded += 1;
    }
    return { pending, confirmed, discarded };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'SETTINGS') return [];
    return items.filter((it) => it.status === activeTab);
  }, [items, activeTab]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
            Central de Notificações Bancárias
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Revise movimentações capturadas antes de lançá-las no extrato ou na fatura. Nenhum valor é criado automaticamente sem sua confirmação.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {permissionStatus.supported && (
            <button
              type="button"
              disabled={syncing}
              onClick={() => void onSyncNow()}
              className="min-h-11 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando...' : 'Sincronizar fila Android'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className={`min-h-11 px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center gap-2 cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Settings2 size={15} />
            Permissões & Privacidade
          </button>
        </div>
      </div>

      {/* Platform / Consent Notice Banner */}
      {!permissionStatus.supported && activeTab !== 'SETTINGS' && (
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900 dark:text-white block">
                {permissionStatus.platform === 'ios'
                  ? 'Captura automática indisponível no iOS'
                  : 'Captura automática indisponível no navegador Web'}
              </strong>
              <span>
                A leitura automática de notificações bancárias em segundo plano requer o aplicativo Android com acesso autorizado pelo usuário. Eventos previamente armazenados continuam disponíveis para revisão.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className="min-h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-semibold shrink-0 cursor-pointer hover:bg-white dark:hover:bg-slate-800"
          >
            Ver detalhes
          </button>
        </div>
      )}

      {permissionStatus.supported && (!settings.consentGranted || !permissionStatus.listenerEnabled) && activeTab !== 'SETTINGS' && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div>
            <strong>Captura automática pausada:</strong>{' '}
            {!settings.consentGranted
              ? 'autorize o uso nas configurações desta central.'
              : 'ative o acesso a notificações nas configurações do Android.'}
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className="min-h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0 cursor-pointer"
          >
            Configurar agora
          </button>
        </div>
      )}

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Pendentes de revisão</span>
          <div className="font-money text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-white mt-1">
            {counts.pending}
          </div>
        </div>
        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Confirmadas</span>
          <div className="font-money text-xl sm:text-2xl font-extrabold text-[#059669] dark:text-[#10B981] mt-1">
            {counts.confirmed}
          </div>
        </div>
        <div className="sf-card p-4">
          <span className="text-xs text-[#64748B] dark:text-slate-400">Descartadas</span>
          <div className="font-money text-xl sm:text-2xl font-extrabold text-[#64748B] dark:text-slate-300 mt-1">
            {counts.discarded}
          </div>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 w-full sm:w-fit">
        {(
          [
            { id: 'PENDING', label: `Pendentes (${counts.pending})` },
            { id: 'CONFIRMED', label: `Confirmadas (${counts.confirmed})` },
            { id: 'DISCARDED', label: `Descartadas (${counts.discarded})` },
            { id: 'SETTINGS', label: 'Configurações' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-10 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#11185A] text-[#0F172A] dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {activeTab === 'SETTINGS' ? (
        <NotificationSettings
          settings={settings}
          permissionStatus={permissionStatus}
          onUpdateSettings={onUpdateSettings}
          onOpenAndroidSettings={onOpenAndroidSettings}
          onPurgeDiscarded={onPurgeDiscarded}
          onRevokeAndWipe={onRevokeAndWipe}
        />
      ) : filteredItems.length === 0 ? (
        <div className="sf-card rounded-2xl p-8 sm:p-12 text-center space-y-3">
          <div className="sf-icon-badge-navy mx-auto">
            <BellRing size={20} />
          </div>
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
            {activeTab === 'PENDING'
              ? 'Nenhuma notificação pendente para revisar'
              : activeTab === 'CONFIRMED'
              ? 'Nenhuma notificação confirmada ainda'
              : 'Nenhuma notificação descartada'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {activeTab === 'PENDING'
              ? 'Quando uma notificação bancária autorizada for capturada no Android, ela aparecerá aqui criptografada aguardando sua conferência.'
              : 'Os registros processados ficam visíveis conforme o prazo de retenção configurado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              accounts={accounts}
              creditCards={creditCards}
              maskSensitivePreview={settings.maskSensitivePreview}
              onConfirm={(res) => void onConfirmItem(res)}
              onDiscard={(id, reason) => void onDiscardItem(id, reason)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
