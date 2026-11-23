import React, { useState, useMemo } from 'react';
import { Transaction, Boleto, AuditLogEntry } from '../types';
import { formatMoneyBRL } from '../domain/money/money';
import { GoogleWorkspacePanel } from './GoogleWorkspacePanel';
import {
  AppDataset,
  FullBackupPayload,
  ParsedBackupPreview,
  PreResetSnapshot,
  buildFullBackup,
  buildFullBackupWithFileRefs,
  getBackupCounts,
  parseAndValidateBackup,
  downloadTransactionsCsv,
} from '../services/backupService';
import { todayLocal, formatDateBR } from '../utils/dateUtils';
import {
  CorruptBackupInfo,
  listCorruptBackups,
  readRawKeySafe,
  removeRawKeySafe,
  storageService,
} from '../services/storage';
import {
  ShieldCheck,
  Database,
  RefreshCw,
  Sun,
  Moon,
  Sliders,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  History,
  FileWarning,
  Trash2,
  FileSpreadsheet,
  RotateCcw,
  Lock,
  Unlock,
  KeyRound,
  Cloud,
  CloudUpload,
  LogOut,
  UserX,
  MailCheck,
  AlertTriangle,
} from 'lucide-react';
import { Sheet } from './Sheet';
import { PWAInstallButton } from './PWAInstallButton';
import { MobileShareCard } from './MobileSharePanel';
import type { AuthUserSummary } from '../services/authService';
import type { CloudBackupSnapshotMeta } from '../services/cloudBackupService';
import type { SyncStatus } from '../services/cloudSyncService';
import { validateBackupWithDryRun } from '../services/dataProtectionService';
import { usePrivacy } from '../contexts/PrivacyContext';
import { formatarValor } from '../utils/formatters';
import { fromCents } from '../domain/money/money';
import { Eye, EyeOff, Layers, PanelLeftClose } from 'lucide-react';

