import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  EntityScope,
  Transaction,
  Boleto,
  DocumentItem,
  Account,
  CreditCard,
  Debt,
  Asset,
  AuditLogEntry,
  CategoryBudget,
  CategoryRule,
  LedgerDrilldownFilter,
} from './types';
import type { SalaryDataset } from './types/salary';
import {
  initialTransactions,
  initialAccounts,
  initialCreditCards,
  initialBoletos,
  initialDebts,
  initialAssets,
  initialDocuments,
} from './data/initialData';
import { calculateAccountBalances } from './utils/financeCalculations';
import { generateEntityId } from './domain/common/id';
import {
  MoneyCents,
  addMoney,
  cents,
  fromCents,
  getTransactionAmountCents,
  subtractMoney,
  toCents,
} from './domain/money/money';
import {
  cancelUnconfirmedTransaction,
  restoreCancelledTransaction,
  reverseConfirmedTransaction,
} from './domain/transactions/ReversalService';
import { executeInternalTransfer } from './domain/transactions/TransferService';
import { reconcileImportBatch } from './domain/transactions/ImportReconciliationService';
import {
  appendAuditLog,
  loadAuditLogs,
  loadReversalRecords,
} from './services/auditStorage';
import { Sheet } from './components/Sheet';
import { ConfirmDeleteSheet } from './components/ConfirmDeleteSheet';
import { VaultLockScreen } from './components/VaultLockScreen';
import { commitAtomicMutationBatch } from './data/atomicPersistence';
import {
  createVaultWithPin,
  disableVaultWithPin,
  isVaultEnabled,
  saveEncryptedVaultSnapshot,
} from './core/security/secureVault';
import {
  todayLocal,
  currentMonthLocal,
  buildDynamicPeriodOptions,
} from './utils/dateUtils';
import {
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
  loadJsonWithRecovery,
  saveJsonSafe,
  readStringSafe,
  writeStringSafe,
  clearEntityStoragePreservingBackups,
} from './services/storage';
import { fileStorageService } from './services/fileStorage';
import {
  AppDataset,
  FullBackupPayload,
  PreResetSnapshot,
  applyBackupDataset,
  sanitizeDocumentsForMetadata,
  savePreOperationSnapshot,
  validateDatasetIntegrity,
} from './services/backupService';
import { runSafeStorageMigration, mirrorDatasetToDexie } from './services/storageMigration';
import { canDeleteAccount } from './services/accountService';
import {
  EMPTY_SALARY_DATASET,
  backupSalaryBeforeImport,
  loadSalaryDatasetWithRecovery,
  saveSalaryDatasetSafely,
} from './services/salaryStorage';
import { MONTHS_PT_FULL } from './types/salary';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { TransactionModal } from './components/TransactionModal';
import { DashboardView } from './components/DashboardView';
import { CpfView } from './components/CpfView';
import { CnpjView } from './components/CnpjView';
import { AccountsView } from './components/AccountsView';
import { CardsView } from './components/CardsView';
import { BoletosView } from './components/BoletosView';
import { DebtsView } from './components/DebtsView';
import { PlanningView } from './components/PlanningView';
import { AssetsView } from './components/AssetsView';
import { ExtractionsHubView } from './components/extractions/ExtractionsHubView';
import { TraceabilitySheet } from './components/extractions/TraceabilitySheet';
import {
  loadAccountExtensions,
  loadConsolidationPreferences,
  loadExtractionBatches,
  loadExtractionRules,
  loadRegisteredInstitutions,
  saveAccountExtensions,
  saveConsolidationPreferences,
  saveExtractionBatches,
  saveExtractionRules,
  saveRegisteredInstitutions,
} from './services/extractionStorage';
import { mergeInstitutionsCatalog } from './domain/extractions/institutionRegistry';
import { lookupTransactionTraceability } from './domain/extractions/extractionIntegrationService';
import type {
  AccountExtensionMeta,
  ConsolidationPreferences,
  ExtractionBatch,
  ExtractionIntegrationCommitResult,
  ExtractionRule,
  InstitutionProfile,
} from './types/extractions';
import { DocumentsView } from './components/DocumentsView';
import { AiAssistantView } from './components/AiAssistantView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { InvestmentDashboard } from './components/investments/InvestmentDashboard';
import { SalaryView } from './components/salary/SalaryView';
import { NotificationInbox } from './components/notifications/NotificationInbox';
import type {
  BankNotificationViewItem,
  NotificationCaptureSettings,
  NotificationPermissionStatus,
  NotificationReviewResolution,
} from './domain/notifications/notification.types';
import { resolveConfirmedNotificationFinancialEffects } from './domain/notifications/notificationIntegration';
import {
  financeNotificationBridge,
  getRuntimeNotificationPlatform,
} from './capacitor/financeNotificationPlugin';
import {
  listNotificationInboxItems,
  loadNotificationSettings,
  purgeDiscardedNotifications,
  purgeExpiredNotifications,
  revokeConsentAndPurgeAllNotifications,
  saveNotificationSettings,
  syncPendingEventsFromAndroid,
  updateNotificationStatus,
} from './services/notificationQueueService';
import { RotateCcw, X } from 'lucide-react';
import { AuthScreen } from './components/auth/AuthScreen';
import { SyncConflictSheet } from './components/SyncConflictSheet';
import { MobileShareSheet } from './components/MobileSharePanel';
import { PrivacyProvider } from './contexts/PrivacyContext';
import { formatarValor } from './utils/formatters';
import {
  deleteCurrentFirebaseUser,
  reloadCurrentAuthUser,
  resendVerificationEmail,
  signOutAuthUser,
  subscribeToAuthState,
  type AuthUserSummary,
} from './services/authService';
import { testFirestoreConnection } from './services/firebaseClient';
import {
  clearActiveOwnerMeta,
  enqueueCloudDatasetSync,
  getLastSyncInfo,
  getPendingCloudSyncCount,
  purgeUserCloudData,
  pushDatasetToFirestore,
  reconcileCloudAndLocalOnLogin,
  resolveSyncConflict,
  subscribeUserCloudTransactions,
  type ConflictResolutionStrategy,
  type SyncConflictState,
  type SyncStatus,
} from './services/cloudSyncService';
import {
  createCloudBackupSnapshot,
  listCloudBackups,
  validateAndPrepareCloudRestore,
  type CloudBackupSnapshotMeta,
} from './services/cloudBackupService';
import {
  captureAndValidateExistingLocalBackup,
  countDatasetRecords,
} from './services/dataProtectionService';

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [drilldownFilter, setDrilldownFilter] = useState<LedgerDrilldownFilter | null>(null);
  const [scope, setScope] = useState<EntityScope>('CONSOLIDATED');
  const [period, setPeriod] = useState(() => currentMonthLocal());
  const [hideValues, setHideValues] = useState<boolean>(() => {
    try {
      const privacyStored = localStorage.getItem('savio_financas_privacy_mode');
      if (privacyStored !== null) return privacyStored === 'true';
      return localStorage.getItem('savio_financas_hide_values') === 'true';
    } catch {
      return false;
    }
  });
  const [showScopeBar, setShowScopeBar] = useState<boolean>(() => {
    try {
      return localStorage.getItem('savio_financas_show_scope_bar') !== 'false';
    } catch {
      return true;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('savio_financas_sidebar_open') !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('savio_financas_hide_values', String(hideValues));
      localStorage.setItem('savio_financas_privacy_mode', String(hideValues));
    } catch {}
  }, [hideValues]);

  useEffect(() => {
    try {
      localStorage.setItem('savio_financas_show_scope_bar', String(showScopeBar));
    } catch {}
  }, [showScopeBar]);

  useEffect(() => {
    try {
      localStorage.setItem('savio_financas_sidebar_open', String(sidebarOpen));
    } catch {}
  }, [sidebarOpen]);

  const toggleHideValues = useCallback(() => setHideValues((v) => !v), []);
  const toggleScopeBar = useCallback(() => setShowScopeBar((v) => !v), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [defaultModalEntity, setDefaultModalEntity] = useState<'CPF' | 'CNPJ'>('CPF');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUserSummary | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('IDLE');
  const [syncStatusMessage, setSyncStatusMessage] = useState<string>(
    'Seus dados estão salvos neste dispositivo.'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncConflict, setSyncConflict] = useState<SyncConflictState | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupSnapshotMeta[]>([]);
  const [cloudBackupBusy, setCloudBackupBusy] = useState(false);
  const cloudHydratedForUidRef = useRef<string | null>(null);
  const skipNextAutoSyncRef = useRef(false);
  const [vaultEnabled, setVaultEnabled] = useState<boolean>(() => isVaultEnabled());
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [pendingDeleteConfirm, setPendingDeleteConfirm] = useState<{
    title: string;
    itemLabel: string;
    description?: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<{
    label: string;
    restore: () => void;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docDeleteTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hiddenSinceRef = useRef<number | null>(null);

  const [notificationSettings, setNotificationSettings] = useState<NotificationCaptureSettings>(
    () => loadNotificationSettings()
  );
  const [notificationItems, setNotificationItems] = useState<BankNotificationViewItem[]>([]);
  const [syncingNotifications, setSyncingNotifications] = useState(false);
  const [notificationPermissionStatus, setNotificationPermissionStatus] =
    useState<NotificationPermissionStatus>(() => {
      const platform = getRuntimeNotificationPlatform();
      return {
        platform,
        supported: platform === 'android',
        listenerEnabled: false,
        consentGranted: loadNotificationSettings().consentGranted,
        pendingNativeCount: 0,
        ...(platform !== 'android'
          ? { unsupportedReason: platform === 'ios' ? 'IOS_UNSUPPORTED' : 'WEB_UNSUPPORTED' }
          : {}),
      };
    });

  const handleNavigate = useCallback((tab: string, filter?: LedgerDrilldownFilter) => {
    setCurrentTab(tab);
    setDrilldownFilter(filter || null);
    if (tab === 'cpf') {
      setScope('CPF');
    } else if (tab === 'cnpj') {
      setScope('CNPJ');
    } else if (tab === 'dashboard') {
      setScope('CONSOLIDATED');
    }
  }, []);

  const triggerUndo = useCallback((label: string, restore: () => void) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
    }
    setPendingUndo({ label, restore });
    undoTimerRef.current = setTimeout(() => {
      setPendingUndo(null);
      undoTimerRef.current = null;
    }, 7000);
  }, []);

  const executeUndo = () => {
    if (!pendingUndo) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    pendingUndo.restore();
    setPendingUndo(null);
  };

  // Ergonomics & Theme state synced safely
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = readStringSafe(STORAGE_KEYS.theme, 'light');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [density, setDensity] = useState<'compact' | 'standard' | 'enlarged'>(() => {
    const saved = readStringSafe(STORAGE_KEYS.density, 'standard');
    return saved === 'compact' || saved === 'enlarged' ? saved : 'standard';
  });

  const [zoom, setZoom] = useState<string>(() => {
    return readStringSafe(STORAGE_KEYS.zoom, '100%');
  });

  useEffect(() => {
    writeStringSafe(STORAGE_KEYS.theme, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    writeStringSafe(STORAGE_KEYS.density, density);
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    writeStringSafe(STORAGE_KEYS.zoom, zoom);
    document.documentElement.style.fontSize = zoom;
  }, [zoom]);

  const [reversalTarget, setReversalTarget] = useState<Transaction | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalError, setReversalError] = useState('');

  // Persistent Entities State with safe loading + corrupt payload preservation
  const [accounts, setAccounts] = useState<Account[]>(() => {
    const res = loadJsonWithRecovery<Account[]>(
      STORAGE_KEYS.accounts,
      initialAccounts,
      Array.isArray
    );
    if (res.error) setStorageWarning(res.error);
    return res.data.map((a) => {
      const opening = typeof a.openingBalance === 'number' ? a.openingBalance : a.balance ?? 0;
      const openingBalanceCents =
        typeof a.openingBalanceCents === 'number' && Number.isSafeInteger(a.openingBalanceCents)
          ? a.openingBalanceCents
          : toCents(opening);
      return {
        ...a,
        openingBalance: fromCents(openingBalanceCents),
        openingBalanceCents,
      };
    });
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const res = loadJsonWithRecovery<Transaction[]>(
      STORAGE_KEYS.transactions,
      initialTransactions,
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);

    const accRes = loadJsonWithRecovery<Account[]>(
      STORAGE_KEYS.accounts,
      initialAccounts,
      Array.isArray
    );
    const fallbackAccounts = accRes.data;

    return res.data.map((t) => {
      const amountCents = getTransactionAmountCents(t);
      const amount =
        typeof t.amount === 'number' && Number.isFinite(t.amount)
          ? t.amount
          : fromCents(amountCents);
      if (t.accountId) {
        return { ...t, amountCents, amount };
      }
      const match =
        fallbackAccounts.find(
          (a) =>
            t.account &&
            (a.institutionName.toLowerCase().includes(t.account.toLowerCase()) ||
              t.account.toLowerCase().includes(a.institutionName.toLowerCase()))
        ) ||
        fallbackAccounts.find((a) => a.entityId === t.entityId) ||
        fallbackAccounts[0];
      return {
        ...t,
        amountCents,
        amount,
        accountId: match?.id || '',
      };
    });
  });

  const [creditCards, setCreditCards] = useState<CreditCard[]>(() => {
    const res = loadJsonWithRecovery<CreditCard[]>(
      STORAGE_KEYS.cards,
      initialCreditCards,
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [boletos, setBoletos] = useState<Boleto[]>(() => {
    const res = loadJsonWithRecovery<Boleto[]>(
      STORAGE_KEYS.boletos,
      initialBoletos,
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [debts, setDebts] = useState<Debt[]>(() => {
    const res = loadJsonWithRecovery<Debt[]>(STORAGE_KEYS.debts, initialDebts, Array.isArray);
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [assets, setAssets] = useState<Asset[]>(() => {
    const res = loadJsonWithRecovery<Asset[]>(STORAGE_KEYS.assets, initialAssets, Array.isArray);
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    const res = loadJsonWithRecovery<DocumentItem[]>(
      STORAGE_KEYS.docs,
      initialDocuments,
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [salaryData, setSalaryData] = useState<SalaryDataset>(() => {
    const res = loadSalaryDatasetWithRecovery();
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [preResetSnapshot, setPreResetSnapshot] = useState<PreResetSnapshot | null>(() => {
    const res = loadJsonWithRecovery<PreResetSnapshot | null>(
      STORAGE_KEYS.preResetSnapshot,
      null,
      (val) => Boolean(val && typeof val === 'object' && 'backup' in val)
    );
    return res.data;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => loadAuditLogs());

  const [budgets, setBudgets] = useState<CategoryBudget[]>(() => {
    const res = loadJsonWithRecovery<CategoryBudget[]>(
      STORAGE_KEYS.budgets,
      [],
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>(() => {
    const res = loadJsonWithRecovery<CategoryRule[]>(
      STORAGE_KEYS.categoryRules,
      [],
      Array.isArray
    );
    if (res.error) setStorageWarning((prev) => prev || res.error || null);
    return res.data;
  });

  // Central de Extrações Financeiras, Instituições & Consolidação (Layer A isolated until approval)
  const [extractionBatches, setExtractionBatches] = useState<ExtractionBatch[]>(() =>
    loadExtractionBatches()
  );
  const [userInstitutions, setUserInstitutions] = useState<InstitutionProfile[]>(() =>
    loadRegisteredInstitutions()
  );
  const [accountExtensions, setAccountExtensions] = useState<AccountExtensionMeta[]>(() =>
    loadAccountExtensions()
  );
  const [extractionRules, setExtractionRules] = useState<ExtractionRule[]>(() =>
    loadExtractionRules()
  );
  const [consolidationPrefs, setConsolidationPrefs] = useState<ConsolidationPreferences>(() =>
    loadConsolidationPreferences()
  );
  const [traceTargetTx, setTraceTargetTx] = useState<Transaction | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  // Safe migration on startup: moves legacy base64 docs to SavioFinanaDB and mirrors entities without localStorage.clear()
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await runSafeStorageMigration({
        dataset: {
          accounts,
          transactions,
          creditCards,
          boletos,
          debts,
          assets,
          documents,
        },
        settings: { theme, density, zoom },
      });
      if (!active) return;
      if (!res.ok && res.error) {
        setStorageWarning(res.error);
      } else if (res.migratedLegacyDocsCount > 0 && res.cleanedDocuments) {
        setDocuments(res.cleanedDocuments);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshNotificationState = useCallback(
    async (syncNative: boolean) => {
      await purgeExpiredNotifications();
      const status = await financeNotificationBridge.getPermissionStatus(
        notificationSettings.consentGranted
      );
      setNotificationPermissionStatus(status);

      if (syncNative && status.supported && notificationSettings.consentGranted) {
        setSyncingNotifications(true);
        try {
          const res = await syncPendingEventsFromAndroid({
            settings: notificationSettings,
            existingTransactions: transactions,
            customRules: categoryRules,
          });
          if (res.addedCount > 0) {
            setFeedbackBanner(
              `${res.addedCount} nova(s) notificação(ões) bancária(s) pronta(s) para revisão.`
            );
            setTimeout(() => setFeedbackBanner(null), 5000);
          }
        } finally {
          setSyncingNotifications(false);
        }
      }

      const items = await listNotificationInboxItems();
      setNotificationItems(items);
    },
    [notificationSettings, transactions, categoryRules]
  );

  useEffect(() => {
    void refreshNotificationState(notificationSettings.autoSyncOnResume);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshNotificationState(notificationSettings.autoSyncOnResume);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshNotificationState, notificationSettings.autoSyncOnResume]);

  // Derived account balances: openingBalance + sum(transactions by accountId)
  const derivedAccounts = useMemo(
    () => calculateAccountBalances(accounts, transactions),
    [accounts, transactions]
  );

  const periodOptions = useMemo(
    () => buildDynamicPeriodOptions(transactions, boletos),
    [transactions, boletos]
  );

  const persistSafely = (key: string, value: unknown) => {
    const res = saveJsonSafe(key, value);
    if (!res.ok && res.error) {
      setStorageWarning(res.error);
    }
  };

  useEffect(() => {
    writeStringSafe(STORAGE_KEYS.schemaVersion, String(STORAGE_SCHEMA_VERSION));
  }, []);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.transactions, transactions);
  }, [transactions]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.accounts, accounts);
  }, [accounts]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.cards, creditCards);
  }, [creditCards]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.boletos, boletos);
  }, [boletos]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.debts, debts);
  }, [debts]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.assets, assets);
  }, [assets]);

  useEffect(() => {
    // Strip any heavy base64 or blob URLs before saving metadata to localStorage
    persistSafely(STORAGE_KEYS.docs, sanitizeDocumentsForMetadata(documents));
  }, [documents]);

  useEffect(() => {
    const res = saveSalaryDatasetSafely(salaryData);
    if (!res.ok && res.error) {
      setStorageWarning(res.error);
    }
  }, [salaryData]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.budgets, budgets);
  }, [budgets]);

  useEffect(() => {
    persistSafely(STORAGE_KEYS.categoryRules, categoryRules);
  }, [categoryRules]);

  useEffect(() => {
    saveExtractionBatches(extractionBatches);
  }, [extractionBatches]);

  useEffect(() => {
    saveRegisteredInstitutions(userInstitutions);
  }, [userInstitutions]);

  useEffect(() => {
    saveAccountExtensions(accountExtensions);
  }, [accountExtensions]);

  useEffect(() => {
    saveExtractionRules(extractionRules);
  }, [extractionRules]);

  useEffect(() => {
    saveConsolidationPreferences(consolidationPrefs);
  }, [consolidationPrefs]);

  const allInstitutions = useMemo(
    () => mergeInstitutionsCatalog(userInstitutions),
    [userInstitutions]
  );

  const activeTraceability = useMemo(() => {
    if (!traceTargetTx) return null;
    return lookupTransactionTraceability({
      transaction: traceTargetTx,
      batches: extractionBatches,
      institutions: allInstitutions,
    });
  }, [traceTargetTx, extractionBatches, allInstitutions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void mirrorDatasetToDexie(
        {
          accounts,
          transactions,
          creditCards,
          boletos,
          debts,
          assets,
          documents,
        },
        { theme, density, zoom }
      );
    }, 450);

    return () => window.clearTimeout(timer);
  }, [accounts, transactions, creditCards, boletos, debts, assets, documents, theme, density, zoom]);

  // Keep encrypted AES-GCM vault snapshot up-to-date while unlocked
  useEffect(() => {
    if (!vaultEnabled || !vaultKey) return;
    const payload = JSON.stringify({
      accounts,
      transactions,
      creditCards,
      boletos,
      debts,
      assets,
      documents,
      salaries: salaryData,
      budgets,
      categoryRules,
    });
    void saveEncryptedVaultSnapshot(payload, vaultKey);
  }, [
    vaultEnabled,
    vaultKey,
    accounts,
    transactions,
    creditCards,
    boletos,
    debts,
    assets,
    documents,
    salaryData,
    budgets,
    categoryRules,
  ]);

  // Auto-lock vault if app stays hidden/backgrounded for more than 5 minutes
  useEffect(() => {
    if (!vaultEnabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenSinceRef.current && Date.now() - hiddenSinceRef.current > 5 * 60 * 1000) {
          setVaultKey(null);
        }
        hiddenSinceRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [vaultEnabled]);

  const handleEnableVaultPin = async (pin: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const plainJson = JSON.stringify({
        accounts,
        transactions,
        creditCards,
        boletos,
        debts,
        assets,
        documents,
        salaries: salaryData,
        budgets,
        categoryRules,
      });
      const res = await createVaultWithPin(pin, plainJson);
      setVaultEnabled(true);
      setVaultKey(res.key);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao criar cofre criptografado.',
      };
    }
  };

  const handleDisableVaultPin = async (pin: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await disableVaultWithPin(pin);
    if (!res.ok) return res;
    setVaultEnabled(false);
    setVaultKey(null);
    return { ok: true };
  };

  const handleLockVault = () => {
    setVaultKey(null);
  };

  const createSafetySnapshot = (reason: PreResetSnapshot['reason']) => {
    const res = savePreOperationSnapshot(
      {
        accounts,
        transactions,
        creditCards,
        boletos,
        debts,
        assets,
        documents,
        salaries: salaryData,
        budgets,
        categoryRules,
        settings: { theme, density, zoom },
      },
      reason,
      currentUser?.uid
    );
    if (res.ok) {
      setPreResetSnapshot(res.snapshot);
    } else if (res.error) {
      setStorageWarning(res.error);
    }
    return res.snapshot;
  };

  const currentFullDataset = useMemo(
    () => ({
      accounts,
      transactions,
      creditCards,
      boletos,
      debts,
      assets,
      documents,
      salaries: salaryData,
      budgets,
      categoryRules,
      settings: { theme, density, zoom },
    }),
    [
      accounts,
      transactions,
      creditCards,
      boletos,
      debts,
      assets,
      documents,
      salaryData,
      budgets,
      categoryRules,
      theme,
      density,
      zoom,
    ]
  );

  const latestDatasetRef = useRef(currentFullDataset);
  latestDatasetRef.current = currentFullDataset;

  const applyRestoredDataset = useCallback(
    (nextData: AppDataset) => {
      skipNextAutoSyncRef.current = true;
      setAccounts(nextData.accounts);
      setTransactions(nextData.transactions);
      setCreditCards(nextData.creditCards);
      setBoletos(nextData.boletos);
      setDebts(nextData.debts);
      setAssets(nextData.assets);
      setDocuments(nextData.documents);
      setSalaryData(nextData.salaries ?? EMPTY_SALARY_DATASET);
      setBudgets(nextData.budgets ?? []);
      setCategoryRules(nextData.categoryRules ?? []);
      if (nextData.settings) {
        if (nextData.settings.theme) setTheme(nextData.settings.theme);
        if (nextData.settings.density) setDensity(nextData.settings.density);
        if (nextData.settings.zoom) setZoom(nextData.settings.zoom);
      }
    },
    []
  );

  const refreshCloudBackupsList = useCallback(async (uid: string) => {
    try {
      const list = await listCloudBackups(uid);
      setCloudBackups(list);
    } catch {
      // ignore read failure when offline or unverified
    }
  }, []);

  const runCloudReconciliation = useCallback(
    async (user: AuthUserSummary) => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setSyncStatus('SYNCING');
      setSyncStatusMessage('Sincronizando dados com a nuvem...');
      const info = await getLastSyncInfo(user.uid);
      setLastSyncedAt(info.lastSyncedAt);

      if (online) {
        await testFirestoreConnection();
      }

      const res = await reconcileCloudAndLocalOnLogin({
        user,
        localDataset: latestDatasetRef.current,
        isOnline: online,
      });

      setSyncStatus(res.status);
      setSyncStatusMessage(res.statusMessage);
      if (res.lastSyncedAt) {
        setLastSyncedAt(res.lastSyncedAt);
      }

      if (res.outcome === 'PULLED_CLOUD' && res.dataset) {
        applyRestoredDataset(res.dataset);
        cloudHydratedForUidRef.current = user.uid;
      } else if (
        res.outcome === 'EMPTY_BOTH' ||
        res.outcome === 'MIGRATED_LOCAL' ||
        res.outcome === 'SYNCED_MATCH'
      ) {
        cloudHydratedForUidRef.current = user.uid;
      } else if (res.outcome === 'CONFLICT' && res.conflict) {
        setSyncConflict(res.conflict);
      } else if (res.error) {
        setStorageWarning(res.error);
      }

      const pending = await getPendingCloudSyncCount(user.uid);
      setPendingSyncCount(pending);
      if (online) {
        void refreshCloudBackupsList(user.uid);
      }
    },
    [applyRestoredDataset, refreshCloudBackupsList]
  );

  useEffect(() => {
    const unsub = subscribeToAuthState((user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (!user) {
        cloudHydratedForUidRef.current = null;
        setSyncStatus('IDLE');
        setSyncStatusMessage('Seus dados estão salvos neste dispositivo.');
        setSyncConflict(null);
        setCloudBackups([]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (cloudHydratedForUidRef.current === currentUser.uid) return;
    void runCloudReconciliation(currentUser);
  }, [currentUser, runCloudReconciliation]);

  // Listen to Firestore remote transaction updates for current authenticated user
  useEffect(() => {
    if (!currentUser || !currentUser.emailVerified) return;
    let firstSnapshot = true;
    const unsub = subscribeUserCloudTransactions(
      currentUser.uid,
      () => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        // Only pull if no unresolved conflict is active
        if (!syncConflict && cloudHydratedForUidRef.current === currentUser.uid) {
          void getLastSyncInfo(currentUser.uid).then((i) => {
            if (i.lastSyncedAt) setLastSyncedAt(i.lastSyncedAt);
          });
        }
      },
      () => {
        // non-fatal listener error while offline/unverified
      }
    );
    return unsub;
  }, [currentUser, syncConflict]);

  // Auto-sync debounced on dataset changes after initial reconciliation
  useEffect(() => {
    if (!currentUser) return;
    if (cloudHydratedForUidRef.current !== currentUser.uid) return;
    if (syncConflict) return;
    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
      return;
    }

    const timer = window.setTimeout(async () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (!online || !currentUser.emailVerified) {
        const pending = await enqueueCloudDatasetSync(
          currentUser.uid,
          latestDatasetRef.current,
          !online ? 'Offline' : 'E-mail pendente de verificação'
        );
        setPendingSyncCount(pending);
        setSyncStatus(currentUser.emailVerified ? 'PENDING_OFFLINE' : 'UNVERIFIED_EMAIL');
        setSyncStatusMessage(
          currentUser.emailVerified
            ? 'Existem alterações aguardando sincronização.'
            : 'Seus dados estão salvos neste dispositivo. Confirme o e-mail para enviar à nuvem.'
        );
        return;
      }

      setSyncStatus('SYNCING');
      const pushRes = await pushDatasetToFirestore({
        user: currentUser,
        dataset: latestDatasetRef.current,
      });
      if (pushRes.ok) {
        setSyncStatus('SYNCED');
        setSyncStatusMessage('Sincronização com a nuvem concluída.');
        if (pushRes.syncedAt) setLastSyncedAt(pushRes.syncedAt);
        setPendingSyncCount(0);
      } else {
        const pending = await enqueueCloudDatasetSync(
          currentUser.uid,
          latestDatasetRef.current,
          pushRes.error
        );
        setPendingSyncCount(pending);
        setSyncStatus('PENDING_OFFLINE');
        setSyncStatusMessage('Existem alterações aguardando sincronização.');
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [currentUser, currentFullDataset, syncConflict]);

  // Reconnect flush for queued offline changes
  useEffect(() => {
    if (!currentUser) return;
    const handleOnline = () => {
      void runCloudReconciliation(currentUser);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [currentUser, runCloudReconciliation]);

  const handleSaveTransaction = (txData: Omit<Transaction, 'id'>, editId?: string) => {
    const amountCents = getTransactionAmountCents(txData);
    const normalizedTxData: Omit<Transaction, 'id'> = {
      ...txData,
      amountCents,
      amount: fromCents(amountCents),
    };

    if (editId) {
      const prevTx = transactions.find((t) => t.id === editId);
      setTransactions((prev) =>
        prev.map((t) => (t.id === editId ? { ...normalizedTxData, id: editId } : t))
      );

      const linkedSalaryId = normalizedTxData.salaryRecordId || prevTx?.salaryRecordId;
      if (linkedSalaryId) {
        const shouldUnlink =
          normalizedTxData.status === 'CANCELLED' || Boolean(normalizedTxData.isInternalTransfer);
        setSalaryData((prev) => ({
          ...prev,
          records: prev.records.map((r) =>
            r.id === linkedSalaryId
              ? shouldUnlink
                ? { ...r, linkedTransactionId: undefined, updatedAt: new Date().toISOString() }
                : {
                    ...r,
                    amount: normalizedTxData.amount,
                    paymentDate: normalizedTxData.date,
                    manualNetOverride: true,
                    updatedAt: new Date().toISOString(),
                  }
              : r
          ),
        }));
      }
    } else {
      const tr: Transaction = {
        ...normalizedTxData,
        id: generateEntityId('tr'),
      };
      setTransactions((prev) => [tr, ...prev]);
    }
    setEditingTransaction(null);
  };

  const handleSaveTransactionBatch = (batch: Transaction[]) => {
    if (batch.length === 0) return;
    setTransactions((prev) => [...batch, ...prev]);
    setEditingTransaction(null);
    setFeedbackBanner(
      `${batch.length} lançamento(s) mensais programados com sucesso.`
    );
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  const handleDeleteTransaction = (id: string) => {
    const target = transactions.find((t) => t.id === id);
    if (!target) return;

    if (target.status === 'CONFIRMED') {
      if (target.reversedTransactionId) {
        setStorageWarning('Este lançamento já é um estorno contábil e não pode ser removido.');
        return;
      }
      if (
        target.reversalTransactionId ||
        transactions.some((t) => t.reversedTransactionId === target.id && t.status === 'CONFIRMED')
      ) {
        setStorageWarning('Este lançamento confirmado já possui um estorno registrado no histórico.');
        return;
      }
      setReversalTarget(target);
      setReversalReason('Estorno solicitado pelo usuário');
      setReversalError('');
      return;
    }

    if (target.status === 'CANCELLED') {
      setStorageWarning('Este lançamento já está cancelado e preservado para auditoria.');
      return;
    }

    const previousStatus = target.status;
    const cancelRes = cancelUnconfirmedTransaction({
      transaction: target,
      existingTransactions: transactions,
      reason: 'Cancelamento de lançamento não confirmado',
    });

    setTransactions(cancelRes.updatedTransactions);
    setAuditLogs(appendAuditLog(cancelRes.auditEntry));

    if (target.salaryRecordId) {
      const targetRecId = target.salaryRecordId;
      setSalaryData((prev) => ({
        ...prev,
        records: prev.records.map((r) =>
          r.id === targetRecId ? { ...r, linkedTransactionId: undefined } : r
        ),
      }));
    }

    triggerUndo(`Lançamento "${target.description}" cancelado (auditoria preservada).`, () => {
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                status: previousStatus,
                cancelledAt: undefined,
                cancellationReason: undefined,
              }
            : t
        )
      );
      if (target.salaryRecordId) {
        setSalaryData((prev) => ({
          ...prev,
          records: prev.records.map((r) =>
            r.id === target.salaryRecordId ? { ...r, linkedTransactionId: target.id } : r
          ),
        }));
      }
    });
  };

  const confirmTransactionReversal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalTarget) return;

    try {
      const result = reverseConfirmedTransaction({
        transaction: reversalTarget,
        existingTransactions: transactions,
        reason: reversalReason,
      });

      const nextAuditLogs = [result.auditEntry, ...auditLogs].slice(0, 1000);
      const nextReversals = [result.reversalRecord, ...loadReversalRecords()].slice(0, 1000);
      const nextSalaryData: SalaryDataset | undefined = reversalTarget.salaryRecordId
        ? {
            ...salaryData,
            records: salaryData.records.map((r) =>
              r.id === reversalTarget.salaryRecordId
                ? { ...r, linkedTransactionId: undefined, updatedAt: new Date().toISOString() }
                : r
            ),
          }
        : undefined;

      setTransactions(result.updatedTransactions);
      setAuditLogs(nextAuditLogs);
      if (nextSalaryData) {
        setSalaryData(nextSalaryData);
      }

      void commitAtomicMutationBatch({
        transactions: result.updatedTransactions,
        auditLogs: nextAuditLogs,
        reversals: nextReversals,
        ...(nextSalaryData ? { salaryData: nextSalaryData } : {}),
      });

      setFeedbackBanner(
        `Estorno registrado para "${reversalTarget.description}". Histórico original preservado.`
      );
      setTimeout(() => setFeedbackBanner(null), 5000);
      setReversalTarget(null);
      setReversalReason('');
      setReversalError('');
    } catch (err) {
      setReversalError(
        err instanceof Error ? err.message : 'Não foi possível concluir o estorno.'
      );
    }
  };

  const handleLinkSalaryToTransaction = (recordId: string, accountId: string) => {
    const rec = salaryData.records.find((r) => r.id === recordId);
    if (!rec || rec.amount === null || rec.amount <= 0) return;

    if (rec.linkedTransactionId && transactions.some((t) => t.id === rec.linkedTransactionId)) {
      setStorageWarning('Este registro salarial já está vinculado a uma transação bancária.');
      return;
    }

    const acc = derivedAccounts.find((a) => a.id === accountId && !a.archived);
    if (!acc) {
      setStorageWarning('Selecione uma conta bancária ativa para vincular o recebimento.');
      return;
    }

    const src = salaryData.sources.find((s) => s.id === rec.sourceId);
    const txId = generateEntityId('tr-sal');
    const monthLabel = MONTHS_PT_FULL[rec.month - 1] || String(rec.month);
    const txDate =
      rec.paymentDate || `${rec.year}-${String(rec.month).padStart(2, '0')}-05`;
    const amountCents = toCents(rec.amount);

    const newTx: Transaction = {
      id: txId,
      entityId: acc.entityId,
      accountId: acc.id,
      date: txDate,
      description: `Salário/Renda: ${src?.name || 'Fonte'} (${monthLabel}/${rec.year})`,
      category: 'Salário',
      account: `${acc.institutionName} · ${acc.accountName}`,
      amountCents,
      amount: fromCents(amountCents),
      direction: 'INCOME',
      status: 'CONFIRMED',
      origin: 'MANUAL',
      isInternalTransfer: false,
      operationType: 'TED_DOC',
      counterparty: src?.name,
      externalId: `sal-${rec.id}`,
      salaryRecordId: rec.id,
    };

    const nextTransactions = [newTx, ...transactions];
    const nextSalaryData: SalaryDataset = {
      ...salaryData,
      records: salaryData.records.map((r) =>
        r.id === rec.id
          ? { ...r, linkedTransactionId: txId, updatedAt: new Date().toISOString() }
          : r
      ),
    };

    setTransactions(nextTransactions);
    setSalaryData(nextSalaryData);
    void commitAtomicMutationBatch({
      transactions: nextTransactions,
      salaryData: nextSalaryData,
    });
    setFeedbackBanner(`Recebimento de ${src?.name || 'salário'} lançado na conta ${acc.institutionName}.`);
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleImportTransactions = (items: Omit<Transaction, 'id'>[]) => {
    const { accepted, reconciledTransactions, skippedDuplicatesCount } = reconcileImportBatch(
      items,
      transactions
    );

    if (accepted.length > 0 || reconciledTransactions.length > 0) {
      const reconciledMap = new Map(reconciledTransactions.map((t) => [t.id, t]));
      setTransactions((prev) => {
        const updated = prev.map((t) => reconciledMap.get(t.id) ?? t);
        return [...accepted, ...updated];
      });
    }

    const parts: string[] = [];
    if (accepted.length > 0) parts.push(`${accepted.length} novo(s) importado(s)`);
    if (reconciledTransactions.length > 0) {
      parts.push(`${reconciledTransactions.length} agendamento(s) conciliado(s) e confirmado(s)`);
    }
    if (skippedDuplicatesCount > 0) {
      parts.push(`${skippedDuplicatesCount} duplicata(s) ignorada(s)`);
    }

    if (parts.length > 0) {
      setFeedbackBanner(parts.join(' · ') + '.');
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleAddCategoryRule = (rule: Omit<CategoryRule, 'id' | 'createdAt'>) => {
    const created: CategoryRule = {
      ...rule,
      id: generateEntityId('rule'),
      createdAt: new Date().toISOString(),
    };
    setCategoryRules((prev) => [created, ...prev]);
    setFeedbackBanner(`Regra "${rule.keyword}" → ${rule.category} adicionada.`);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleDeleteCategoryRule = (id: string) => {
    setCategoryRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSaveInstitution = (inst: InstitutionProfile) => {
    setUserInstitutions((prev) => {
      const idx = prev.findIndex((i) => i.id === inst.id);
      if (idx >= 0) return prev.map((i, k) => (k === idx ? inst : i));
      return [inst, ...prev];
    });
    setFeedbackBanner(`Instituição "${inst.commercialName}" salva com sucesso.`);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleSaveAccountExtension = (ext: AccountExtensionMeta) => {
    setAccountExtensions((prev) => {
      const idx = prev.findIndex((e) => e.id === ext.id);
      if (idx >= 0) return prev.map((e, k) => (k === idx ? ext : e));
      return [ext, ...prev];
    });
  };

  const handleCreateAccountFromExtractions = (
    accData: Omit<Account, 'id'>,
    extData: Omit<AccountExtensionMeta, 'id' | 'updatedAt'>
  ): Account => {
    const openingBalanceCents =
      typeof accData.openingBalanceCents === 'number' &&
      Number.isSafeInteger(accData.openingBalanceCents)
        ? accData.openingBalanceCents
        : toCents(accData.openingBalance ?? 0);
    const newAcc: Account = {
      ...accData,
      id: generateEntityId('acc'),
      openingBalanceCents,
      openingBalance: fromCents(openingBalanceCents),
    };
    setAccounts((prev) => [...prev, newAcc]);
    const fullExt: AccountExtensionMeta = {
      ...extData,
      id: newAcc.id,
      updatedAt: new Date().toISOString(),
    };
    setAccountExtensions((prev) => [fullExt, ...prev]);
    setFeedbackBanner(
      `Conta "${newAcc.institutionName} · ${newAcc.accountName}" cadastrada e vinculada.`
    );
    setTimeout(() => setFeedbackBanner(null), 4000);
    return newAcc;
  };

  const handleSaveExtractionRule = (rule: ExtractionRule) => {
    setExtractionRules((prev) => {
      const idx = prev.findIndex((r) => r.id === rule.id);
      if (idx >= 0) return prev.map((r, k) => (k === idx ? rule : r));
      return [rule, ...prev];
    });
    setFeedbackBanner(`Regra aprendida "${rule.keyword}" salva.`);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleDeleteExtractionRule = (id: string) => {
    setExtractionRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleCommitExtractionIntegration = (result: ExtractionIntegrationCommitResult) => {
    setExtractionBatches((prev) =>
      prev.map((b) => (b.id === result.batch.id ? result.batch : b))
    );

    const existingIds = new Set(transactions.map((t) => t.id));
    const trulyNewTransactions = result.newTransactions.filter((t) => !existingIds.has(t.id));
    const updatedTxMap = new Map(result.updatedTransactions.map((t) => [t.id, t]));
    const nextTransactions = [
      ...trulyNewTransactions,
      ...transactions.map((t) => updatedTxMap.get(t.id) ?? t),
    ];

    const existingAssetIds = new Set(assets.map((a) => a.id));
    const trulyNewAssets = result.newAssets.filter((a) => !existingAssetIds.has(a.id));
    const updatedAssetMap = new Map(result.updatedAssets.map((a) => [a.id, a]));
    const nextAssets = [...assets.map((a) => updatedAssetMap.get(a.id) ?? a), ...trulyNewAssets];

    const updatedCardMap = new Map(result.updatedCreditCards.map((c) => [c.id, c]));
    const nextCards = creditCards.map((c) => updatedCardMap.get(c.id) ?? c);

    let nextAuditLogs = auditLogs;
    if (result.integratedCount > 0) {
      const totalBatchCents = result.newTransactions.reduce(
        (acc, t) => addMoney(acc, getTransactionAmountCents(t)),
        cents(0)
      );
      const auditEntry: AuditLogEntry = {
        id: generateEntityId('aud'),
        action: 'EXTRACTION_BATCH_INTEGRATED',
        entityType: 'TRANSACTION',
        entityId: result.batch.id,
        actor: currentUser?.displayName || currentUser?.email || 'Usuário',
        timestamp: new Date().toISOString(),
        reason: `Integração aprovada do arquivo "${result.batch.fileName}": ${result.integratedCount} movimentação(ões) integrada(s).`,
        amountCents: totalBatchCents,
        previousState: { batchStatus: 'REVISAO' },
        nextState: {
          batchStatus: result.batch.status,
          integratedCount: result.integratedCount,
          newTransactions: trulyNewTransactions.length,
          newAssets: trulyNewAssets.length,
        },
      };
      nextAuditLogs = appendAuditLog(auditEntry);
      setAuditLogs(nextAuditLogs);
    }

    setTransactions(nextTransactions);
    setAssets(nextAssets);
    setCreditCards(nextCards);

    void commitAtomicMutationBatch({
      transactions: nextTransactions,
      assets: nextAssets,
      creditCards: nextCards,
      auditLogs: nextAuditLogs,
    });

    if (result.integratedCount > 0 || result.skippedDuplicateCount > 0) {
      setFeedbackBanner(
        `Extração integrada: ${result.integratedCount} aprovada(s) e registrada(s)${
          result.skippedDuplicateCount > 0
            ? ` · ${result.skippedDuplicateCount} duplicata(s) protegida(s)`
            : ''
        }.`
      );
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleAddBoleto = (bol: Boleto) => {
    setBoletos((prev) => [bol, ...prev]);
  };

  const handlePayBoleto = (id: string, accountId?: string, paidAmount?: number) => {
    const target = boletos.find((b) => b.id === id);
    if (!target) return;
    if (!accountId) {
      setStorageWarning('Selecione uma conta bancária ativa para registrar a baixa do boleto.');
      return;
    }

    const acc = derivedAccounts.find((a) => a.id === accountId && !a.archived);
    if (!acc) {
      setStorageWarning('A conta pagadora selecionada não está disponível.');
      return;
    }

    const resolvedPaidAmount =
      typeof paidAmount === 'number' && Number.isFinite(paidAmount) && paidAmount > 0
        ? paidAmount
        : target.valorOriginal;
    const payDate = todayLocal();

    const paidCents = toCents(resolvedPaidAmount);
    const exactPaidAmount = fromCents(paidCents);

    const nextBoletos = boletos.map((b) =>
      b.id === id
        ? {
            ...b,
            status: 'PAID' as const,
            paidAt: payDate,
            paidAmount: exactPaidAmount,
            paidAccountId: acc.id,
          }
        : b
    );

    const newTx: Transaction = {
      id: generateEntityId('tr'),
      entityId: target.entityId,
      accountId: acc.id,
      date: payDate,
      description: `Pgto Boleto: ${target.beneficiario}`,
      category: target.category || 'Outros',
      account: `${acc.institutionName} · ${acc.accountName}`,
      amountCents: paidCents,
      amount: exactPaidAmount,
      direction: 'EXPENSE',
      status: 'CONFIRMED',
      origin: 'BOLETO',
      operationType: 'BOLETO',
      counterparty: target.beneficiario,
    };
    const nextTransactions = [newTx, ...transactions];

    setBoletos(nextBoletos);
    setTransactions(nextTransactions);
    void commitAtomicMutationBatch({
      boletos: nextBoletos,
      transactions: nextTransactions,
    });
  };

  const handleDeleteBoleto = (id: string) => {
    const idx = boletos.findIndex((b) => b.id === id);
    const removed = idx >= 0 ? boletos[idx] : null;
    if (!removed) return;

    setPendingDeleteConfirm({
      title: 'Excluir boleto',
      itemLabel: removed.beneficiario,
      description: `Vencimento ${removed.vencimento.split('-').reverse().join('/')} · R$ ${removed.valorOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      confirmLabel: 'Excluir boleto',
      onConfirm: () => {
        setBoletos((prev) => prev.filter((b) => b.id !== id));
        triggerUndo(`Boleto "${removed.beneficiario}" removido.`, () => {
          setBoletos((prev) => {
            if (prev.some((b) => b.id === removed.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
        });
      },
    });
  };

  const handleAddAccount = (accData: Omit<Account, 'id'>) => {
    const openingBalanceCents =
      typeof accData.openingBalanceCents === 'number' && Number.isSafeInteger(accData.openingBalanceCents)
        ? accData.openingBalanceCents
        : toCents(accData.openingBalance ?? 0);
    const newAcc: Account = {
      ...accData,
      id: generateEntityId('acc'),
      openingBalanceCents,
      openingBalance: fromCents(openingBalanceCents),
    };
    setAccounts((prev) => [...prev, newAcc]);
  };

  const handleDeleteAccount = (id: string) => {
    const idx = accounts.findIndex((a) => a.id === id);
    const target = idx >= 0 ? accounts[idx] : undefined;
    const check = canDeleteAccount(id, { transactions, boletos, account: target });
    if (!check.allowed) {
      setStorageWarning(
        check.reason ||
          'Não é possível excluir uma conta com lançamentos vinculados. Arquive a conta para preservar o histórico e saldos.'
      );
      return;
    }
    if (!target) return;

    setPendingDeleteConfirm({
      title: 'Excluir conta bancária',
      itemLabel: `${target.institutionName} · ${target.accountName}`,
      description: 'Esta conta não possui lançamentos vinculados e pode ser removida com segurança.',
      confirmLabel: 'Excluir conta',
      onConfirm: () => {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        triggerUndo(`Conta "${target.institutionName} · ${target.accountName}" excluída.`, () => {
          setAccounts((prev) => {
            if (prev.some((a) => a.id === target.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, target);
            return next;
          });
        });
      },
    });
  };

  const handleRestoreTransaction = (id: string) => {
    const target = transactions.find((t) => t.id === id);
    if (!target) return;
    try {
      const res = restoreCancelledTransaction({
        transaction: target,
        existingTransactions: transactions,
      });
      setTransactions(res.updatedTransactions);
      setAuditLogs(appendAuditLog(res.auditEntry));
      setFeedbackBanner(`Lançamento "${target.description}" restaurado como Pendente.`);
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err) {
      setStorageWarning(err instanceof Error ? err.message : 'Não foi possível restaurar o lançamento.');
    }
  };

  const handleInternalTransfer = (params: {
    originAccountId: string;
    destinationAccountId: string;
    amountCents: MoneyCents;
    date: string;
    description: string;
  }): { ok: boolean; error?: string } => {
    try {
      const res = executeInternalTransfer({
        ...params,
        accounts: derivedAccounts,
        existingTransactions: transactions,
      });
      const nextAuditLogs = [res.auditEntry, ...auditLogs].slice(0, 1000);
      setTransactions(res.updatedTransactions);
      setAuditLogs(nextAuditLogs);
      void commitAtomicMutationBatch({
        transactions: res.updatedTransactions,
        auditLogs: nextAuditLogs,
      });
      setFeedbackBanner(
        `Transferência de R$ ${fromCents(params.amountCents).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} registrada nas duas contas.`
      );
      setTimeout(() => setFeedbackBanner(null), 5000);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao executar transferência.';
      return { ok: false, error: message };
    }
  };

  const handleToggleArchiveAccount = (id: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, archived: !a.archived } : a))
    );
  };

  const handleAddCard = (cardData: Omit<CreditCard, 'id'>) => {
    const newCard: CreditCard = { ...cardData, id: generateEntityId('card') };
    setCreditCards((prev) => [...prev, newCard]);
  };

  const handlePayCardInvoice = (cardId: string, accountId?: string, paidAmount?: number) => {
    const card = creditCards.find((c) => c.id === cardId);
    if (!card) return;

    const invoiceCents = toCents(card.currentInvoiceAmount);
    const requestedCents =
      typeof paidAmount === 'number' && Number.isFinite(paidAmount) && paidAmount > 0
        ? toCents(paidAmount)
        : invoiceCents;
    const amountToPayCents = cents(Math.min(invoiceCents, requestedCents));
    const remainingCents = subtractMoney(invoiceCents, amountToPayCents);

    const nextCards = creditCards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            currentInvoiceAmount: fromCents(remainingCents),
            status: (remainingCents === 0 ? 'PAID' : 'OPEN') as CreditCard['status'],
          }
        : c
    );

    let nextTransactions: Transaction[] | undefined;
    if (accountId && amountToPayCents > 0) {
      const acc = derivedAccounts.find((a) => a.id === accountId && !a.archived);
      if (acc) {
        const newTx: Transaction = {
          id: generateEntityId('tr'),
          entityId: card.entityId,
          accountId: acc.id,
          date: todayLocal(),
          description:
            remainingCents === 0
              ? `Pgto Fatura: ${card.cardName}`
              : `Pgto Parcial Fatura: ${card.cardName}`,
          category: 'Cartão',
          account: `${acc.institutionName} · ${acc.accountName}`,
          amountCents: amountToPayCents,
          amount: fromCents(amountToPayCents),
          direction: 'EXPENSE',
          status: 'CONFIRMED',
          origin: 'MANUAL',
          operationType: 'CARTAO',
          counterparty: card.institutionName,
        };
        nextTransactions = [newTx, ...transactions];
      }
    }

    setCreditCards(nextCards);
    if (nextTransactions) {
      setTransactions(nextTransactions);
    }
    void commitAtomicMutationBatch({
      creditCards: nextCards,
      ...(nextTransactions ? { transactions: nextTransactions } : {}),
    });
  };

  const handleUpdateCardInvoice = (cardId: string, amount: number, mode: 'add' | 'set') => {
    const card = creditCards.find((c) => c.id === cardId);
    if (!card) return;
    const currentCents = toCents(card.currentInvoiceAmount);
    const inputCents = toCents(amount);
    const nextCents = mode === 'add' ? addMoney(currentCents, inputCents) : inputCents;

    setCreditCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              currentInvoiceAmount: fromCents(nextCents),
              status: nextCents === 0 ? 'PAID' : 'OPEN',
            }
          : c
      )
    );
    setFeedbackBanner(
      `Fatura de "${card.cardName}" atualizada para R$ ${fromCents(nextCents).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`
    );
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleSaveBudget = (params: {
    entityScope: EntityScope;
    category: string;
    limitCents: MoneyCents;
  }) => {
    const nowIso = new Date().toISOString();
    setBudgets((prev) => {
      const existing = prev.find(
        (b) => b.entityScope === params.entityScope && b.category === params.category
      );
      if (existing) {
        return prev.map((b) =>
          b.id === existing.id
            ? {
                ...b,
                limitCents: params.limitCents,
                limitAmount: fromCents(params.limitCents),
                updatedAt: nowIso,
              }
            : b
        );
      }
      const created: CategoryBudget = {
        id: generateEntityId('bdg'),
        entityScope: params.entityScope,
        category: params.category,
        limitCents: params.limitCents,
        limitAmount: fromCents(params.limitCents),
        updatedAt: nowIso,
      };
      return [created, ...prev];
    });
    setFeedbackBanner(`Teto mensal salvo para "${params.category}".`);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  const handleDeleteBudget = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  const handleDeleteCard = (id: string) => {
    const idx = creditCards.findIndex((c) => c.id === id);
    const removed = idx >= 0 ? creditCards[idx] : null;
    if (!removed) return;

    setPendingDeleteConfirm({
      title: 'Excluir cartão de crédito',
      itemLabel: `${removed.cardName} (${removed.institutionName} •••• ${removed.last4})`,
      description: 'Os lançamentos já registrados anteriormente não serão apagados do extrato.',
      confirmLabel: 'Excluir cartão',
      onConfirm: () => {
        setCreditCards((prev) => prev.filter((c) => c.id !== id));
        triggerUndo(`Cartão "${removed.cardName}" removido.`, () => {
          setCreditCards((prev) => {
            if (prev.some((c) => c.id === removed.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
        });
      },
    });
  };

  const handleAddDebt = (debtData: Omit<Debt, 'id'>) => {
    setDebts((prev) => [...prev, { ...debtData, id: generateEntityId('debt') }]);
  };

  const handleAmortizeDebt = (debtId: string, paidAmount: number, accountId?: string) => {
    const debt = debts.find((d) => d.id === debtId);
    if (!debt || !Number.isFinite(paidAmount) || paidAmount <= 0) return;

    const currentCents = toCents(debt.outstandingAmount);
    const paymentCents = cents(Math.min(currentCents, toCents(paidAmount)));
    const nextOutstandingCents = subtractMoney(currentCents, paymentCents);

    const nextDebts = debts.map((d) =>
      d.id === debtId
        ? {
            ...d,
            outstandingAmount: fromCents(nextOutstandingCents),
            status: (nextOutstandingCents === 0 ? 'PAID' : d.status) as Debt['status'],
          }
        : d
    );

    let nextTransactions: Transaction[] | undefined;
    if (accountId && paymentCents > 0) {
      const acc = derivedAccounts.find((a) => a.id === accountId && !a.archived);
      if (acc) {
        const newTx: Transaction = {
          id: generateEntityId('tr'),
          entityId: debt.entityId,
          accountId: acc.id,
          date: todayLocal(),
          description: `Amortização Dívida: ${debt.creditorName}`,
          category: 'Outros',
          account: `${acc.institutionName} · ${acc.accountName}`,
          amountCents: paymentCents,
          amount: fromCents(paymentCents),
          direction: 'EXPENSE',
          status: 'CONFIRMED',
          origin: 'MANUAL',
          operationType: 'BOLETO',
          counterparty: debt.creditorName,
        };
        nextTransactions = [newTx, ...transactions];
      }
    }

    setDebts(nextDebts);
    if (nextTransactions) {
      setTransactions(nextTransactions);
    }
    void commitAtomicMutationBatch({
      debts: nextDebts,
      ...(nextTransactions ? { transactions: nextTransactions } : {}),
    });

    setFeedbackBanner(
      nextOutstandingCents === 0
        ? `Dívida "${debt.creditorName}" quitada!`
        : `Amortização de R$ ${fromCents(paymentCents).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} registrada em "${debt.creditorName}".`
    );
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleDeleteDebt = (id: string) => {
    const idx = debts.findIndex((d) => d.id === id);
    const removed = idx >= 0 ? debts[idx] : null;
    if (!removed) return;

    setPendingDeleteConfirm({
      title: 'Excluir compromisso / dívida',
      itemLabel: removed.creditorName,
      description: `Saldo devedor atual: R$ ${removed.outstandingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      confirmLabel: 'Excluir dívida',
      onConfirm: () => {
        setDebts((prev) => prev.filter((d) => d.id !== id));
        triggerUndo(`Compromisso "${removed.creditorName}" removido.`, () => {
          setDebts((prev) => {
            if (prev.some((d) => d.id === removed.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
        });
      },
    });
  };

  const handleAddAsset = (assetData: Omit<Asset, 'id'>) => {
    setAssets((prev) => [...prev, { ...assetData, id: generateEntityId('ast') }]);
  };

  const handleDeleteAsset = (id: string) => {
    const idx = assets.findIndex((a) => a.id === id);
    const removed = idx >= 0 ? assets[idx] : null;
    if (!removed) return;

    setPendingDeleteConfirm({
      title: 'Excluir ativo patrimonial',
      itemLabel: removed.description,
      description: `Valor estimado: R$ ${removed.currentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      confirmLabel: 'Excluir ativo',
      onConfirm: () => {
        setAssets((prev) => prev.filter((a) => a.id !== id));
        triggerUndo(`Ativo "${removed.description}" removido.`, () => {
          setAssets((prev) => {
            if (prev.some((a) => a.id === removed.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
        });
      },
    });
  };

  const handleAddDocument = (doc: DocumentItem) => {
    setDocuments((prev) => [doc, ...prev]);
  };

  const handleDeleteDocument = (id: string) => {
    const idx = documents.findIndex((d) => d.id === id);
    const removed = idx >= 0 ? documents[idx] : null;
    if (!removed) return;

    setPendingDeleteConfirm({
      title: 'Excluir documento',
      itemLabel: removed.name,
      description: 'O arquivo anexo será removido após o prazo de desfazer (7 segundos).',
      confirmLabel: 'Excluir documento',
      onConfirm: () => {
        setDocuments((prev) => prev.filter((d) => d.id !== id));

        const timer = setTimeout(() => {
          void fileStorageService.deleteFile(id);
          docDeleteTimersRef.current.delete(id);
        }, 7500);
        docDeleteTimersRef.current.set(id, timer);

        triggerUndo(`Documento "${removed.name}" removido.`, () => {
          const pendingTimer = docDeleteTimersRef.current.get(id);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            docDeleteTimersRef.current.delete(id);
          }
          setDocuments((prev) => {
            if (prev.some((d) => d.id === removed.id)) return prev;
            const next = [...prev];
            next.splice(Math.min(idx, next.length), 0, removed);
            return next;
          });
        });
      },
    });
  };

  const handleImportBackup = (
    payload: FullBackupPayload,
    mode: 'replace' | 'merge'
  ): { ok: boolean; error?: string } => {
    const rollbackSnapshot = createSafetySnapshot(
      mode === 'replace' ? 'replace_import' : 'manual'
    );

    const currentDataset = {
      accounts,
      transactions,
      creditCards,
      boletos,
      debts,
      assets,
      documents,
      salaries: salaryData,
      budgets,
      categoryRules,
      settings: { theme, density, zoom },
    };

    try {
      const { next, addedTotal } = applyBackupDataset(currentDataset, payload.data, mode);
      const integrity = validateDatasetIntegrity(next);
      if (!integrity.ok) {
        const prevData = rollbackSnapshot.backup.data;
        setAccounts(prevData.accounts);
        setTransactions(prevData.transactions);
        setCreditCards(prevData.creditCards);
        setBoletos(prevData.boletos);
        setDebts(prevData.debts);
        setAssets(prevData.assets);
        setDocuments(prevData.documents);
        if (prevData.salaries) setSalaryData(prevData.salaries);
        if (prevData.budgets) setBudgets(prevData.budgets);
        if (prevData.categoryRules) setCategoryRules(prevData.categoryRules);
        return {
          ok: false,
          error: integrity.error || 'Falha de integridade após leitura do backup.',
        };
      }

      setAccounts(next.accounts);
      setTransactions(next.transactions);
      setCreditCards(next.creditCards);
      setBoletos(next.boletos);
      setDebts(next.debts);
      setAssets(next.assets);
      setDocuments(next.documents);
      if (next.salaries) setSalaryData(next.salaries);
      if (next.budgets) setBudgets(next.budgets);
      if (next.categoryRules) setCategoryRules(next.categoryRules);

      if (mode === 'replace' && next.settings) {
        if (next.settings.theme) setTheme(next.settings.theme);
        if (next.settings.density) setDensity(next.settings.density);
        if (next.settings.zoom) setZoom(next.settings.zoom);
      }

      setFeedbackBanner(
        mode === 'replace'
          ? 'Backup completo restaurado com snapshot de segurança salvo.'
          : `${addedTotal} registro(s) novo(s) importado(s) do backup.`
      );
      setTimeout(() => setFeedbackBanner(null), 5000);
      return { ok: true };
    } catch (err) {
      const prevData = rollbackSnapshot.backup.data;
      setAccounts(prevData.accounts);
      setTransactions(prevData.transactions);
      setCreditCards(prevData.creditCards);
      setBoletos(prevData.boletos);
      setDebts(prevData.debts);
      setAssets(prevData.assets);
      setDocuments(prevData.documents);
      if (prevData.salaries) setSalaryData(prevData.salaries);
      if (prevData.budgets) setBudgets(prevData.budgets);
      if (prevData.categoryRules) setCategoryRules(prevData.categoryRules);
      const msg = err instanceof Error ? err.message : 'Falha inesperada na importação do backup.';
      setStorageWarning(`Rollback acionado: ${msg}`);
      return { ok: false, error: msg };
    }
  };

  const handleRestoreSnapshot = () => {
    if (!preResetSnapshot) return;
    const snapData = preResetSnapshot.backup.data;
    setAccounts(snapData.accounts);
    setTransactions(snapData.transactions);
    setCreditCards(snapData.creditCards);
    setBoletos(snapData.boletos);
    setDebts(snapData.debts);
    setAssets(snapData.assets);
    setDocuments(snapData.documents);
    if (snapData.salaries) setSalaryData(snapData.salaries);
    if (snapData.budgets) setBudgets(snapData.budgets);
    if (snapData.categoryRules) setCategoryRules(snapData.categoryRules);
    if (snapData.settings) {
      if (snapData.settings.theme) setTheme(snapData.settings.theme);
      if (snapData.settings.density) setDensity(snapData.settings.density);
      if (snapData.settings.zoom) setZoom(snapData.settings.zoom);
    }
    setFeedbackBanner('Snapshot anterior restaurado com sucesso!');
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  const handleResetData = (): { ok: boolean; error?: string } => {
    const check = captureAndValidateExistingLocalBackup(
      latestDatasetRef.current,
      'reset',
      currentUser?.uid
    );
    if (!check.ok || !check.snapshot) {
      const msg =
        check.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.';
      setStorageWarning(msg);
      return { ok: false, error: msg };
    }

    setPreResetSnapshot(check.snapshot);
    clearEntityStoragePreservingBackups();
    void fileStorageService.clearAllFiles();
    setTransactions([]);
    setAccounts([]);
    setCreditCards([]);
    setBoletos([]);
    setDebts([]);
    setAssets([]);
    setDocuments([]);
    setSalaryData(EMPTY_SALARY_DATASET);
    setBudgets([]);
    setCategoryRules([]);
    setExtractionBatches([]);
    setUserInstitutions([]);
    setAccountExtensions([]);
    setExtractionRules([]);
    setFeedbackBanner(
      'Dados financeiros zerados com segurança (estado vazio). Um backup validado foi preservado em Configurações.'
    );
    setTimeout(() => setFeedbackBanner(null), 6000);
    return { ok: true };
  };

  const handleResolveSyncConflict = async (strategy: ConflictResolutionStrategy) => {
    if (!currentUser || !syncConflict) return;
    setConflictBusy(true);
    try {
      const res = await resolveSyncConflict({
        user: currentUser,
        conflict: syncConflict,
        strategy,
      });
      if (!res.ok) {
        setStorageWarning(res.error || 'Falha ao resolver divergência.');
        return;
      }
      if (res.dataset) {
        applyRestoredDataset(res.dataset);
      }
      cloudHydratedForUidRef.current = currentUser.uid;
      setSyncConflict(null);
      if (res.syncedAt) setLastSyncedAt(res.syncedAt);
      const pending = await getPendingCloudSyncCount(currentUser.uid);
      setPendingSyncCount(pending);
      setSyncStatus(currentUser.emailVerified ? 'SYNCED' : 'UNVERIFIED_EMAIL');
      setSyncStatusMessage(
        currentUser.emailVerified
          ? 'Sincronização com a nuvem concluída.'
          : 'Seus dados estão salvos neste dispositivo.'
      );
      setFeedbackBanner('Divergência resolvida com backup automático salvo antes da atualização.');
      setTimeout(() => setFeedbackBanner(null), 5000);
    } finally {
      setConflictBusy(false);
    }
  };

  const handleSyncNow = async () => {
    if (!currentUser) return;
    await runCloudReconciliation(currentUser);
  };

  const handleCreateCloudBackup = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) {
      return { ok: false, error: 'Faça login para criar snapshots na nuvem.' };
    }
    setCloudBackupBusy(true);
    try {
      const res = await createCloudBackupSnapshot({
        user: currentUser,
        dataset: latestDatasetRef.current,
        reason: 'manual',
      });
      if (res.ok) {
        await refreshCloudBackupsList(currentUser.uid);
      }
      return { ok: res.ok, error: res.error };
    } finally {
      setCloudBackupBusy(false);
    }
  };

  const handleRestoreCloudBackup = async (
    backup: CloudBackupSnapshotMeta
  ): Promise<{ ok: boolean; error?: string }> => {
    setCloudBackupBusy(true);
    try {
      const res = validateAndPrepareCloudRestore({
        backup,
        currentDataset: latestDatasetRef.current,
        mode: 'replace',
      });
      if (!res.ok || !res.restoredDataset) {
        return { ok: false, error: res.error };
      }
      applyRestoredDataset(res.restoredDataset);
      setFeedbackBanner('Backup da nuvem restaurado após verificação de integridade.');
      setTimeout(() => setFeedbackBanner(null), 5000);
      return { ok: true };
    } finally {
      setCloudBackupBusy(false);
    }
  };

  const handleRefreshEmailVerification = async () => {
    const refreshed = await reloadCurrentAuthUser();
    if (refreshed) {
      setCurrentUser(refreshed);
      if (refreshed.emailVerified) {
        cloudHydratedForUidRef.current = null;
        await runCloudReconciliation(refreshed);
      }
    }
  };

  const handlePrepareFreshDeviceOnAuth = (): { ok: boolean; error?: string } => {
    const check = captureAndValidateExistingLocalBackup(
      latestDatasetRef.current,
      'manual',
      currentUser?.uid
    );
    if (!check.ok) {
      const msg =
        check.error || 'Não foi possível validar o backup. Seus dados originais foram preservados.';
      setStorageWarning(msg);
      return { ok: false, error: msg };
    }
    if (check.snapshot) setPreResetSnapshot(check.snapshot);
    clearEntityStoragePreservingBackups();
    void clearActiveOwnerMeta();
    void fileStorageService.clearAllFiles();
    skipNextAutoSyncRef.current = true;
    setTransactions([]);
    setAccounts([]);
    setCreditCards([]);
    setBoletos([]);
    setDebts([]);
    setAssets([]);
    setDocuments([]);
    setSalaryData(EMPTY_SALARY_DATASET);
    setBudgets([]);
    setCategoryRules([]);
    setExtractionBatches([]);
    setUserInstitutions([]);
    setAccountExtensions([]);
    setExtractionRules([]);
    return { ok: true };
  };

  const handleClearLocalWorkspace = () => {
    const res = handlePrepareFreshDeviceOnAuth();
    if (!res.ok) return;
    setFeedbackBanner('Cache local limpo após backup. Seus dados na nuvem permanecem intactos.');
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  const handleSignOut = async () => {
    await signOutAuthUser();
    cloudHydratedForUidRef.current = null;
    setCurrentUser(null);
    setSyncConflict(null);
    setCloudBackups([]);
  };

  const handleSwitchAccountFresh = async () => {
    const res = handlePrepareFreshDeviceOnAuth();
    if (!res.ok) return;
    await signOutAuthUser();
    cloudHydratedForUidRef.current = null;
    setCurrentUser(null);
    setSyncConflict(null);
    setCloudBackups([]);
  };

  const handleDeleteUserAccount = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!currentUser) return { ok: false, error: 'Nenhum usuário autenticado.' };
    try {
      await purgeUserCloudData(currentUser.uid);
      const authRes = await deleteCurrentFirebaseUser();
      if (!authRes.ok) {
        return { ok: false, error: authRes.error };
      }
      clearEntityStoragePreservingBackups();
      void fileStorageService.clearAllFiles();
      skipNextAutoSyncRef.current = true;
      setTransactions([]);
      setAccounts([]);
      setCreditCards([]);
      setBoletos([]);
      setDebts([]);
      setAssets([]);
      setDocuments([]);
      setSalaryData(EMPTY_SALARY_DATASET);
      setBudgets([]);
      setCategoryRules([]);
      setExtractionBatches([]);
      setUserInstitutions([]);
      setAccountExtensions([]);
      setExtractionRules([]);
      cloudHydratedForUidRef.current = null;
      setCurrentUser(null);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Falha ao excluir conta.',
      };
    }
  };

  const openNewModalForEntity = (entity: 'CPF' | 'CNPJ') => {
    setEditingTransaction(null);
    setDefaultModalEntity(entity);
    setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setDefaultModalEntity(tx.entityId);
    setIsModalOpen(true);
  };

  // All React hooks are declared ABOVE this point (strict Rules of Hooks compliance)
  const pendingBankNotificationsCount = useMemo(
    () => notificationItems.filter((n) => n.status === 'PENDING').length,
    [notificationItems]
  );

  const existingLocalRecordsCount = useMemo(
    () => countDatasetRecords(currentFullDataset),
    [currentFullDataset]
  );

  if (!authReady) {
    return (
      <div className="min-h-dvh bg-[#F8FAFC] dark:bg-[#050B42] grid place-items-center p-6 text-center">
        <div className="space-y-2">
          <div className="font-display text-xl font-extrabold text-[#0F172A] dark:text-white">
            Sávio <span className="text-[#059669] dark:text-[#10B981]">Finanças</span>
          </div>
          <p className="text-xs font-medium text-[#64748B] dark:text-slate-400">
            Verificando sessão segura e integridade local...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthScreen
        existingLocalRecordsCount={existingLocalRecordsCount}
        onPrepareFreshDevice={handlePrepareFreshDeviceOnAuth}
      />
    );
  }

  if (vaultEnabled && !vaultKey) {
    return (
      <VaultLockScreen
        onUnlocked={(key) => {
          setVaultKey(key);
        }}
      />
    );
  }

  const handleConfirmNotification = async (resolution: NotificationReviewResolution) => {
    const targetItem = notificationItems.find((n) => n.id === resolution.notificationId);
    if (!targetItem) return;

    try {
      const effects = resolveConfirmedNotificationFinancialEffects({
        item: targetItem,
        resolution,
        accounts: derivedAccounts,
        creditCards,
        transactions,
        boletos,
      });

      const nextAuditLogs = effects.newAuditEntry
        ? [effects.newAuditEntry, ...auditLogs].slice(0, 1000)
        : undefined;

      if (effects.updatedTransactions) {
        setTransactions(effects.updatedTransactions);
      }
      if (effects.updatedCreditCards) {
        setCreditCards(effects.updatedCreditCards);
      }
      if (effects.updatedBoletos) {
        setBoletos(effects.updatedBoletos);
      }
      if (nextAuditLogs) {
        setAuditLogs(nextAuditLogs);
      }

      await commitAtomicMutationBatch({
        ...(effects.updatedTransactions ? { transactions: effects.updatedTransactions } : {}),
        ...(effects.updatedCreditCards ? { creditCards: effects.updatedCreditCards } : {}),
        ...(effects.updatedBoletos ? { boletos: effects.updatedBoletos } : {}),
        ...(nextAuditLogs ? { auditLogs: nextAuditLogs } : {}),
      });

      await updateNotificationStatus({
        id: targetItem.id,
        status: 'CONFIRMED',
        confirmedTransactionId: effects.confirmedTransactionId,
        confirmedCreditCardId: effects.confirmedCreditCardId,
      });

      await refreshNotificationState(false);
      setFeedbackBanner(effects.feedbackMessage);
      setTimeout(() => setFeedbackBanner(null), 5000);
    } catch (err) {
      setStorageWarning(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar a notificação bancária.'
      );
    }
  };

  const handleDiscardNotification = async (notificationId: string, reason?: string) => {
    await updateNotificationStatus({
      id: notificationId,
      status: 'DISCARDED',
      discardReason: reason,
    });
    await refreshNotificationState(false);
  };

  const handleUpdateNotificationSettings = async (next: NotificationCaptureSettings) => {
    const saved = await saveNotificationSettings(next);
    setNotificationSettings(saved);
    const status = await financeNotificationBridge.getPermissionStatus(saved.consentGranted);
    setNotificationPermissionStatus(status);
  };

  const handleOpenAndroidNotificationSettings = async () => {
    const res = await financeNotificationBridge.openNotificationSettings();
    if (!res.opened && res.error) {
      setStorageWarning(res.error);
    }
  };

  const handlePurgeDiscardedNotifications = async () => {
    const removed = await purgeDiscardedNotifications();
    await refreshNotificationState(false);
    setFeedbackBanner(
      removed > 0
        ? `${removed} notificação(ões) descartada(s) removida(s) da fila.`
        : 'Nenhuma notificação descartada para limpar.'
    );
    setTimeout(() => setFeedbackBanner(null), 4000);
  };

  const handleRevokeAndWipeNotifications = async () => {
    const revoked = await revokeConsentAndPurgeAllNotifications();
    setNotificationSettings(revoked);
    setNotificationItems([]);
    const status = await financeNotificationBridge.getPermissionStatus(false);
    setNotificationPermissionStatus(status);
    setFeedbackBanner('Autorização revogada e toda a fila criptografada de notificações foi apagada.');
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  return (
    <PrivacyProvider
      value={{
        isPrivacyMode: hideValues,
        togglePrivacyMode: toggleHideValues,
        setPrivacyMode: setHideValues,
        hideValues,
        toggleHideValues,
        setHideValues,
        showScopeBar,
        toggleScopeBar,
        setShowScopeBar,
        sidebarOpen,
        toggleSidebar,
        setSidebarOpen,
      }}
    >
      <div className="flex min-h-dvh bg-[#F8FAFC] dark:bg-[#050B42] text-[#0F172A] dark:text-slate-100 font-sans">
        {/* Sidebar hidden on mobile and collapsible on PC */}
        <div className={sidebarOpen ? 'hidden md:flex' : 'hidden'}>
          <Sidebar
            currentTab={currentTab}
            setCurrentTab={(tab) => handleNavigate(tab)}
            pendingBankNotificationsCount={pendingBankNotificationsCount}
            currentUser={currentUser}
            onSignOut={handleSignOut}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <Header
            currentTab={currentTab}
            scope={scope}
            setScope={setScope}
            period={period}
            setPeriod={setPeriod}
            periodOptions={periodOptions}
            onOpenNewTransaction={() => openNewModalForEntity(scope === 'CNPJ' ? 'CNPJ' : 'CPF')}
            theme={theme}
            onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            boletos={boletos}
            accounts={derivedAccounts}
            onNavigate={handleNavigate}
            syncStatus={syncStatus}
            pendingSyncCount={pendingSyncCount}
            onOpenShare={() => setShareSheetOpen(true)}
            hideValues={hideValues}
            onToggleHideValues={toggleHideValues}
          />

          <main className="p-4 pb-24 sm:p-8 sm:pb-24 md:pb-8 max-w-[1600px] w-full mx-auto flex-1">
          {storageWarning && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3">
              <span>{storageWarning}</span>
              <button
                type="button"
                onClick={() => setStorageWarning(null)}
                className="px-3 min-h-8 rounded-lg bg-amber-200/70 dark:bg-amber-900 text-xs font-bold shrink-0 cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          )}

          {feedbackBanner && (
            <div className="mb-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-semibold">
              {feedbackBanner}
            </div>
          )}

          {currentTab === 'dashboard' && (
            <DashboardView
              transactions={transactions}
              accounts={derivedAccounts}
              boletos={boletos}
              cards={creditCards}
              budgets={budgets}
              scope={scope}
              period={period}
              syncStatus={syncStatus}
              onNavigate={handleNavigate}
              onOpenNew={() => openNewModalForEntity(scope === 'CNPJ' ? 'CNPJ' : 'CPF')}
              onEditTransaction={openEditModal}
              onScopeChange={setScope}
            />
          )}

          {currentTab === 'cpf' && (
            <CpfView
              transactions={transactions}
              period={period}
              drilldownFilter={drilldownFilter}
              onClearDrilldownFilter={() => setDrilldownFilter(null)}
              onAddTransaction={() => openNewModalForEntity('CPF')}
              onEditTransaction={openEditModal}
              onDeleteTransaction={handleDeleteTransaction}
              onRestoreTransaction={handleRestoreTransaction}
              onTraceTransaction={(tx) => setTraceTargetTx(tx)}
            />
          )}

          {currentTab === 'cnpj' && (
            <CnpjView
              transactions={transactions}
              boletos={boletos}
              period={period}
              drilldownFilter={drilldownFilter}
              onClearDrilldownFilter={() => setDrilldownFilter(null)}
              onAddTransaction={() => openNewModalForEntity('CNPJ')}
              onEditTransaction={openEditModal}
              onDeleteTransaction={handleDeleteTransaction}
              onRestoreTransaction={handleRestoreTransaction}
              onTraceTransaction={(tx) => setTraceTargetTx(tx)}
              onNavigate={handleNavigate}
            />
          )}

          {currentTab === 'salary' && (
            <SalaryView
              dataset={salaryData}
              accounts={derivedAccounts}
              theme={theme}
              onUpdateDataset={setSalaryData}
              onBackupBeforeImport={() => backupSalaryBeforeImport()}
              onLinkSalaryToTransaction={handleLinkSalaryToTransaction}
              onNotifyUndo={triggerUndo}
            />
          )}

          {currentTab === 'accounts' && (
            <AccountsView
              accounts={derivedAccounts}
              transactions={transactions}
              boletos={boletos}
              onAddAccount={handleAddAccount}
              onDeleteAccount={handleDeleteAccount}
              onToggleArchiveAccount={handleToggleArchiveAccount}
              onInspectAccount={(acc) =>
                handleNavigate(acc.entityId === 'CNPJ' ? 'cnpj' : 'cpf', {
                  accountId: acc.id,
                  accountLabel: `${acc.institutionName} · ${acc.accountName}`,
                })
              }
              onExecuteTransfer={handleInternalTransfer}
            />
          )}

          {currentTab === 'cards' && (
            <CardsView
              cards={creditCards}
              accounts={derivedAccounts}
              onAddCard={handleAddCard}
              onPayCardInvoice={handlePayCardInvoice}
              onUpdateCardInvoice={handleUpdateCardInvoice}
              onDeleteCard={handleDeleteCard}
            />
          )}

          {currentTab === 'boletos' && (
            <BoletosView
              boletos={boletos}
              accounts={derivedAccounts}
              onAddBoleto={handleAddBoleto}
              onPayBoleto={handlePayBoleto}
              onDeleteBoleto={handleDeleteBoleto}
            />
          )}

          {currentTab === 'debts' && (
            <DebtsView
              debts={debts}
              accounts={derivedAccounts}
              onAddDebt={handleAddDebt}
              onAmortizeDebt={handleAmortizeDebt}
              onDeleteDebt={handleDeleteDebt}
            />
          )}

          {currentTab === 'planning' && (
            <PlanningView
              transactions={transactions}
              budgets={budgets}
              onSaveBudget={handleSaveBudget}
              onDeleteBudget={handleDeleteBudget}
              scope={scope}
              period={period}
            />
          )}

          {currentTab === 'investments' && (
            <InvestmentDashboard
              assets={assets}
              theme={theme}
              onNotifyUndo={triggerUndo}
            />
          )}

          {currentTab === 'assets' && (
            <AssetsView
              assets={assets}
              onAddAsset={handleAddAsset}
              onDeleteAsset={handleDeleteAsset}
            />
          )}

          {currentTab === 'documents' && (
            <DocumentsView
              documents={documents}
              accounts={derivedAccounts}
              transactions={transactions}
              onAddDocument={handleAddDocument}
              onDeleteDocument={handleDeleteDocument}
              onAddTransactions={handleImportTransactions}
            />
          )}

          {(currentTab === 'imports' || currentTab === 'extractions') && (
            <ExtractionsHubView
              accounts={derivedAccounts}
              creditCards={creditCards}
              assets={assets}
              debts={debts}
              transactions={transactions}
              categoryRules={categoryRules}
              batches={extractionBatches}
              institutions={allInstitutions}
              accountExtensions={accountExtensions}
              extractionRules={extractionRules}
              consolidationPrefs={consolidationPrefs}
              period={period}
              onUpdateBatches={setExtractionBatches}
              onSaveInstitution={handleSaveInstitution}
              onSaveAccountExtension={handleSaveAccountExtension}
              onCreateBankAccount={handleCreateAccountFromExtractions}
              onCommitIntegration={handleCommitExtractionIntegration}
              onSaveExtractionRule={handleSaveExtractionRule}
              onDeleteExtractionRule={handleDeleteExtractionRule}
              onAddCategoryRule={handleAddCategoryRule}
              onDeleteCategoryRule={handleDeleteCategoryRule}
              onUpdateConsolidationPrefs={setConsolidationPrefs}
              onNavigateModule={handleNavigate}
            />
          )}

          {currentTab === 'notifications' && (
            <NotificationInbox
              items={notificationItems}
              accounts={derivedAccounts}
              creditCards={creditCards}
              settings={notificationSettings}
              permissionStatus={notificationPermissionStatus}
              syncing={syncingNotifications}
              onSyncNow={() => refreshNotificationState(true)}
              onConfirmItem={handleConfirmNotification}
              onDiscardItem={handleDiscardNotification}
              onUpdateSettings={handleUpdateNotificationSettings}
              onOpenAndroidSettings={handleOpenAndroidNotificationSettings}
              onPurgeDiscarded={handlePurgeDiscardedNotifications}
              onRevokeAndWipe={handleRevokeAndWipeNotifications}
            />
          )}

          {currentTab === 'ai' && (
            <AiAssistantView
              transactions={transactions}
              boletos={boletos}
              accounts={derivedAccounts}
              cards={creditCards}
              debts={debts}
              scope={scope}
              period={period}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              transactions={transactions}
              accounts={derivedAccounts}
              boletos={boletos}
              debts={debts}
              assets={assets}
              scope={scope}
              period={period}
              onNavigate={handleNavigate}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              dataset={{
                accounts,
                transactions,
                creditCards,
                boletos,
                debts,
                assets,
                documents,
                salaries: salaryData,
                budgets,
                categoryRules,
                settings: { theme, density, zoom },
              }}
              transactions={transactions}
              boletos={boletos}
              auditLogs={auditLogs}
              preResetSnapshot={preResetSnapshot}
              onImportBackup={handleImportBackup}
              onRestoreSnapshot={handleRestoreSnapshot}
              onResetData={handleResetData}
              theme={theme}
              setTheme={setTheme}
              density={density}
              setDensity={setDensity}
              zoom={zoom}
              setZoom={setZoom}
              vaultEnabled={vaultEnabled}
              onEnableVaultPin={handleEnableVaultPin}
              onDisableVaultPin={handleDisableVaultPin}
              onLockVault={handleLockVault}
              currentUser={currentUser}
              syncStatus={syncStatus}
              syncStatusMessage={syncStatusMessage}
              lastSyncedAt={lastSyncedAt}
              pendingSyncCount={pendingSyncCount}
              hasSyncConflict={Boolean(syncConflict)}
              cloudBackups={cloudBackups}
              cloudBackupBusy={cloudBackupBusy}
              onSyncNow={handleSyncNow}
              onOpenSyncConflict={() => {
                if (syncConflict) setSyncConflict({ ...syncConflict });
              }}
              onCreateCloudBackup={handleCreateCloudBackup}
              onRestoreCloudBackup={handleRestoreCloudBackup}
              onRefreshCloudBackups={() => refreshCloudBackupsList(currentUser.uid)}
              onResendVerificationEmail={resendVerificationEmail}
              onRefreshEmailVerification={handleRefreshEmailVerification}
              onSignOut={handleSignOut}
              onSwitchAccountFresh={handleSwitchAccountFresh}
              onClearLocalWorkspace={handleClearLocalWorkspace}
              onDeleteAccount={handleDeleteUserAccount}
            />
          )}
        </main>
      </div>

      <MobileBottomNav
        currentTab={currentTab}
        setCurrentTab={(tab) => handleNavigate(tab)}
        scope={scope}
        onOpenNew={() => openNewModalForEntity(scope === 'CNPJ' ? 'CNPJ' : 'CPF')}
      />

      <OfflineIndicator
        cloudPendingCount={pendingSyncCount}
        cloudSyncStatusMsg={syncStatus === 'SYNCING' ? 'Sincronizando com a nuvem...' : null}
      />

      <SyncConflictSheet
        conflict={syncConflict}
        busy={conflictBusy}
        onResolve={handleResolveSyncConflict}
        onDismissLater={() => setSyncConflict(null)}
      />

      <MobileShareSheet
        open={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
      />

      <TraceabilitySheet
        open={Boolean(traceTargetTx)}
        onClose={() => setTraceTargetTx(null)}
        traceability={activeTraceability}
      />

      {pendingUndo && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-5 right-4 left-4 md:left-auto z-50 md:max-w-md bg-[#061E3E] dark:bg-[#11185A] text-white rounded-xl shadow-lg border border-white/15 px-4 py-3 flex items-center justify-between gap-3"
        >
          <span className="text-xs sm:text-sm font-medium truncate">{pendingUndo.label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={executeUndo}
              className="px-3 min-h-9 rounded-xl bg-[#059669] hover:bg-[#059669]/90 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={13} /> Desfazer
            </button>
            <button
              type="button"
              onClick={() => setPendingUndo(null)}
              aria-label="Fechar aviso"
              className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <TransactionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onSave={handleSaveTransaction}
        onSaveBatch={handleSaveTransactionBatch}
        accounts={derivedAccounts}
        defaultEntity={defaultModalEntity}
        editingTransaction={editingTransaction}
      />

      <Sheet
        open={Boolean(reversalTarget)}
        onClose={() => {
          setReversalTarget(null);
          setReversalReason('');
          setReversalError('');
        }}
        title="Estornar lançamento confirmado"
        subtitle="O registro original permanece no histórico e um lançamento inverso auditável será criado."
      >
        {reversalTarget && (
          <form onSubmit={confirmTransactionReversal} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 text-xs space-y-1">
              <div className="font-bold text-[#0F172A] dark:text-white">
                {reversalTarget.description}
              </div>
              <div className="text-[#64748B] dark:text-slate-300">
                {reversalTarget.date.split('-').reverse().join('/')} · {reversalTarget.account}
              </div>
              <div className="font-money font-bold text-[#0F172A] dark:text-white">
                {reversalTarget.direction === 'INCOME' ? 'Entrada original: ' : 'Saída original: '}
                {formatarValor(fromCents(getTransactionAmountCents(reversalTarget)), hideValues)}
              </div>
            </div>

            {reversalError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
                {reversalError}
              </div>
            )}

            <div>
              <label
                htmlFor="reversal-reason"
                className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1"
              >
                Motivo do estorno (obrigatório para auditoria)
              </label>
              <textarea
                id="reversal-reason"
                required
                rows={3}
                value={reversalReason}
                onChange={(e) => {
                  setReversalReason(e.target.value);
                  setReversalError('');
                }}
                placeholder="Ex.: Lançamento em duplicidade, pagamento devolvido..."
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  setReversalTarget(null);
                  setReversalReason('');
                  setReversalError('');
                }}
                className="flex-1 min-h-11 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="flex-[1.5] min-h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold cursor-pointer"
              >
                Confirmar estorno auditável
              </button>
            </div>
          </form>
        )}
      </Sheet>

      <ConfirmDeleteSheet
        open={Boolean(pendingDeleteConfirm)}
        title={pendingDeleteConfirm?.title || 'Confirmar exclusão'}
        itemLabel={pendingDeleteConfirm?.itemLabel || ''}
        description={pendingDeleteConfirm?.description}
        confirmLabel={pendingDeleteConfirm?.confirmLabel}
        onCancel={() => setPendingDeleteConfirm(null)}
        onConfirm={() => {
          const fn = pendingDeleteConfirm?.onConfirm;
          setPendingDeleteConfirm(null);
          fn?.();
        }}
      />
      </div>
    </PrivacyProvider>
  );
}
