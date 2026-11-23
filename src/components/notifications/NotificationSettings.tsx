import React, { useState } from 'react';
import {
  KNOWN_BRAZILIAN_BANK_PACKAGES,
  isValidAndroidPackageId,
} from '../../domain/notifications/bankRegistry';
import type {
  NotificationCaptureSettings,
  NotificationPermissionStatus,
} from '../../domain/notifications/notification.types';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Lock,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';

interface NotificationSettingsProps {
  settings: NotificationCaptureSettings;
  permissionStatus: NotificationPermissionStatus;
  onUpdateSettings: (next: NotificationCaptureSettings) => Promise<void>;
  onOpenAndroidSettings: () => Promise<void>;
  onPurgeDiscarded: () => Promise<void>;
  onRevokeAndWipe: () => Promise<void>;
}

export const NotificationSettings: React.FC<NotificationSettingsProps> = ({
  settings,
  permissionStatus,
  onUpdateSettings,
  onOpenAndroidSettings,
  onPurgeDiscarded,
  onRevokeAndWipe,
}) => {
  const [customPkg, setCustomPkg] = useState('');
  const [pkgError, setPkgError] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);

  const toggleConsent = async () => {
    await onUpdateSettings({
      ...settings,
      consentGranted: !settings.consentGranted,
      consentUpdatedAt: new Date().toISOString(),
    });
  };

  const togglePackage = async (packageName: string) => {
    const exists = settings.authorizedPackages.includes(packageName);
    const nextPackages = exists
      ? settings.authorizedPackages.filter((p) => p !== packageName)
      : [...settings.authorizedPackages, packageName];

    await onUpdateSettings({
      ...settings,
      authorizedPackages: nextPackages,
    });
  };

  const handleAddCustomPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setPkgError('');
    const clean = customPkg.trim().toLowerCase();
    if (!isValidAndroidPackageId(clean)) {
      setPkgError('Informe um identificador de pacote Android válido (ex.: com.banco.app).');
      return;
    }
    if (settings.authorizedPackages.includes(clean)) {
      setPkgError('Este pacote já está na lista autorizada.');
      return;
    }
    await onUpdateSettings({
      ...settings,
      authorizedPackages: [...settings.authorizedPackages, clean],
    });
    setCustomPkg('');
  };

  const customPackages = settings.authorizedPackages.filter(
    (p) => !KNOWN_BRAZILIAN_BANK_PACKAGES.some((k) => k.packageName === p)
  );

  return (
    <div className="space-y-6">
      {/* Platform status */}
      <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="sf-icon-badge-navy">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
                Integração com Android (NotificationListenerService)
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                {permissionStatus.supported
                  ? permissionStatus.listenerEnabled
                    ? 'Serviço de leitura de notificações habilitado no sistema Android.'
                    : 'Permissão de acesso às notificações ainda não concedida no sistema Android.'
                  : permissionStatus.platform === 'ios'
                  ? 'O iOS não permite que aplicativos leiam notificações de bancos de terceiros.'
                  : 'Execução via navegador Web: a captura nativa em segundo plano está disponível apenas no aplicativo Android instalado.'}
              </p>
            </div>
          </div>

          {permissionStatus.supported && (
            <button
              type="button"
              onClick={() => void onOpenAndroidSettings()}
              className="min-h-11 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
            >
              <ExternalLink size={15} />
              Configurações do Android
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400 block">Plataforma atual</span>
            <strong className="text-slate-900 dark:text-white uppercase">
              {permissionStatus.platform}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400 block">Permissão Android</span>
            <strong
              className={
                permissionStatus.listenerEnabled
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-700 dark:text-slate-300'
              }
            >
              {permissionStatus.supported
                ? permissionStatus.listenerEnabled
                  ? 'Concedida'
                  : 'Pendente'
                : 'Não aplicável na Web/iOS'}
            </strong>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="text-slate-500 dark:text-slate-400 block">Consentimento no app</span>
            <strong
              className={
                settings.consentGranted
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }
            >
              {settings.consentGranted ? 'Autorizado pelo titular' : 'Desativado'}
            </strong>
          </div>
        </div>
      </section>

      {/* Explicit Consent & Security Guarantees */}
      <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
              <ShieldCheck size={18} className="text-[#059669] dark:text-[#10B981]" />
              Autorização explícita e privacidade
            </h3>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              O Sávio Finanças nunca lê SMS, nunca grava mensagens em logs e não envia notificações brutas para servidores externos por padrão.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void toggleConsent()}
            aria-pressed={settings.consentGranted}
            className={`min-h-11 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors ${
              settings.consentGranted
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {settings.consentGranted ? <CheckCircle2 size={16} /> : <Lock size={16} />}
            {settings.consentGranted ? 'Captura autorizada' : 'Autorizar captura local'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 cursor-pointer">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Ocultar trecho da notificação na central até toque
            </span>
            <input
              type="checkbox"
              checked={settings.maskSensitivePreview}
              onChange={(e) =>
                void onUpdateSettings({ ...settings, maskSensitivePreview: e.target.checked })
              }
              className="w-5 h-5 accent-emerald-600"
            />
          </label>

          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Retenção da fila criptografada
            </span>
            <select
              aria-label="Prazo de retenção das notificações"
              value={settings.retentionDays}
              onChange={(e) =>
                void onUpdateSettings({
                  ...settings,
                  retentionDays: Number(e.target.value) as 7 | 30 | 60 | 90,
                })
              }
              className="border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#11185A] text-slate-900 dark:text-white font-semibold min-h-9"
            >
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={60}>60 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </div>
        </div>
      </section>

      {/* Authorized Banking Apps Allowlist */}
      <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
            Aplicativos bancários autorizados
          </h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            Apenas notificações emitidas pelos pacotes selecionados abaixo serão enfileiradas para revisão.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {KNOWN_BRAZILIAN_BANK_PACKAGES.map((bank) => {
            const checked = settings.authorizedPackages.includes(bank.packageName);
            return (
              <label
                key={bank.packageName}
                className={`min-h-12 p-3 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  checked
                    ? 'border-emerald-500/70 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {bank.institutionName}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {bank.packageName}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => void togglePackage(bank.packageName)}
                  className="w-5 h-5 accent-emerald-600 shrink-0"
                />
              </label>
            );
          })}

          {customPackages.map((pkg) => (
            <label
              key={pkg}
              className="min-h-12 p-3 rounded-xl border border-emerald-500/70 bg-emerald-50/60 dark:bg-emerald-950/30 flex items-center justify-between gap-2 cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Pacote personalizado
                </div>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-300 truncate">
                  {pkg}
                </div>
              </div>
              <input
                type="checkbox"
                checked
                onChange={() => void togglePackage(pkg)}
                className="w-5 h-5 accent-emerald-600 shrink-0"
              />
            </label>
          ))}
        </div>

        <form onSubmit={handleAddCustomPackage} className="flex flex-col sm:flex-row gap-2 pt-2">
          <input
            type="text"
            value={customPkg}
            onChange={(e) => {
              setCustomPkg(e.target.value);
              setPkgError('');
            }}
            placeholder="Adicionar pacote Android (ex.: com.seu.banco)"
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11"
          />
          <button
            type="submit"
            className="min-h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            Adicionar pacote
          </button>
        </form>
        {pkgError && (
          <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertCircle size={14} /> {pkgError}
          </p>
        )}
      </section>

      {/* Retention cleanup & full revocation */}
      <section className="sf-card rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="font-display text-sm sm:text-base font-bold text-[#0F172A] dark:text-white">
          Manutenção e revogação
        </h3>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => void onPurgeDiscarded()}
            className="min-h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 size={15} />
            Limpar notificações descartadas
          </button>

          {!confirmWipe ? (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="min-h-11 px-4 rounded-xl border border-red-300 dark:border-red-800 text-xs sm:text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center gap-2 cursor-pointer"
            >
              Revogar captura e apagar fila criptografada
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onRevokeAndWipe();
                  setConfirmWipe(false);
                }}
                className="min-h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
              >
                Confirmar revogação e exclusão
              </button>
              <button
                type="button"
                onClick={() => setConfirmWipe(false)}
                className="min-h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