interface SettingsViewProps {
  dataset: AppDataset;
  transactions: Transaction[];
  boletos: Boleto[];
  auditLogs?: AuditLogEntry[];
  preResetSnapshot: PreResetSnapshot | null;
  onImportBackup: (
    payload: FullBackupPayload,
    mode: 'replace' | 'merge'
  ) => { ok: boolean; error?: string } | void;
  onRestoreSnapshot: () => void;
  onResetData: () => { ok: boolean; error?: string } | void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  density: 'compact' | 'standard' | 'enlarged';
  setDensity: (density: 'compact' | 'standard' | 'enlarged') => void;
  zoom: string;
  setZoom: (zoom: string) => void;
  vaultEnabled?: boolean;
  onEnableVaultPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onDisableVaultPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onLockVault?: () => void;
  currentUser?: AuthUserSummary | null;
  syncStatus?: SyncStatus;
  syncStatusMessage?: string;
  lastSyncedAt?: string | null;
  pendingSyncCount?: number;
  hasSyncConflict?: boolean;
  cloudBackups?: CloudBackupSnapshotMeta[];
  cloudBackupBusy?: boolean;
  onSyncNow?: () => Promise<void>;
  onOpenSyncConflict?: () => void;
  onCreateCloudBackup?: () => Promise<{ ok: boolean; error?: string }>;
  onRestoreCloudBackup?: (backup: CloudBackupSnapshotMeta) => Promise<{ ok: boolean; error?: string }>;
  onRefreshCloudBackups?: () => Promise<void>;
  onResendVerificationEmail?: () => Promise<{ ok: boolean; error?: string }>;
  onRefreshEmailVerification?: () => Promise<void>;
  onSignOut?: () => Promise<void>;
  onSwitchAccountFresh?: () => Promise<void>;
  onClearLocalWorkspace?: () => void;
  onDeleteAccount?: () => Promise<{ ok: boolean; error?: string }>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  dataset,
  transactions,
  boletos,
  auditLogs = [],
  preResetSnapshot,
  onImportBackup,
  onRestoreSnapshot,
  onResetData,
  theme,
  setTheme,
  density,
  setDensity,
  zoom,
  setZoom,
  vaultEnabled = false,
  onEnableVaultPin,
  onDisableVaultPin,
  onLockVault,
  currentUser,
  syncStatus = 'IDLE',
  syncStatusMessage,
  lastSyncedAt,
  pendingSyncCount = 0,
  hasSyncConflict = false,
  cloudBackups = [],
  cloudBackupBusy = false,
  onSyncNow,
  onOpenSyncConflict,
  onCreateCloudBackup,
  onRestoreCloudBackup,
  onRefreshCloudBackups,
  onResendVerificationEmail,
  onRefreshEmailVerification,
  onSignOut,
  onSwitchAccountFresh,
  onClearLocalWorkspace,
  onDeleteAccount,
}) => {
  const {
    hideValues,
    toggleHideValues,
    showScopeBar,
    toggleScopeBar,
    sidebarOpen,
    toggleSidebar,
  } = usePrivacy();
  const [importPreview, setImportPreview] = useState<ParsedBackupPreview | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupError, setBackupError] = useState('');
  const [corruptBackups, setCorruptBackups] = useState<CorruptBackupInfo[]>(() =>
    listCorruptBackups()
  );
  const [resetSheetOpen, setResetSheetOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [deleteAccountSheetOpen, setDeleteAccountSheetOpen] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [accountActionMsg, setAccountActionMsg] = useState('');
  const [accountActionError, setAccountActionError] = useState('');
  const [vaultPinInput, setVaultPinInput] = useState('');
  const [vaultPinConfirm, setVaultPinConfirm] = useState('');
  const [vaultMsg, setVaultMsg] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [vaultBusy, setVaultBusy] = useState(false);

  const fullBackup = useMemo(() => buildFullBackup(dataset), [dataset]);
  const currentCounts = useMemo(() => getBackupCounts(dataset), [dataset]);

  const handleExportFullBackup = async () => {
    setBackupError('');
    const payload = await buildFullBackupWithFileRefs(dataset);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Savio_Financas_Backup_Completo_${todayLocal()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupMsg('Backup completo exportado (.json) com todos os módulos, referências de arquivos e preferências visuais.');
  };

  const handleExportCsv = () => {
    setBackupError('');
    downloadTransactionsCsv(transactions);
    setBackupMsg(`${transactions.length} lançamento(s) exportado(s) para planilha CSV (compatível com Excel).`);
  };

  const handleSelectBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBackupMsg('');
    setBackupError('');
    setImportFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const parsed = parseAndValidateBackup(content, dataset);
      if (!parsed.valid) {
        setImportPreview(null);
        setBackupError(parsed.error || 'Arquivo de backup inválido.');
        return;
      }
      const dryRun = validateBackupWithDryRun(content);
      if (!dryRun.valid) {
        setImportPreview(null);
        setBackupError(
          dryRun.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.'
        );
        return;
      }
      setImportPreview(parsed);
    };
    reader.onerror = () => {
      setBackupError('Não foi possível ler o arquivo selecionado.');
    };
    reader.readAsText(file);
  };

  const confirmBackupImport = () => {
    if (!importPreview?.valid || !importPreview.payload) return;
    const result = onImportBackup(importPreview.payload, importMode);
    if (result && !result.ok) {
      setBackupError(
        result.error ||
          'Falha de integridade durante a restauração. Os dados anteriores foram mantidos via rollback.'
      );
      return;
    }
    setImportPreview(null);
    setImportFileName('');
    setBackupMsg(
      importMode === 'replace'
        ? 'Backup restaurado por completo (snapshot automático de segurança salvo antes da substituição).'
        : 'Registros do backup mesclados sem sobrescrever itens existentes.'
    );
  };

  const handleDownloadCorruptCopy = (item: CorruptBackupInfo) => {
    const raw = readRawKeySafe(item.key);
    if (!raw) return;
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.key}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleVaultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultMsg('');
    setVaultError('');
    if (vaultPinInput.trim().length < 4) {
      setVaultError('O PIN deve possuir pelo menos 4 dígitos.');
      return;
    }

    if (!vaultEnabled) {
      if (vaultPinInput.trim() !== vaultPinConfirm.trim()) {
        setVaultError('A confirmação do PIN não confere.');
        return;
      }
      if (!onEnableVaultPin) return;
      setVaultBusy(true);
      try {
        const res = await onEnableVaultPin(vaultPinInput);
        if (!res.ok) {
          setVaultError(res.error || 'Não foi possível ativar o cofre.');
          return;
        }
        setVaultPinInput('');
        setVaultPinConfirm('');
        setVaultMsg('Cofre AES-GCM-256 ativado! Bloqueio automático configurado para 5 minutos em segundo plano.');
      } finally {
        setVaultBusy(false);
      }
    } else {
      if (!onDisableVaultPin) return;
      setVaultBusy(true);
      try {
        const res = await onDisableVaultPin(vaultPinInput);
        if (!res.ok) {
          setVaultError(res.error || 'PIN incorreto.');
          return;
        }
        setVaultPinInput('');
        setVaultMsg('Proteção por PIN desativada neste dispositivo.');
      } finally {
        setVaultBusy(false);
      }
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-white">
            Configurações & Ergonomia
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
            Backup completo com pré-visualização, recuperação automática, tema, densidade e Google Workspace.
          </p>
        </div>
        <PWAInstallButton />
      </div>

      {/* Mobile Access & Shareable Link Card */}
      <MobileShareCard />

      {/* Cloud Account, Sync Status & Cloud Backups (Dual Backup) */}
      {currentUser && (
        <div className="sf-card p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="sf-icon-badge shrink-0">
                <Cloud className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                  Conta, Nuvem & Backup Duplo
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  Conectado como <strong className="text-slate-800 dark:text-slate-200">{currentUser.displayName}</strong> ({currentUser.email})
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {onSyncNow && (
                <button
                  type="button"
                  disabled={syncStatus === 'SYNCING'}
                  onClick={() => void onSyncNow()}
                  className="px-4 min-h-10 bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#0F172A] dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <RefreshCw size={14} className={syncStatus === 'SYNCING' ? 'animate-spin' : ''} />
                  Sincronizar agora
                </button>
              )}
              {onCreateCloudBackup && (
                <button
                  type="button"
                  disabled={cloudBackupBusy || !currentUser.emailVerified}
                  onClick={async () => {
                    setAccountActionError('');
                    setAccountActionMsg('');
                    const res = await onCreateCloudBackup();
                    if (!res.ok) {
                      setAccountActionError(res.error || 'Falha ao gerar backup na nuvem.');
                    } else {
                      setAccountActionMsg('Snapshot validado e salvo na nuvem (retenção dos 5 mais recentes).');
                    }
                  }}
                  className="px-4 min-h-10 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                >
                  <CloudUpload size={14} /> {cloudBackupBusy ? 'Salvando...' : 'Criar backup na nuvem'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-700">
              <div className="text-[11px] text-[#64748B] dark:text-slate-400">Status da sincronização</div>
              <div className="font-bold text-[#0F172A] dark:text-white mt-0.5">
                {syncStatusMessage ||
                  (syncStatus === 'SYNCED'
                    ? 'Sincronização com a nuvem concluída.'
                    : syncStatus === 'PENDING_OFFLINE'
                    ? 'Existem alterações aguardando sincronização.'
                    : 'Seus dados estão salvos neste dispositivo.')}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-700">
              <div className="text-[11px] text-[#64748B] dark:text-slate-400">Última sincronização</div>
              <div className="font-bold text-[#0F172A] dark:text-white mt-0.5">
                {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('pt-BR') : 'Ainda não sincronizado'}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-700">
              <div className="text-[11px] text-[#64748B] dark:text-slate-400">Último backup na nuvem</div>
              <div className="font-bold text-[#0F172A] dark:text-white mt-0.5">
                {cloudBackups[0]
                  ? new Date(cloudBackups[0].createdAt).toLocaleString('pt-BR')
                  : 'Nenhum snapshot na nuvem'}
              </div>
              {pendingSyncCount > 0 && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold mt-0.5">
                  {pendingSyncCount} pendência(s) na fila offline
                </div>
              )}
            </div>
          </div>

          {!currentUser.emailVerified && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2">
                <MailCheck size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Confirme seu endereço de e-mail para liberar a sincronização e backups automáticos na nuvem. Seus dados continuam salvos com segurança neste dispositivo.
                </span>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {onResendVerificationEmail && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await onResendVerificationEmail();
                      if (res.ok) setAccountActionMsg('E-mail de verificação reenviado.');
                      else if (res.error) setAccountActionError(res.error);
                    }}
                    className="px-3 min-h-9 rounded-lg bg-amber-600 text-white font-bold cursor-pointer"
                  >
                    Reenviar verificação
                  </button>
                )}
                {onRefreshEmailVerification && (
                  <button
                    type="button"
                    onClick={() => void onRefreshEmailVerification()}
                    className="px-3 min-h-9 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 font-bold cursor-pointer"
                  >
                    Já verifiquei
                  </button>
                )}
              </div>
            </div>
          )}

          {hasSyncConflict && onOpenSyncConflict && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold flex items-center gap-2">
                <AlertTriangle size={16} /> Existe um conflito de dados entre este dispositivo e a nuvem aguardando escolha.
              </span>
              <button
                type="button"
                onClick={onOpenSyncConflict}
                className="px-3.5 min-h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
              >
                Resolver conflito
              </button>
            </div>
          )}

          {accountActionMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{accountActionMsg}</span>
            </div>
          )}

          {accountActionError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{accountActionError}</span>
            </div>
          )}

          {/* Cloud Backup History (Max 5 versions) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>Snapshots salvos na nuvem ({cloudBackups.length}/5)</span>
              {onRefreshCloudBackups && (
                <button
                  type="button"
                  onClick={() => void onRefreshCloudBackups()}
                  className="text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                >
                  Atualizar lista
                </button>
              )}
            </div>
            {cloudBackups.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nenhum snapshot na nuvem criado ainda. Clique em "Criar backup na nuvem" para salvar a primeira versão.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {cloudBackups.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-bold text-[#0F172A] dark:text-white">
                        {new Date(item.createdAt).toLocaleString('pt-BR')} · {item.deviceLabel}
                      </div>
                      <div className="text-[#64748B] dark:text-slate-400">
                        {item.counts.accounts} conta(s) · {item.counts.transactions} lançamento(s) · Hash{' '}
                        <span className="font-mono">{item.integrityHash.slice(0, 14)}</span>
                      </div>
                    </div>
                    {onRestoreCloudBackup && (
                      <button
                        type="button"
                        disabled={cloudBackupBusy}
                        onClick={async () => {
                          setAccountActionError('');
                          setAccountActionMsg('');
                          const res = await onRestoreCloudBackup(item);
                          if (!res.ok) {
                            setAccountActionError(res.error || 'Falha ao restaurar snapshot da nuvem.');
                          } else {
                            setAccountActionMsg(
                              'Snapshot da nuvem restaurado com validação de integridade (cópia local anterior preservada).'
                            );
                          }
                        }}
                        className="px-3 min-h-9 rounded-lg bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white font-bold cursor-pointer shrink-0 disabled:opacity-60 transition-colors"
                      >
                        Restaurar esta versão
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ergonomics & Appearance Card */}
      <div className="sf-card p-5 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <span className="sf-icon-badge shrink-0">
            <Sliders className="w-5 h-5" />
          </span>
          <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
            Aparência & Ergonomia Multidispositivo
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-semibold text-[#64748B] dark:text-slate-400 mb-2">
              Tema da Interface
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`min-h-12 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-[#061E3E] text-white border-[#061E3E]'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-400" /> Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`min-h-12 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-[#059669] text-white border-[#059669]'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-slate-700'
                }`}
              >
                <Moon className="w-4 h-4 text-indigo-300" /> Escuro
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="cfg-density" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Modo de Densidade
            </label>
            <select
              id="cfg-density"
              value={density}
              onChange={(e) => setDensity(e.target.value as 'compact' | 'standard' | 'enlarged')}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
            >
              <option value="compact">Compacto</option>
              <option value="standard">Padrão</option>
              <option value="enlarged">Ampliado</option>
            </select>
          </div>

          <div>
            <label htmlFor="cfg-zoom" className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Escala da Interface (acessibilidade)
            </label>
            <select
              id="cfg-zoom"
              value={zoom}
              onChange={(e) => setZoom(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 outline-none focus:border-emerald-500 min-h-12"
            >
              <option value="87.5%">87,5% (Compacto)</option>
              <option value="100%">100% (Padrão)</option>
              <option value="112.5%">112,5% (Ampliado)</option>
              <option value="125%">125% (Alta Legibilidade)</option>
            </select>
          </div>
        </div>

        {/* Privacidade & Abas (Mobile e PC) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={toggleHideValues}
            aria-pressed={hideValues}
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
              hideValues
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                {hideValues ? <EyeOff size={15} className="text-amber-600" /> : <Eye size={15} className="text-[#059669]" />}
                <span>Ocultar valores (Privacidade)</span>
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                {hideValues ? 'Ativo — exibe R$ ••••• em todo o app' : 'Desativado — valores visíveis'}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${hideValues ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
              {hideValues ? 'OCULTO' : 'VISÍVEL'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleScopeBar}
            aria-pressed={!showScopeBar}
            className={`p-3.5 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
              !showScopeBar
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700'
                : 'bg-[#F8FAFC] dark:bg-slate-800/60 border-[#E2E8F0] dark:border-slate-700'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                <Layers size={15} className="text-blue-600" />
                <span>Barra de abas (Consolidado/CPF/CNPJ)</span>
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                {showScopeBar ? 'Visível no topo (Celular e PC)' : 'Escondida para ganhar espaço na tela'}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${showScopeBar ? 'bg-[#059669] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
              {showScopeBar ? 'VISÍVEL' : 'ESCONDIDA'}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-pressed={!sidebarOpen}
            className={`hidden md:flex p-3.5 rounded-xl border text-left items-center justify-between gap-3 transition-all cursor-pointer ${
              !sidebarOpen
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700'
                : 'bg-[#F8FAFC] dark:bg-slate-800/60 border-[#E2E8F0] dark:border-slate-700'
            }`}
          >
            <div className="min-w-0">
              <div className="text-xs font-bold text-[#0F172A] dark:text-white flex items-center gap-1.5">
                <PanelLeftClose size={15} className="text-slate-600 dark:text-slate-300" />
                <span>Menu lateral no PC</span>
              </div>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5">
                {sidebarOpen ? 'Expandido na lateral esquerda' : 'Minimizado para ampliar área útil'}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${sidebarOpen ? 'bg-[#059669] text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
              {sidebarOpen ? 'ABERTO' : 'OCULTO'}
            </span>
          </button>
        </div>
      </div>

      {/* Full Backup Export / Import with Preview & Snapshot */}
      <div className="sf-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="sf-icon-badge shrink-0">
              <Database className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                Backup Completo & Recuperação Segura
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                Inclui contas ({currentCounts.accounts}), lançamentos ({currentCounts.transactions}), cartões ({currentCounts.creditCards}), boletos ({currentCounts.boletos}), dívidas ({currentCounts.debts}), bens ({currentCounts.assets}) e metadados de documentos ({currentCounts.documents}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportFullBackup}
              className="px-4 min-h-11 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download size={15} /> Exportar backup (.json)
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-4 min-h-11 bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-700 text-[#0F172A] dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FileSpreadsheet size={15} /> Exportar lançamentos (.csv)
            </button>

            <label className="px-4 min-h-11 bg-[#F8FAFC] dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#0F172A] dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors">
              <Upload size={15} /> Importar backup (.json)
              <input type="file" accept=".json,application/json" onChange={handleSelectBackupFile} className="hidden" />
            </label>
          </div>
        </div>

        {backupMsg && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{backupMsg}</span>
          </div>
        )}

        {backupError && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{backupError}</span>
          </div>
        )}

        {/* Import Preview */}
        {importPreview?.valid && importPreview.payload && importPreview.counts && (
          <div className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-display text-sm font-bold text-[#0F172A] dark:text-white">
                  Pré-visualização do Backup: {importFileName}
                </h4>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Exportado em: {new Date(importPreview.payload.exportedAt).toLocaleString('pt-BR')} · Schema v{importPreview.payload.schemaVersion}
                  {importPreview.periodRange && (
                    <> · Período: {formatDateBR(importPreview.periodRange.start)} a {formatDateBR(importPreview.periodRange.end)}</>
                  )}
                </p>
                {(importPreview.duplicateTransactionsCount || importPreview.duplicateAccountsCount) ? (
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1">
                    Duplicidades detectadas em relação ao sistema atual: {importPreview.duplicateTransactionsCount || 0} lançamento(s) e {importPreview.duplicateAccountsCount || 0} conta(s). No modo Mesclar, registros idênticos são ignorados automaticamente.
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportPreview(null);
                  setImportFileName('');
                }}
                className="px-3 min-h-9 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            {importPreview.warnings.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                {importPreview.warnings.map((w, idx) => (
                  <div key={idx}>{w}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
              {[
                { label: 'Contas', value: importPreview.counts.accounts },
                { label: 'Lançamentos', value: importPreview.counts.transactions },
                { label: 'Cartões', value: importPreview.counts.creditCards },
                { label: 'Boletos', value: importPreview.counts.boletos },
                { label: 'Dívidas', value: importPreview.counts.debts },
                { label: 'Patrimônio', value: importPreview.counts.assets },
                { label: 'Docs', value: importPreview.counts.documents },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-700 rounded-xl p-2.5 text-center"
                >
                  <div className="text-[11px] text-[#64748B] dark:text-slate-400">{stat.label}</div>
                  <div className="font-money text-base font-extrabold text-[#0F172A] dark:text-white">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="backup-import-mode"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="accent-emerald-600"
                  />
                  Mesclar novos registros (preserva atuais)
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="backup-import-mode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="accent-emerald-600"
                  />
                  Substituir tudo (salva snapshot antes)
                </label>
              </div>

              <button
                type="button"
                onClick={confirmBackupImport}
                className="px-5 min-h-11 bg-[#059669] hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors"
              >
                Confirmar Importação
              </button>
            </div>
          </div>
        )}

        {/* Pre-reset snapshot recovery */}
        {preResetSnapshot && (
          <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-[#E2E8F0] dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <History size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold text-[#0F172A] dark:text-white">
                  Snapshot automático disponível ({preResetSnapshot.reason === 'reset' ? 'pré-reset' : 'pré-restauração'})
                </div>
                <div className="text-[#64748B] dark:text-slate-400">
                  Salvo em {new Date(preResetSnapshot.savedAt).toLocaleString('pt-BR')} ·{' '}
                  {preResetSnapshot.backup.data.transactions.length} lançamentos ·{' '}
                  {preResetSnapshot.backup.data.accounts.length} contas
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onRestoreSnapshot();
                setBackupMsg('Snapshot anterior restaurado com sucesso!');
              }}
              className="px-4 min-h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
            >
              Restaurar snapshot anterior
            </button>
          </div>
        )}

        {/* Corrupted payload copies preserved by storage.ts */}
        {corruptBackups.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
            <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
              <FileWarning size={16} /> Cópias preservadas de leituras corrompidas ({corruptBackups.length})
            </div>
            <div className="space-y-1.5">
              {corruptBackups.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-2 text-xs bg-white/80 dark:bg-slate-900/80 px-3 py-2 rounded-xl">
                  <span className="truncate font-mono text-slate-700 dark:text-slate-300">
                    {item.sourceKey} ({item.timestamp ? new Date(item.timestamp).toLocaleString('pt-BR') : 'sem data'})
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const restored = storageService.restore(item.sourceKey);
                        if (restored) {
                          setBackupMsg(
                            `Cópia restaurada para "${item.sourceKey}". Recarregue a página para aplicar os dados recuperados.`
                          );
                        } else {
                          setBackupError(
                            `Não foi possível restaurar "${item.sourceKey}" automaticamente porque o JSON original está sintaticamente corrompido. Use "Baixar" para inspeção.`
                          );
                        }
                      }}
                      className="px-2.5 min-h-8 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-lg font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw size={12} /> Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCorruptCopy(item)}
                      className="px-2.5 min-h-8 bg-slate-100 dark:bg-slate-800 rounded-lg font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Baixar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeRawKeySafe(item.key);
                        setCorruptBackups(listCorruptBackups());
                      }}
                      className="min-w-8 min-h-8 grid place-items-center text-slate-400 hover:text-red-600 cursor-pointer"
                      aria-label="Descartar cópia"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Accounting Audit Trail */}
      <div className="sf-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="sf-icon-badge shrink-0">
              <History className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                Trilha de Auditoria Contábil ({auditLogs.length})
              </h3>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                Registro imutável de estornos, cancelamentos, restaurações e transferências pareadas entre contas.
              </p>
            </div>
          </div>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-[#64748B] dark:text-slate-400 py-2">
            Nenhum evento contábil registrado até o momento.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto pr-1">
            {auditLogs.slice(0, 25).map((entry) => {
              const actionLabels: Record<AuditLogEntry['action'], string> = {
                TRANSACTION_REVERSED: 'Estorno contábil',
                TRANSACTION_CANCELLED: 'Cancelamento',
                TRANSACTION_RESTORED: 'Restauração',
                TRANSFER_EXECUTED: 'Transferência interna',
                EXTRACTION_BATCH_INTEGRATED: 'Extração bancária',
              };
              const badgeClass: Record<AuditLogEntry['action'], string> = {
                TRANSACTION_REVERSED:
                  'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
                TRANSACTION_CANCELLED:
                  'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
                TRANSACTION_RESTORED:
                  'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
                TRANSFER_EXECUTED:
                  'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
                EXTRACTION_BATCH_INTEGRATED:
                  'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
              };
              return (
                <div key={entry.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeClass[entry.action]}`}>
                        {actionLabels[entry.action]}
                      </span>
                      <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                        {new Date(entry.timestamp).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-200 font-medium truncate">
                      {entry.reason}
                    </div>
                  </div>
                  <div className="font-money font-bold text-[#0F172A] dark:text-white shrink-0">
                    {hideValues ? formatarValor(fromCents(entry.amountCents), true) : formatMoneyBRL(entry.amountCents)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Google Workspace Integration Panel */}
      <GoogleWorkspacePanel transactions={transactions} boletos={boletos} fullBackup={fullBackup} />

      <div className="sf-card p-5 sm:p-6 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="sf-icon-badge shrink-0">
                {vaultEnabled ? <Lock className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                  Cofre Local Criptografado (PBKDF2 + AES-GCM-256)
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  Proteja saldos e lançamentos com um PIN local derivado via WebCrypto PBKDF2 (150.000 iterações SHA-256) e snapshot AES-GCM-256.
                </p>
              </div>
            </div>
            {vaultEnabled && onLockVault && (
              <button
                type="button"
                onClick={onLockVault}
                className="px-4 min-h-10 bg-[#061E3E] hover:bg-[#0F172A] dark:bg-[#059669] dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Lock size={14} /> Bloquear aplicativo agora
              </button>
            )}
          </div>

          {vaultMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{vaultMsg}</span>
            </div>
          )}

          {vaultError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{vaultError}</span>
            </div>
          )}

          <form onSubmit={handleVaultSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label
                htmlFor="settings-vault-pin"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
              >
                {vaultEnabled ? 'PIN atual para desativar' : 'Definir novo PIN (mín. 4 dígitos)'}
              </label>
              <input
                id="settings-vault-pin"
                type="password"
                inputMode="numeric"
                value={vaultPinInput}
                onChange={(e) => setVaultPinInput(e.target.value)}
                placeholder="••••"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11 outline-none focus:border-emerald-500"
              />
            </div>

            {!vaultEnabled && (
              <div>
                <label
                  htmlFor="settings-vault-pin-confirm"
                  className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
                >
                  Confirmar PIN
                </label>
                <input
                  id="settings-vault-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  value={vaultPinConfirm}
                  onChange={(e) => setVaultPinConfirm(e.target.value)}
                  placeholder="••••"
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-11 outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={vaultBusy}
              className={`min-h-11 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 ${
                vaultEnabled
                  ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {vaultEnabled ? (
                <>
                  <Unlock size={15} /> {vaultBusy ? 'Validando...' : 'Desativar bloqueio por PIN'}
                </>
              ) : (
                <>
                  <Lock size={15} /> {vaultBusy ? 'Derivando chave...' : 'Ativar Cofre PIN'}
                </>
              )}
            </button>
          </form>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <span className="sf-icon-badge shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white mb-1">
                Privacidade e LGPD
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400 leading-relaxed">
                O Sávio Finanças nunca solicita ou armazena senhas bancárias, código de segurança (CVV) ou número completo de cartões de crédito — apenas os 4 últimos dígitos para identificação.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-start gap-3">
            <span className="sf-icon-badge shrink-0">
              <RefreshCw className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-[#0F172A] dark:text-white mb-1">
                Gerenciamento de Sessão, Cache & Reinicialização
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400 leading-relaxed">
                Ações separadas por impacto para evitar perda acidental de dados:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {onSignOut && (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="px-4 min-h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Sair da conta (mantém nuvem intacta)
              </button>
            )}

            {onSwitchAccountFresh && (
              <button
                type="button"
                onClick={() => void onSwitchAccountFresh()}
                className="px-4 min-h-11 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Trocar de conta e começar do zero (salva backup antes)
              </button>
            )}

            {onClearLocalWorkspace && (
              <button
                type="button"
                onClick={() => {
                  onClearLocalWorkspace();
                  setAccountActionMsg(
                    'Cache local limpo após backup automático. Seus dados na nuvem permanecem intactos.'
                  );
                }}
                className="px-4 min-h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4" /> Limpar dados locais deste aparelho
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setResetConfirmText('');
                setResetSheetOpen(true);
              }}
              className="px-4 min-h-11 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Reiniciar dados financeiros (zerar)
            </button>

            {onDeleteAccount && (
              <button
                type="button"
                onClick={() => {
                  setDeleteAccountConfirmText('');
                  setDeleteAccountSheetOpen(true);
                }}
                className="px-4 min-h-11 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 hover:bg-red-100 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <UserX className="w-4 h-4" /> Excluir conta definitivamente
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Multi-step Reset to Empty Sheet */}
      <Sheet
        open={resetSheetOpen}
        onClose={() => setResetSheetOpen(false)}
        title="Confirmar reinicialização para estado vazio"
        subtitle="Um backup local validado será criado antes de zerar os registros financeiros."
        headerVariant="danger"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200 space-y-1">
            <div className="font-bold">O que será zerado:</div>
            <div>
              Contas ({currentCounts.accounts}), lançamentos ({currentCounts.transactions}), cartões ({currentCounts.creditCards}), boletos ({currentCounts.boletos}), dívidas ({currentCounts.debts}), patrimônio ({currentCounts.assets}), documentos ({currentCounts.documents}), salários, orçamentos e regras.
            </div>
            <div className="pt-1 font-semibold">
              Nenhum dado fictício ou demonstrativo será recriado: o aplicativo voltará ao estado totalmente vazio.
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-reset-text"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Digite <strong>ZERAR</strong> para confirmar após o backup automático:
            </label>
            <input
              id="confirm-reset-text"
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="ZERAR"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setResetSheetOpen(false)}
              className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={resetConfirmText.trim().toUpperCase() !== 'ZERAR'}
              onClick={() => {
                setResetSheetOpen(false);
                const res = onResetData();
                if (res && !res.ok && res.error) {
                  setBackupError(res.error);
                }
              }}
              className="flex-[1.4] min-h-12 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer"
            >
              Validar backup e zerar dados
            </button>
          </div>
        </div>
      </Sheet>

      {/* Permanent Account Deletion Sheet */}
      <Sheet
        open={deleteAccountSheetOpen}
        onClose={() => setDeleteAccountSheetOpen(false)}
        title="Excluir conta e dados da nuvem"
        subtitle="Esta ação remove seu usuário do Firebase Authentication e todos os dados salvos na nuvem."
        headerVariant="danger"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            Recomendamos exportar um backup (.json) antes de prosseguir. Todos os seus documentos financeiros em <span className="font-mono">users/{currentUser?.uid || ''}</span> e snapshots na nuvem serão removidos permanentemente.
          </p>

          <div>
            <label
              htmlFor="confirm-delete-account-text"
              className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
            >
              Digite <strong>EXCLUIR</strong> para confirmar:
            </label>
            <input
              id="confirm-delete-account-text"
              type="text"
              value={deleteAccountConfirmText}
              onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-red-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setDeleteAccountSheetOpen(false)}
              className="flex-1 min-h-12 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleteAccountConfirmText.trim().toUpperCase() !== 'EXCLUIR' || !onDeleteAccount}
              onClick={async () => {
                if (!onDeleteAccount) return;
                setDeleteAccountSheetOpen(false);
                const res = await onDeleteAccount();
                if (!res.ok && res.error) {
                  setAccountActionError(res.error);
                }
              }}
              className="flex-[1.4] min-h-12 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold cursor-pointer"
            >
              Confirmar exclusão da conta
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
