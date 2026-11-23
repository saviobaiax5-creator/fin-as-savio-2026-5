import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APP_CATEGORIES,
  type Account,
  type Asset,
  type CategoryRule,
  type CreditCard,
  type Debt,
  type Direction,
  type EntityId,
  type Transaction,
} from '../../types';
import {
  EXTRACTION_MOVEMENT_LABELS,
  type AccountExtensionMeta,
  type ConsolidationPreferences,
  type CsvColumnMapping,
  type ExtractedMovement,
  type ExtractionBatch,
  type ExtractionIntegrationCommitResult,
  type ExtractionMovementType,
  type ExtractionRule,
  type ExtractionStage,
  type InstitutionCategory,
  type InstitutionProfile,
  type ParseResultPayload,
  type TraceabilityLookupResult,
} from '../../types/extractions';
import {
  buildExtractionBatchFromParseResult,
  processExtractionFile,
  reprocessBatchWithRemoteOcr,
} from '../../domain/extractions/extractionOrchestrator';
import { parseCsvStatement } from '../../domain/extractions/parsers/csvParser';
import { parseSpreadsheetStatement } from '../../domain/extractions/parsers/xlsxParser';
import { decodeTextBuffer } from '../../domain/extractions/parsers/ofxParser';
import { computeStatementBalanceSummary } from '../../domain/extractions/balanceReconciler';
import { evaluateMovementDuplicates } from '../../domain/extractions/duplicationDetector';
import { commitApprovedExtractionMovements } from '../../domain/extractions/extractionIntegrationService';
import { computeFastHash, validateExtractionUploadFile } from '../../domain/extractions/fileSecurity';
import { fileStorageService } from '../../services/fileStorage';
import { fromCents, toCents } from '../../domain/money/money';
import type { MoneyCents } from '../../domain/money/money';
import { formatCurrencyBRL, normalizeDescription, parseCurrencyInput } from '../../utils/financeCalculations';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { formatarValor } from '../../utils/formatters';
import { formatDateBR } from '../../utils/dateUtils';
import { todayLocal } from '../../utils/dateLocal';
import { generateEntityId } from '../../domain/common/id';
import { InstitutionCategoryBadge } from './InstitutionCategoryBadge';
import { InstitutionsAccountsTab } from './InstitutionsAccountsTab';
import { ConsolidationPanelTab } from './ConsolidationPanelTab';
import { TraceabilitySheet } from './TraceabilitySheet';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Ban,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  History,
  Image as ImageIcon,
  Landmark,
  Layers,
  Link2,
  Plus,
  Scale,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';

export type ExtractionsSubTab =
  | 'overview'
  | 'review'
  | 'reconcile'
  | 'institutions'
  | 'consolidation'
  | 'history';

interface ExtractionsHubViewProps {
  accounts: Account[];
  creditCards: CreditCard[];
  assets: Asset[];
  debts: Debt[];
  transactions: Transaction[];
  categoryRules: CategoryRule[];
  batches: ExtractionBatch[];
  institutions: InstitutionProfile[];
  accountExtensions: AccountExtensionMeta[];
  extractionRules: ExtractionRule[];
  consolidationPrefs: ConsolidationPreferences;
  period: string;
  onUpdateBatches: (next: ExtractionBatch[]) => void;
  onSaveInstitution: (inst: InstitutionProfile) => void;
  onSaveAccountExtension: (ext: AccountExtensionMeta) => void;
  onCreateBankAccount: (
    account: Omit<Account, 'id'>,
    extension: Omit<AccountExtensionMeta, 'id' | 'updatedAt'>
  ) => Account;
  onCommitIntegration: (result: ExtractionIntegrationCommitResult) => void;
  onSaveExtractionRule: (rule: ExtractionRule) => void;
  onDeleteExtractionRule: (id: string) => void;
  onAddCategoryRule?: (rule: Omit<CategoryRule, 'id' | 'createdAt'>) => void;
  onDeleteCategoryRule?: (id: string) => void;
  onUpdateConsolidationPrefs: (next: ConsolidationPreferences) => void;
  onNavigateModule?: (tab: string) => void;
}

const ACCEPTED_EXTENSIONS = [
  '.ofx',
  '.csv',
  '.xlsx',
  '.xls',
  '.pdf',
  '.xml',
  '.json',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
];

const PIPELINE_STAGES: Array<{ id: ExtractionStage; title: string }> = [
  { id: 'arquivo', title: 'Arquivo recebido' },
  { id: 'leitura', title: 'Leitura e extração' },
  { id: 'conta', title: 'Identificação bancária' },
  { id: 'classificacao', title: 'Classificação' },
  { id: 'duplicidades', title: 'Verificação de duplicidades' },
  { id: 'conferencia', title: 'Conferência e aprovação' },
  { id: 'concluido', title: 'Registro e conciliação' },
];

const ALL_MOVEMENT_TYPES = Object.keys(
  EXTRACTION_MOVEMENT_LABELS
) as ExtractionMovementType[];

export const ExtractionsHubView: React.FC<ExtractionsHubViewProps> = ({
  accounts,
  creditCards,
  assets,
  debts,
  transactions,
  categoryRules,
  batches,
  institutions,
  accountExtensions,
  extractionRules,
  consolidationPrefs,
  period,
  onUpdateBatches,
  onSaveInstitution,
  onSaveAccountExtension,
  onCreateBankAccount,
  onCommitIntegration,
  onSaveExtractionRule,
  onDeleteExtractionRule,
  onAddCategoryRule,
  onDeleteCategoryRule,
  onUpdateConsolidationPrefs,
  onNavigateModule,
}) => {
  const { hideValues } = usePrivacy();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [subTab, setSubTab] = useState<ExtractionsSubTab>('overview');
  const [activeBatchId, setActiveBatchId] = useState<string>(batches[0]?.id || '');
  const [processing, setProcessing] = useState(false);
  const [currentStage, setCurrentStage] = useState<ExtractionStage>('arquivo');
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const [lastRawBuffer, setLastRawBuffer] = useState<ArrayBuffer | null>(null);
  const [lastFileRef, setLastFileRef] = useState<File | null>(null);
  const [lastParsePreview, setLastParsePreview] = useState<ParseResultPayload | null>(null);
  const [ocrAuthorized, setOcrAuthorized] = useState(false);
  const [sideBySidePreviewUrl, setSideBySidePreviewUrl] = useState<string | null>(null);
  const [showSideBySideInReview, setShowSideBySideInReview] = useState(true);

  const [banner, setBanner] = useState<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(
    null
  );

  // Filters inside Review tab
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [selectedMovementIds, setSelectedMovementIds] = useState<Set<string>>(new Set());

  // Inline edit / rule learning modal state
  const [editingMovement, setEditingMovement] = useState<ExtractedMovement | null>(null);
  const [saveRuleChecked, setSaveRuleChecked] = useState(false);
  const [saveRuleKeyword, setSaveRuleKeyword] = useState('');

  // Manual movement insertion modal state
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualDraft, setManualDraft] = useState<{
    description: string;
    date: string;
    amountStr: string;
    currency: string;
    direction: Direction;
    movementType: ExtractionMovementType;
    suggestedCategory: string;
    entityId: EntityId | '';
    counterparty: string;
    bankTransactionId: string;
  }>({
    description: '',
    date: todayLocal(),
    amountStr: '',
    currency: 'BRL',
    direction: 'EXPENSE',
    movementType: 'DESPESA',
    suggestedCategory: 'Outros',
    entityId: '',
    counterparty: '',
    bankTransactionId: '',
  });

  // Quick account creation confirmation state
  const [createAccountPromptOpen, setCreateAccountPromptOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccEntity, setNewAccEntity] = useState<EntityId>('CPF');

  // Statement opening balance override for mathematical reconciliation
  const [manualOpeningStr, setManualOpeningStr] = useState('');

  // Traceability lookup sheet
  const [traceLookup, setTraceLookup] = useState<TraceabilityLookupResult | null>(null);

  // Rule creation form
  const [newRuleKw, setNewRuleKw] = useState('');
  const [newRuleCat, setNewRuleCat] = useState('Alimentação');

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const activeBatch = useMemo(
    () => batches.find((b) => b.id === activeBatchId) || batches[0] || null,
    [batches, activeBatchId]
  );

  // Automatically restore PDF / Image side-by-side preview from IndexedDB for the active batch
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    if (
      !activeBatch ||
      (activeBatch.format !== 'PDF' && activeBatch.format !== 'IMAGE') ||
      !activeBatch.fileId
    ) {
      setSideBySidePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    void fileStorageService.getFile(activeBatch.fileId).then((rec) => {
      if (cancelled) return;
      if (!rec) {
        setSideBySidePreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        return;
      }
      createdUrl = URL.createObjectURL(rec.blob);
      setSideBySidePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return createdUrl;
      });
    });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [activeBatch?.id, activeBatch?.fileId, activeBatch?.format]);

  // Overview aggregate KPIs across all batches
  const overviewStats = useMemo(() => {
    let identified = 0;
    let pending = 0;
    let approved = 0;
    let integrated = 0;
    let duplicates = 0;
    let unknown = 0;
    let errors = 0;

    for (const b of batches) {
      if (b.status === 'ERRO') errors += 1;
      for (const m of b.movements) {
        identified += 1;
        if (m.reviewStatus === 'PENDENTE') pending += 1;
        else if (m.reviewStatus === 'APROVADO') approved += 1;
        else if (m.reviewStatus === 'INTEGRADO') integrated += 1;
        else if (m.reviewStatus === 'PRECISA_IDENTIFICACAO') unknown += 1;
        else if (m.reviewStatus === 'ERRO') errors += 1;
        if (
          m.duplicateStatus === 'POSSIVEL_DUPLICIDADE' ||
          m.duplicateStatus === 'DUPLICIDADE_CONFIRMADA'
        ) {
          duplicates += 1;
        }
      }
    }
    return {
      totalFiles: batches.length,
      identified,
      pending,
      approved,
      integrated,
      duplicates,
      unknown,
      errors,
    };
  }, [batches]);

  const handleSelectFile = async (file?: File, useRemoteOcr = ocrAuthorized) => {
    if (!file) return;
    setBanner(null);

    const check = validateExtractionUploadFile(file);
    if (!check.ok) {
      setBanner({ type: 'err', text: check.error || 'Arquivo inválido.' });
      return;
    }

    setSelectedFileMeta({ name: file.name, size: file.size, type: file.type });
    setLastFileRef(file);
    setProcessing(true);
    setCurrentStage('arquivo');

    // Visual preview for PDF / Image
    if (sideBySidePreviewUrl) {
      URL.revokeObjectURL(sideBySidePreviewUrl);
      setSideBySidePreviewUrl(null);
    }
    if (check.format === 'IMAGE' || check.format === 'PDF') {
      setSideBySidePreviewUrl(URL.createObjectURL(file));
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { batch, parseResult, buffer } = await processExtractionFile({
        file,
        accounts,
        creditCards,
        transactions,
        previousBatches: batches,
        institutions,
        accountExtensions,
        categoryRules,
        extractionRules,
        allowRemoteOcr: useRemoteOcr,
        onStageChange: setCurrentStage,
        signal: controller.signal,
      });

      setLastRawBuffer(buffer);
      setLastParsePreview(parseResult);
      onUpdateBatches([batch, ...batches]);
      setActiveBatchId(batch.id);
      setSelectedMovementIds(new Set());

      if (batch.movements.length > 0) {
        setBanner({
          type: 'ok',
          text: `${batch.movements.length} movimentação(ões) extraída(s) para conferência. Nenhuma foi efetivada ainda — revise e aprove manualmente.`,
        });
      } else {
        setBanner({
          type: 'warn',
          text:
            batch.warnings[0] ||
            batch.errors[0] ||
            'Arquivo armazenado na Central de Extrações. Revise os parâmetros, autorize OCR ou insira manualmente na aba Revisão.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar arquivo.';
      if (msg === 'PROCESSAMENTO_CANCELADO') {
        setBanner({ type: 'warn', text: 'Processamento cancelado pelo usuário.' });
      } else {
        setBanner({ type: 'err', text: msg });
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleRunOcrOnActiveBatch = async () => {
    if (!activeBatch || (activeBatch.format !== 'PDF' && activeBatch.format !== 'IMAGE')) return;
    setBanner(null);

    let blobToRead: Blob | null = null;
    let mimeType = activeBatch.format === 'PDF' ? 'application/pdf' : 'image/jpeg';

    if (lastFileRef && lastFileRef.name === activeBatch.fileName && lastFileRef.size === activeBatch.fileSizeBytes) {
      blobToRead = lastFileRef;
      mimeType = lastFileRef.type || mimeType;
    } else if (activeBatch.fileId) {
      const stored = await fileStorageService.getFile(activeBatch.fileId);
      if (stored) {
        blobToRead = stored.blob;
        mimeType = stored.mimeType || mimeType;
      }
    }

    if (!blobToRead) {
      setBanner({
        type: 'warn',
        text: 'Arquivo original não encontrado neste dispositivo. Selecione o documento novamente para executar OCR.',
      });
      return;
    }

    setProcessing(true);
    setCurrentStage('leitura');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { batch: updatedBatch } = await reprocessBatchWithRemoteOcr({
        batch: activeBatch,
        blob: blobToRead,
        mimeType,
        accounts,
        creditCards,
        transactions,
        previousBatches: batches,
        institutions,
        accountExtensions,
        categoryRules,
        extractionRules,
        onStageChange: setCurrentStage,
        signal: controller.signal,
      });

      onUpdateBatches(batches.map((b) => (b.id === updatedBatch.id ? updatedBatch : b)));
      setSelectedMovementIds(new Set());

      if (updatedBatch.movements.length > 0) {
        setBanner({
          type: 'ok',
          text: `Leitura OCR concluída: ${updatedBatch.movements.length} lançamento(s) identificado(s) para conferência.`,
        });
      } else {
        setBanner({
          type: 'warn',
          text:
            updatedBatch.warnings[0] ||
            updatedBatch.errors[0] ||
            'Não foi possível extrair lançamentos via OCR. Você pode revisar o documento ao lado ou inserir manualmente.',
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao executar OCR.';
      if (msg === 'PROCESSAMENTO_CANCELADO') {
        setBanner({ type: 'warn', text: 'Leitura OCR cancelada pelo usuário.' });
      } else {
        setBanner({ type: 'err', text: msg });
      }
    } finally {
      setProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelProcessing = () => {
    abortControllerRef.current?.abort();
    setProcessing(false);
    if (activeBatch && activeBatch.status !== 'CONCLUIDO') {
      const cancelled: ExtractionBatch = {
        ...activeBatch,
        status: 'CANCELADO',
        cancelledAt: new Date().toISOString(),
      };
      onUpdateBatches(batches.map((b) => (b.id === cancelled.id ? cancelled : b)));
    }
  };

  const handleReapplyTabularParse = (params: {
    sheetName?: string;
    mapping?: CsvColumnMapping;
  }) => {
    if (!activeBatch || !lastRawBuffer) return;
    let nextParse: ParseResultPayload | null = null;
    if (activeBatch.format === 'CSV') {
      nextParse = parseCsvStatement(
        decodeTextBuffer(lastRawBuffer),
        activeBatch.fileName,
        params.mapping
      );
    } else if (activeBatch.format === 'XLSX' || activeBatch.format === 'XLS') {
      nextParse = parseSpreadsheetStatement(
        lastRawBuffer,
        activeBatch.fileName,
        params.sheetName || lastParsePreview?.tabularPreview?.selectedSheet,
        params.mapping
      );
    }
    if (!nextParse) return;

    const rebuilt = buildExtractionBatchFromParseResult({
      batchId: activeBatch.id,
      fileName: activeBatch.fileName,
      fileSizeBytes: activeBatch.fileSizeBytes,
      fileId: activeBatch.fileId,
      contentFingerprint: activeBatch.contentFingerprint,
      parseResult: nextParse,
      accounts,
      creditCards,
      transactions,
      previousBatches: batches.filter((b) => b.id !== activeBatch.id),
      institutions,
      accountExtensions,
      categoryRules,
      extractionRules,
    });

    setLastParsePreview(nextParse);
    onUpdateBatches(batches.map((b) => (b.id === rebuilt.id ? rebuilt : b)));
    setBanner({
      type: 'ok',
      text: `Releitura concluída: ${rebuilt.movements.length} lançamento(s) identificado(s).`,
    });
  };

  const updateActiveBatch = (updater: (b: ExtractionBatch) => ExtractionBatch) => {
    if (!activeBatch) return;
    const next = updater(activeBatch);
    onUpdateBatches(batches.map((b) => (b.id === next.id ? next : b)));
  };

  const handleBindBatchAccount = (accountId: string) => {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc || !activeBatch) return;
    updateActiveBatch((b) => ({
      ...b,
      confirmedAccountId: acc.id,
      confirmedEntityId: acc.entityId,
      identifiedAccount: {
        ...b.identifiedAccount,
        matchedAccountId: acc.id,
        holderNature: acc.entityId,
        requiresConfirmation: false,
      },
      movements: b.movements.map((m) =>
        m.reviewStatus === 'INTEGRADO'
          ? m
          : {
              ...m,
              targetAccountId: acc.id,
              entityId: acc.entityId,
            }
      ),
    }));
    setBanner({
      type: 'ok',
      text: `Extrato associado à conta ${acc.institutionName} · ${acc.accountName} (${acc.entityId}).`,
    });
  };

  const handleBindBatchInstitution = (institutionId: string) => {
    if (!activeBatch) return;
    const inst = institutions.find((i) => i.id === institutionId);
    if (!inst) {
      updateActiveBatch((b) => ({
        ...b,
        confirmedInstitutionId: undefined,
      }));
      return;
    }
    const nextBankType =
      inst.category === 'BANCO_FISICO'
        ? 'fisico'
        : inst.category === 'BANCO_DIGITAL'
          ? 'digital'
          : activeBatch.identifiedAccount.bankType || 'desconhecido';
    updateActiveBatch((b) => ({
      ...b,
      confirmedInstitutionId: inst.id,
      identifiedAccount: {
        ...b.identifiedAccount,
        institutionId: inst.id,
        bankName: inst.commercialName,
        bankCode: inst.code || b.identifiedAccount.bankCode,
        bankType: nextBankType,
        institutionCategory: inst.category,
        detectionConfidence: 'alta',
      },
    }));
    setBanner({
      type: 'ok',
      text: `Instituição ajustada manualmente para ${inst.commercialName}.`,
    });
  };

  const handleBindBatchCard = (cardId: string) => {
    const card = creditCards.find((c) => c.id === cardId);
    if (!card || !activeBatch) return;
    updateActiveBatch((b) => ({
      ...b,
      confirmedCardId: card.id,
      confirmedEntityId: card.entityId,
      identifiedAccount: {
        ...b.identifiedAccount,
        matchedCardId: card.id,
        holderNature: card.entityId,
        requiresConfirmation: false,
      },
      movements: b.movements.map((m) =>
        m.reviewStatus === 'INTEGRADO'
          ? m
          : {
              ...m,
              targetCardId: card.id,
              entityId: card.entityId,
            }
      ),
    }));
  };

  const handleConfirmCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch || !newAccName.trim()) return;
    const inst = institutions.find((i) => i.id === activeBatch.identifiedAccount.institutionId);
    const cat: InstitutionCategory =
      inst?.category || activeBatch.identifiedAccount.institutionCategory || 'BANCO_DIGITAL';

    const created = onCreateBankAccount(
      {
        entityId: newAccEntity,
        institutionName: inst?.commercialName || activeBatch.identifiedAccount.bankName || 'Banco',
        accountName: newAccName.trim(),
        accountType:
          cat === 'CORRETORA_NACIONAL' || cat === 'CORRETORA_INTERNACIONAL'
            ? 'investment'
            : cat === 'CARTEIRA_DIGITAL' || cat === 'EXCHANGE'
              ? 'checking'
              : newAccEntity === 'CNPJ'
                ? 'business'
                : 'checking',
        openingBalance: 0,
        openingBalanceCents: toCents(0),
        balance: 0,
        balanceCents: toCents(0),
        archived: false,
      },
      {
        targetKind: 'ACCOUNT',
        institutionId: inst?.id || '',
        institutionCategory: cat,
        holderEntity: newAccEntity,
        agency: activeBatch.identifiedAccount.agency,
        maskedAccountNumber: activeBatch.identifiedAccount.maskedAccountNumber,
        maskedHolderDoc: activeBatch.identifiedAccount.maskedDocument,
        currency: activeBatch.identifiedAccount.currency || 'BRL',
        status: 'ACTIVE',
        balanceStatus: 'UPDATED',
      }
    );

    setCreateAccountPromptOpen(false);
    setNewAccName('');
    handleBindBatchAccount(created.id);
  };

  const handleUpdateMovementStatus = (
    movId: string,
    reviewStatus: ExtractedMovement['reviewStatus']
  ) => {
    if (!activeBatch) return;
    const nowIso = new Date().toISOString();
    updateActiveBatch((b) => ({
      ...b,
      movements: b.movements.map((m) =>
        m.id === movId
          ? {
              ...m,
              reviewStatus,
              approvedAt: reviewStatus === 'APROVADO' ? nowIso : m.approvedAt,
              approvedBy: reviewStatus === 'APROVADO' ? 'Usuário' : m.approvedBy,
              lineage: [
                ...m.lineage,
                {
                  timestamp: nowIso,
                  stage: 'REVISÃO',
                  actor: 'USUARIO',
                  detail: `Status alterado manualmente para ${reviewStatus}.`,
                },
              ],
            }
          : m
      ),
    }));
  };

  const handleBatchApproveSelected = () => {
    if (!activeBatch || selectedMovementIds.size === 0) return;
    const nowIso = new Date().toISOString();
    updateActiveBatch((b) => ({
      ...b,
      movements: b.movements.map((m) =>
        selectedMovementIds.has(m.id) && m.reviewStatus !== 'INTEGRADO'
          ? {
              ...m,
              reviewStatus: 'APROVADO',
              approvedAt: nowIso,
              approvedBy: 'Usuário',
              lineage: [
                ...m.lineage,
                {
                  timestamp: nowIso,
                  stage: 'APROVAÇÃO EM LOTE',
                  actor: 'USUARIO',
                  detail: 'Marcado manualmente como APROVADO em lote.',
                },
              ],
            }
          : m
      ),
    }));
    setSelectedMovementIds(new Set());
    setBanner({
      type: 'ok',
      text: 'Itens marcados como APROVADOS. Clique em "Efetivar Aprovados no Sistema" para gravar nos módulos financeiros.',
    });
  };

  const handleIntegrateApproved = () => {
    if (!activeBatch) return;
    const result = commitApprovedExtractionMovements({
      batch: activeBatch,
      accounts,
      transactions,
      assets,
      creditCards,
      approvedByLabel: 'Usuário',
    });

    onCommitIntegration(result);

    if (result.failedCount > 0) {
      setBanner({
        type: 'warn',
        text: `${result.integratedCount} integrado(s) com sucesso; ${result.failedCount} erro(s) para revisão (${result.errors[0]}). Reprocessamento seguro não duplica os já gravados.`,
      });
    } else if (result.integratedCount > 0 || result.skippedDuplicateCount > 0) {
      setBanner({
        type: 'ok',
        text: `Integração concluída: ${result.integratedCount} movimentação(ões) efetivada(s), ${result.skippedDuplicateCount} idempotente(s) preservada(s).`,
      });
    } else {
      setBanner({
        type: 'warn',
        text: 'Nenhum item com status APROVADO aguardando efetivação.',
      });
    }
  };

  const handleSaveEditedMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement || !activeBatch) return;
    const nowIso = new Date().toISOString();

    if (saveRuleChecked && saveRuleKeyword.trim().length >= 2) {
      onSaveExtractionRule({
        id: generateEntityId('erule'),
        keyword: saveRuleKeyword.trim(),
        institutionId: activeBatch.confirmedInstitutionId || activeBatch.identifiedAccount.institutionId,
        entityId: editingMovement.entityId,
        movementType: editingMovement.movementType,
        category: editingMovement.suggestedCategory,
        counterparty: editingMovement.counterparty,
        createdAt: nowIso,
      });
    }

    updateActiveBatch((b) => ({
      ...b,
      movements: b.movements.map((m) =>
        m.id === editingMovement.id
          ? {
              ...editingMovement,
              reviewStatus:
                editingMovement.reviewStatus === 'PRECISA_IDENTIFICACAO'
                  ? 'PENDENTE'
                  : editingMovement.reviewStatus,
              doubtReason: undefined,
              manualCorrections: [...m.manualCorrections, `Editado manualmente em ${nowIso}`],
              lineage: [
                ...m.lineage,
                {
                  timestamp: nowIso,
                  stage: 'EDIÇÃO MANUAL',
                  actor: 'USUARIO',
                  detail: `Classificado como ${editingMovement.movementType} · "${editingMovement.suggestedCategory}".`,
                },
              ],
            }
          : m
      ),
    }));

    setEditingMovement(null);
    setSaveRuleChecked(false);
    setSaveRuleKeyword('');
  };

  const openManualMovementModal = () => {
    setManualDraft({
      description: '',
      date: activeBatch?.periodStart || todayLocal(),
      amountStr: '',
      currency: activeBatch?.identifiedAccount.currency || 'BRL',
      direction: 'EXPENSE',
      movementType: 'DESPESA',
      suggestedCategory: 'Outros',
      entityId: activeBatch?.confirmedEntityId || activeBatch?.identifiedAccount.holderNature || '',
      counterparty: '',
      bankTransactionId: '',
    });
    setManualModalOpen(true);
  };

  const handleCreateManualMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBatch) return;
    const parsedVal = parseCurrencyInput(manualDraft.amountStr);
    if (!Number.isFinite(parsedVal) || parsedVal <= 0 || !manualDraft.description.trim()) {
      setBanner({
        type: 'err',
        text: 'Informe uma descrição e um valor maior que zero para inserir manualmente.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const absCents = toCents(Math.abs(parsedVal)) as MoneyCents;
    const desc = manualDraft.description.trim();
    const normDesc = normalizeDescription(desc);
    const resolvedEntity = (manualDraft.entityId || activeBatch.confirmedEntityId || undefined) as
      | EntityId
      | undefined;

    const idempotencyKey = manualDraft.bankTransactionId.trim()
      ? `ext-${activeBatch.confirmedInstitutionId || 'manual'}-${manualDraft.bankTransactionId.trim()}`
      : `ext-${computeFastHash(
          `${activeBatch.contentFingerprint}|manual|${activeBatch.movements.length}|${manualDraft.date}|${absCents}|${manualDraft.direction}|${normDesc}`
        )}`;

    const draftMov: ExtractedMovement = {
      id: generateEntityId('mov'),
      batchId: activeBatch.id,
      bankTransactionId: manualDraft.bankTransactionId.trim() || undefined,
      date: manualDraft.date || todayLocal(),
      originalDescription: desc,
      normalizedDescription: normDesc,
      counterparty: manualDraft.counterparty.trim() || undefined,
      amountCents: absCents,
      amount: fromCents(absCents),
      direction: manualDraft.direction,
      currency: manualDraft.currency || 'BRL',
      movementType: manualDraft.movementType,
      operationType:
        manualDraft.movementType === 'TRANSFERENCIA'
          ? 'TRANSFERENCIA_PROPRIA'
          : manualDraft.movementType === 'PIX_ENVIADO' || manualDraft.movementType === 'PIX_RECEBIDO'
            ? 'PIX'
            : manualDraft.movementType === 'FATURA_CARTAO'
              ? 'CARTAO'
              : manualDraft.movementType === 'TARIFA' || manualDraft.movementType === 'IMPOSTO'
                ? 'TARIFA'
                : 'OUTRO',
      suggestedCategory: manualDraft.suggestedCategory || 'Outros',
      entityId: resolvedEntity,
      targetAccountId: activeBatch.confirmedAccountId,
      targetCardId: activeBatch.confirmedCardId,
      confidence: 1,
      duplicateStatus: 'INEDITA',
      reviewStatus: 'PENDENTE',
      rawRowSnapshot: { source: 'MANUAL_CONFERENCE', date: manualDraft.date, amount: parsedVal },
      manualCorrections: [`Inserido manualmente em ${nowIso}`],
      idempotencyKey,
      lineage: [
        {
          timestamp: nowIso,
          stage: 'INSERÇÃO MANUAL',
          actor: 'USUARIO',
          detail: `Lançamento inserido manualmente durante conferência de ${activeBatch.fileName}.`,
        },
      ],
    };

    const dup = evaluateMovementDuplicates({
      movement: draftMov,
      existingTransactions: transactions,
      previousBatches: batches.filter((b) => b.id !== activeBatch.id),
      batchSiblings: activeBatch.movements,
      accounts,
    });

    const finalMov: ExtractedMovement = {
      ...draftMov,
      duplicateStatus: dup.classification,
      duplicateMatchTxId: dup.matchTxId,
      duplicateMatchBatchId: dup.matchBatchId,
      duplicateMatchReason: dup.matchReason,
      transferCounterpartAccountId: dup.transferCounterpartAccountId,
    };

    updateActiveBatch((b) => {
      const nextMovements = [...b.movements, finalMov];
      return {
        ...b,
        status: b.status === 'ERRO' ? 'AGUARDANDO_REVISAO' : b.status,
        movements: nextMovements,
        balanceSummary: computeStatementBalanceSummary({
          movements: nextMovements,
          openingBalanceCents: b.balanceSummary.openingBalanceCents,
          reportedEndingBalanceCents: b.balanceSummary.reportedEndingBalanceCents,
          availableBalanceCents: b.balanceSummary.availableBalanceCents,
          blockedBalanceCents: b.balanceSummary.blockedBalanceCents,
        }),
      };
    });

    setManualModalOpen(false);
    setBanner({
      type: 'ok',
      text: 'Lançamento adicionado ao lote para conferência. Aprove quando estiver pronto para efetivar.',
    });
  };

  const needsIdentificationItems = useMemo(
    () =>
      (activeBatch?.movements || []).filter(
        (m) => m.reviewStatus === 'PRECISA_IDENTIFICACAO'
      ),
    [activeBatch]
  );

  const filteredMovements = useMemo(() => {
    if (!activeBatch) return [];
    const q = searchTerm.trim().toLowerCase();
    return activeBatch.movements.filter((m) => {
      const okQ =
        !q ||
        m.originalDescription.toLowerCase().includes(q) ||
        (m.counterparty || '').toLowerCase().includes(q) ||
        (m.bankTransactionId || '').toLowerCase().includes(q);
      const okStatus = statusFilter === 'ALL' || m.reviewStatus === statusFilter;
      const okType = typeFilter === 'ALL' || m.movementType === typeFilter;
      const okCur = currencyFilter === 'ALL' || m.currency === currencyFilter;
      return okQ && okStatus && okType && okCur;
    });
  }, [activeBatch, searchTerm, statusFilter, typeFilter, currencyFilter]);

  const approvedReadyCount = useMemo(
    () =>
      (activeBatch?.movements || []).filter((m) => m.reviewStatus === 'APROVADO').length,
    [activeBatch]
  );

  const quickCards = [
    {
      title: 'Novo extrato',
      desc: 'Enviar OFX, CSV, XLSX, PDF ou foto',
      icon: Upload,
      primary: true,
      onClick: () => {
        setSubTab('overview');
        inputRef.current?.click();
      },
    },
    {
      title: 'Contas e Instituições',
      desc: 'Bancos, corretoras, exchanges e cartões',
      icon: Landmark,
      primary: false,
      onClick: () => setSubTab('institutions'),
    },
    {
      title: 'Conferência & Aprovação',
      desc: `${overviewStats.pending + overviewStats.unknown} pendente(s) · ${overviewStats.approved} aprovado(s)`,
      icon: ClipboardCheck,
      primary: false,
      onClick: () => setSubTab('review'),
    },
    {
      title: 'Consolidação Financeira',
      desc: 'Individual, por categoria ou consolidado',
      icon: Layers,
      primary: false,
      onClick: () => setSubTab('consolidation'),
    },
  ];

  const handleOpenOriginalFile = async (batch: ExtractionBatch) => {
    if (!batch.fileId) return;
    const rec = await fileStorageService.getFile(batch.fileId);
    if (!rec) {
      setBanner({
        type: 'warn',
        text: 'Arquivo original disponível apenas no dispositivo onde a importação foi realizada.',
      });
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = rec.fileName || batch.fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Hidden File Input */}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={(e) => {
          void handleSelectFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* Module Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#061E3E] dark:bg-[#11185A] border border-white/10 text-white grid place-items-center shrink-0">
            <FileSpreadsheet size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#0F172A] dark:text-white truncate">
              Central de Extrações Financeiras
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400">
              Extração isolada na origem, aprovação manual obrigatória, rastreabilidade e consolidação transparente.
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-semibold flex items-start gap-2.5 ${
            banner.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : banner.type === 'warn'
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
          }`}
        >
          {banner.type === 'ok' ? (
            <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
          ) : banner.type === 'warn' ? (
            <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={17} className="shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs underline cursor-pointer shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs (Responsive wrapping without horizontal page overflow) */}
      <nav
        aria-label="Seções da Central de Extrações"
        className="flex flex-wrap gap-1.5 bg-white dark:bg-[#11185A] border border-[#E2E8F0] dark:border-white/10 p-1.5 rounded-2xl"
      >
        {(
          [
            { id: 'overview', label: 'Visão geral & Importar', icon: Upload },
            {
              id: 'review',
              label: `Revisão (${overviewStats.pending + overviewStats.unknown + overviewStats.approved})`,
              icon: ClipboardCheck,
            },
            { id: 'reconcile', label: 'Conciliação', icon: Scale },
            { id: 'institutions', label: 'Instituições e Contas', icon: Building2 },
            { id: 'consolidation', label: 'Consolidação', icon: Layers },
            { id: 'history', label: `Histórico & Regras (${batches.length})`, icon: History },
          ] as Array<{ id: ExtractionsSubTab; label: string; icon: React.ComponentType<{ size?: number }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-10 px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                active
                  ? 'bg-[#061E3E] text-white dark:bg-[#059669]'
                  : 'text-[#64748B] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ==================== TAB 1: VISÃO GERAL & IMPORTAÇÃO ==================== */}
      {subTab === 'overview' && (
        <div className="space-y-5">
          {/* 4 Quick Action Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.title}
                  type="button"
                  onClick={card.onClick}
                  className={`min-w-0 flex items-center gap-3 p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    card.primary
                      ? 'bg-[#061E3E] border-[#061E3E] dark:bg-[#11185A] dark:border-white/20 text-white hover:bg-[#0F172A]'
                      : 'bg-white dark:bg-[#11185A] border-[#E2E8F0] dark:border-white/10 text-[#0F172A] dark:text-white hover:border-[#059669]'
                  }`}
                >
                  <span className="shrink-0">
                    <Icon size={22} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-bold truncate">{card.title}</strong>
                    <small
                      className={`block text-[11px] truncate ${
                        card.primary ? 'text-blue-100' : 'text-[#64748B] dark:text-slate-400'
                      }`}
                    >
                      {card.desc}
                    </small>
                  </span>
                  <ArrowRight size={16} className="shrink-0" />
                </button>
              );
            })}
          </section>

          {/* 8 Overview KPIs */}
          <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[
              { label: 'Arquivos', value: overviewStats.totalFiles, tone: 'text-[#0F172A] dark:text-white' },
              { label: 'Identificadas', value: overviewStats.identified, tone: 'text-[#0F172A] dark:text-blue-300' },
              { label: 'Pendentes', value: overviewStats.pending, tone: 'text-amber-700 dark:text-amber-300' },
              { label: 'Aprovadas', value: overviewStats.approved, tone: 'text-[#059669] dark:text-[#10B981]' },
              { label: 'Integradas', value: overviewStats.integrated, tone: 'text-emerald-700 dark:text-emerald-300' },
              { label: 'Duplicidades', value: overviewStats.duplicates, tone: 'text-amber-700 dark:text-amber-400' },
              { label: 'Não reconhec.', value: overviewStats.unknown, tone: 'text-purple-700 dark:text-purple-300' },
              { label: 'Erros', value: overviewStats.errors, tone: 'text-[#DC3545]' },
            ].map((k) => (
              <div
                key={k.label}
                className="bg-white dark:bg-[#11185A] border border-[#E2E8F0] dark:border-white/10 rounded-xl p-3"
              >
                <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wide truncate">
                  {k.label}
                </span>
                <strong className={`font-money block text-lg font-extrabold tabular-nums mt-0.5 ${k.tone}`}>
                  {k.value}
                </strong>
              </div>
            ))}
          </section>

          {/* Upload Zone + 7-Stage Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="sf-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                    Importar extrato ou documento financeiro
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Processamento local prioritário e identificação automática do banco (Físico/Digital).
                  </p>
                </div>
                <ShieldCheck size={20} className="text-[#059669] dark:text-[#10B981] shrink-0" />
              </div>

              <button
                type="button"
                disabled={processing}
                onClick={() => inputRef.current?.click()}
                className="w-full min-h-36 p-5 border-2 border-dashed border-[#CBD5E1] dark:border-white/20 hover:border-[#059669] rounded-2xl bg-[#F8FAFC] dark:bg-white/5 flex flex-col items-center justify-center gap-2 text-[#0F172A] dark:text-white cursor-pointer transition-colors"
              >
                <Upload size={28} />
                <strong className="text-sm break-all">
                  {selectedFileMeta
                    ? selectedFileMeta.name
                    : 'Selecionar arquivo (OFX, CSV, XLSX, PDF, XML, JSON ou foto)'}
                </strong>
                <span className="text-xs text-[#64748B] dark:text-slate-400">
                  {selectedFileMeta
                    ? `${(selectedFileMeta.size / 1024).toFixed(1)} KB`
                    : 'Máximo 15 MB por arquivo'}
                </span>
              </button>

              {activeBatch && (
                <div className="p-3 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-bold text-[#0F172A] dark:text-white truncate">
                      Banco identificado: {activeBatch.identifiedAccount.bankName || 'Não identificado'}
                      {activeBatch.identifiedAccount.bankCode ? ` (${activeBatch.identifiedAccount.bankCode})` : ''}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 flex flex-wrap items-center gap-2">
                      {activeBatch.identifiedAccount.bankIspb && (
                        <span>ISPB: {activeBatch.identifiedAccount.bankIspb}</span>
                      )}
                      {activeBatch.identifiedAccount.detectionConfidence && (
                        <span>Confiança: {activeBatch.identifiedAccount.detectionConfidence}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeBatch.identifiedAccount.bankType === 'fisico' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase bg-slate-100 text-[#0F172A] border-slate-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-800">
                        <Landmark size={11} /> Banco Físico
                      </span>
                    )}
                    {activeBatch.identifiedAccount.bankType === 'digital' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-800">
                        <Smartphone size={11} /> Banco Digital
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setSubTab('review')}
                      className="px-2.5 py-1 rounded-lg bg-[#059669] text-white font-bold cursor-pointer"
                    >
                      Revisar
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-[#0F172A] dark:text-slate-200">
                <span className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-white/10 inline-flex items-center gap-1">
                  <FileSpreadsheet size={13} /> OFX (Prioritário)
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-white/10 inline-flex items-center gap-1">
                  <FileSpreadsheet size={13} /> CSV / XLSX
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-white/10 inline-flex items-center gap-1">
                  <FileText size={13} /> PDF / XML / JSON
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] dark:bg-white/10 inline-flex items-center gap-1">
                  <ImageIcon size={13} /> Imagem OCR
                </span>
              </div>

              {/* Explicit OCR Consent Checkbox (Privacy Gate) */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 space-y-2 text-xs">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ocrAuthorized}
                    onChange={(e) => setOcrAuthorized(e.target.checked)}
                    className="accent-[#059669] mt-0.5"
                  />
                  <span className="text-slate-700 dark:text-slate-200 leading-snug">
                    Autorizar leitura inteligente OCR externa apenas para PDFs digitalizados ou fotografias de extratos (arquivos OFX, CSV, XLSX, XML e JSON são lidos 100% no dispositivo).
                  </span>
                </label>

                {(activeBatch?.format === 'IMAGE' || activeBatch?.format === 'PDF') &&
                  activeBatch.movements.length === 0 &&
                  (lastFileRef || activeBatch.fileId) && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => void handleRunOcrOnActiveBatch()}
                      className="min-h-9 px-3 rounded-lg bg-[#061E3E] dark:bg-[#059669] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles size={13} /> Executar OCR autorizado neste documento
                    </button>
                  )}
              </div>

              {processing && (
                <button
                  type="button"
                  onClick={handleCancelProcessing}
                  className="w-full min-h-10 rounded-xl border border-red-300 text-red-700 dark:text-red-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ban size={14} /> Cancelar processamento
                </button>
              )}
            </section>

            {/* 7-Stage Pipeline Status */}
            <section className="sf-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-[#0F172A] dark:text-white">
                    Fluxo de processamento
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Camada A isolada — nenhuma gravação definitiva até sua aprovação.
                  </p>
                </div>
                <ScanSearch size={20} className="text-[#0F172A] dark:text-slate-300 shrink-0" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PIPELINE_STAGES.map((st, idx) => {
                  const effectiveStage: ExtractionStage = activeBatch?.stage || currentStage;
                  const effectiveIdx = PIPELINE_STAGES.findIndex((p) => p.id === effectiveStage);
                  const completed = effectiveIdx > idx || activeBatch?.status === 'CONCLUIDO';
                  const current = effectiveIdx === idx && activeBatch?.status !== 'CONCLUIDO';
                  return (
                    <div
                      key={st.id}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs ${
                        current
                          ? 'border-[#061E3E] bg-[#061E3E]/5 dark:bg-blue-950/30 dark:border-blue-700'
                          : completed
                            ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5'
                      }`}
                    >
                      {completed ? (
                        <CheckCircle2 size={16} className="text-[#059669] dark:text-[#10B981] shrink-0 mt-0.5" />
                      ) : (
                        <Circle
                          size={16}
                          className={`shrink-0 mt-0.5 ${current ? 'text-[#0F172A] dark:text-blue-400' : 'text-slate-400'}`}
                        />
                      )}
                      <div>
                        <strong className="block font-bold text-slate-800 dark:text-white">
                          {idx + 1}. {st.title}
                        </strong>
                        {current && <small className="text-[#059669] dark:text-[#10B981] font-semibold">Etapa atual</small>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                <ShieldCheck size={16} className="shrink-0" />
                <span>
                  Todas as movimentações passam por conferência e aprovação manual antes de atualizar contas, faturas e patrimônio.
                </span>
              </div>
            </section>
          </div>

          {/* Interactive CSV / XLSX Mapper & Sheet Selector */}
          {lastParsePreview?.tabularPreview && activeBatch && (
            <section className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-sm text-[#061E3E] dark:text-white">
                  Mapeamento & Prévia da Planilha / CSV
                </h3>
                {lastParsePreview.tabularPreview.sheetNames &&
                  lastParsePreview.tabularPreview.sheetNames.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-500">Aba:</span>
                      <select
                        value={lastParsePreview.tabularPreview.selectedSheet || ''}
                        onChange={(e) => handleReapplyTabularParse({ sheetName: e.target.value })}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800"
                      >
                        {lastParsePreview.tabularPreview.sheetNames.map((sn) => (
                          <option key={sn} value={sn}>
                            {sn}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
              </div>

              {lastParsePreview.tabularPreview.detectedMapping && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Coluna Data
                    </label>
                    <select
                      value={lastParsePreview.tabularPreview.detectedMapping.dateCol}
                      onChange={(e) =>
                        handleReapplyTabularParse({
                          mapping: {
                            ...lastParsePreview.tabularPreview!.detectedMapping!,
                            dateCol: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800"
                    >
                      {lastParsePreview.tabularPreview.headers.map((h, idx) => (
                        <option key={idx} value={idx}>
                          {idx + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Coluna Descrição
                    </label>
                    <select
                      value={lastParsePreview.tabularPreview.detectedMapping.descriptionCol}
                      onChange={(e) =>
                        handleReapplyTabularParse({
                          mapping: {
                            ...lastParsePreview.tabularPreview!.detectedMapping!,
                            descriptionCol: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800"
                    >
                      {lastParsePreview.tabularPreview.headers.map((h, idx) => (
                        <option key={idx} value={idx}>
                          {idx + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Coluna Valor
                    </label>
                    <select
                      value={lastParsePreview.tabularPreview.detectedMapping.amountCol}
                      onChange={(e) =>
                        handleReapplyTabularParse({
                          mapping: {
                            ...lastParsePreview.tabularPreview!.detectedMapping!,
                            amountCol: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800"
                    >
                      {lastParsePreview.tabularPreview.headers.map((h, idx) => (
                        <option key={idx} value={idx}>
                          {idx + 1}: {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Separador CSV
                    </label>
                    <select
                      value={lastParsePreview.tabularPreview.detectedMapping.delimiter}
                      onChange={(e) =>
                        handleReapplyTabularParse({
                          mapping: {
                            ...lastParsePreview.tabularPreview!.detectedMapping!,
                            delimiter: e.target.value as ';' | ',' | '\t',
                          },
                        })
                      }
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800"
                    >
                      <option value=";">Ponto e vírgula (;)</option>
                      <option value=",">Vírgula (,)</option>
                      <option value={'\t'}>Tabulação</option>
                    </select>
                  </div>
                </div>
              )}

              {lastParsePreview.tabularPreview.sampleRows.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        {lastParsePreview.tabularPreview.headers.map((h, i) => (
                          <th key={i} className="px-2.5 py-1.5 font-bold text-slate-600 dark:text-slate-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {lastParsePreview.tabularPreview.sampleRows.slice(0, 4).map((r, ri) => (
                        <tr key={ri}>
                          {r.map((cell, ci) => (
                            <td key={ci} className="px-2.5 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Visual Side-by-Side PDF or Image Preview when uploaded/selected */}
          {sideBySidePreviewUrl &&
            activeBatch &&
            (activeBatch.format === 'IMAGE' || activeBatch.format === 'PDF') && (
              <section className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                  {activeBatch.format === 'IMAGE' ? (
                    <img
                      src={sideBySidePreviewUrl}
                      alt="Prévia do documento enviado"
                      className="max-h-72 object-contain"
                    />
                  ) : (
                    <iframe
                      title={`Prévia PDF — ${activeBatch.fileName}`}
                      src={sideBySidePreviewUrl}
                      className="w-full h-80 border-0 bg-white"
                    />
                  )}
                </div>
                <div className="space-y-3 text-xs">
                  <h4 className="font-bold text-sm text-[#061E3E] dark:text-white">
                    Conferência visual lado a lado ({activeBatch.format})
                  </h4>
                  <p className="text-slate-500 dark:text-slate-400">
                    Compare o documento original com os itens extraídos na aba <strong>Revisão</strong> ou adicione lançamentos manualmente enquanto visualiza o extrato.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSubTab('review')}
                      className="min-h-10 px-4 rounded-xl bg-[#061E3E] text-white font-bold cursor-pointer"
                    >
                      Ir para Revisão ({activeBatch.movements.length})
                    </button>
                    <a
                      href={sideBySidePreviewUrl}
                      download={activeBatch.fileName}
                      className="min-h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold inline-flex items-center"
                    >
                      Baixar original
                    </a>
                  </div>
                </div>
              </section>
            )}
        </div>
      )}

      {/* ==================== TAB 2: REVISÃO, PRECISA DE IDENTIFICAÇÃO & APROVAÇÃO ==================== */}
      {subTab === 'review' && (
        <div className="space-y-5">
          {!activeBatch ? (
            <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhuma extração selecionada. Importe um arquivo para iniciar a conferência.
              </p>
              <button
                type="button"
                onClick={() => setSubTab('overview')}
                className="min-h-10 px-4 rounded-xl bg-[#061E3E] text-white text-xs font-bold cursor-pointer"
              >
                Importar arquivo
              </button>
            </div>
          ) : (
            <>
              {/* Batch Selector & Account Confirmation Banner */}
              <div className="sf-card p-4 sm:p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-extrabold text-[#0F172A] dark:text-white truncate">
                        {activeBatch.fileName}
                      </span>
                      {activeBatch.identifiedAccount.bankType === 'fisico' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase bg-slate-100 text-[#0F172A] border-slate-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-800 shrink-0">
                          <Landmark size={11} /> Banco Físico
                        </span>
                      )}
                      {activeBatch.identifiedAccount.bankType === 'digital' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-800 shrink-0">
                          <Smartphone size={11} /> Banco Digital
                        </span>
                      )}
                      {activeBatch.identifiedAccount.institutionCategory &&
                        activeBatch.identifiedAccount.bankType !== 'fisico' &&
                        activeBatch.identifiedAccount.bankType !== 'digital' && (
                          <InstitutionCategoryBadge
                            category={activeBatch.identifiedAccount.institutionCategory}
                            compact
                          />
                        )}
                      {activeBatch.identifiedAccount.detectionConfidence && (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            activeBatch.identifiedAccount.detectionConfidence === 'alta'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : activeBatch.identifiedAccount.detectionConfidence === 'media'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                          }`}
                        >
                          Confiança {activeBatch.identifiedAccount.detectionConfidence}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[10px] font-bold">
                        {activeBatch.format} · {activeBatch.parseSource}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B] dark:text-slate-300">
                      {activeBatch.identifiedAccount.bankName && (
                        <span>
                          Banco detectado:{' '}
                          <strong className="text-[#0F172A] dark:text-white">
                            {activeBatch.identifiedAccount.bankName}
                          </strong>
                          {activeBatch.identifiedAccount.bankCode
                            ? ` (Cód. ${activeBatch.identifiedAccount.bankCode})`
                            : ''}
                        </span>
                      )}
                      {activeBatch.identifiedAccount.bankIspb && (
                        <span className="font-mono text-[11px]">
                          ISPB {activeBatch.identifiedAccount.bankIspb}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-slate-400">
                      {activeBatch.identifiedAccount.confirmationReason ||
                        'Confirme a instituição, conta de destino e titularidade CPF/CNPJ antes de aprovar.'}
                    </p>
                  </div>

                  {batches.length > 1 && (
                    <select
                      aria-label="Selecionar lote de extração"
                      value={activeBatch.id}
                      onChange={(e) => {
                        setActiveBatchId(e.target.value);
                        setSelectedMovementIds(new Set());
                      }}
                      className="border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 text-xs font-semibold bg-white dark:bg-[#0B1252] min-h-10"
                    >
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.fileName} ({b.movements.length} itens · {b.status})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Institution / Account / Card / Entity Binding Row (Allows manual override, never auto-creates account) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2 border-t border-slate-100 dark:border-white/10">
                  <div>
                    <label className="block font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                      Instituição (pré-preenchida / ajuste manual)
                    </label>
                    <select
                      aria-label="Instituição identificada do extrato"
                      value={
                        activeBatch.confirmedInstitutionId ||
                        activeBatch.identifiedAccount.institutionId ||
                        ''
                      }
                      onChange={(e) => handleBindBatchInstitution(e.target.value)}
                      className="w-full border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 bg-white dark:bg-[#0B1252] min-h-10"
                    >
                      <option value="">Selecionar instituição...</option>
                      {institutions.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.commercialName}
                          {inst.code ? ` (${inst.code})` : ''} ·{' '}
                          {inst.category === 'BANCO_FISICO'
                            ? 'Físico'
                            : inst.category === 'BANCO_DIGITAL'
                              ? 'Digital'
                              : inst.category}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                      Conta vinculada ({activeBatch.identifiedAccount.maskedAccountNumber || 'selecione'})
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={activeBatch.confirmedAccountId || ''}
                        onChange={(e) => handleBindBatchAccount(e.target.value)}
                        className="flex-1 border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 bg-white dark:bg-[#0B1252] min-h-10"
                      >
                        <option value="">Selecionar conta cadastrada...</option>
                        {activeAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.institutionName} · {a.accountName} ({a.entityId})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setNewAccName(activeBatch.identifiedAccount.accountType || 'Conta Extrato');
                          setNewAccEntity(activeBatch.confirmedEntityId || 'CPF');
                          setCreateAccountPromptOpen(true);
                        }}
                        className="px-2.5 rounded-xl border border-[#059669] text-[#059669] dark:text-[#10B981] font-bold hover:bg-[#059669]/10 cursor-pointer shrink-0"
                        title="Cadastrar nova conta com confirmação"
                      >
                        + Nova
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                      Ou Cartão de Crédito (quando fatura)
                    </label>
                    <select
                      value={activeBatch.confirmedCardId || ''}
                      onChange={(e) => handleBindBatchCard(e.target.value)}
                      className="w-full border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 bg-white dark:bg-[#0B1252] min-h-10"
                    >
                      <option value="">Nenhum cartão selecionado</option>
                      {creditCards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cardName} ({c.institutionName} •••• {c.last4}) · {c.entityId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-[#64748B] dark:text-slate-400 mb-1">
                      Titularidade confirmada ({activeBatch.identifiedAccount.maskedDocument || 'Doc. não informado'})
                    </label>
                    <select
                      value={activeBatch.confirmedEntityId || ''}
                      onChange={(e) => {
                        const ent = e.target.value as EntityId;
                        updateActiveBatch((b) => ({
                          ...b,
                          confirmedEntityId: ent,
                          movements: b.movements.map((m) =>
                            m.reviewStatus === 'INTEGRADO' ? m : { ...m, entityId: ent }
                          ),
                        }));
                      }}
                      className="w-full border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 bg-white dark:bg-[#0B1252] min-h-10"
                    >
                      <option value="">Confirmar CPF ou CNPJ...</option>
                      <option value="CPF">Pessoa Física · CPF</option>
                      <option value="CNPJ">Pessoa Jurídica · CNPJ</option>
                    </select>
                  </div>
                </div>

                {createAccountPromptOpen && (
                  <form
                    onSubmit={handleConfirmCreateAccount}
                    className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 flex flex-col sm:flex-row gap-2 items-end text-xs"
                  >
                    <div className="flex-1 w-full">
                      <label className="block font-bold mb-1">Nome da nova conta</label>
                      <input
                        type="text"
                        required
                        value={newAccName}
                        onChange={(e) => setNewAccName(e.target.value)}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="w-full sm:w-40">
                      <label className="block font-bold mb-1">Titularidade</label>
                      <select
                        value={newAccEntity}
                        onChange={(e) => setNewAccEntity(e.target.value as EntityId)}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 bg-white dark:bg-slate-800"
                      >
                        <option value="CPF">CPF</option>
                        <option value="CNPJ">CNPJ</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateAccountPromptOpen(false)}
                        className="px-3 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-2 rounded-lg bg-[#059669] text-white font-bold cursor-pointer"
                      >
                        Confirmar cadastro
                      </button>
                    </div>
                  </form>
                )}

                {/* Batch Warnings / OCR Errors with direct recovery actions */}
                {(activeBatch.errors.length > 0 || activeBatch.warnings.length > 0) && (
                  <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2.5 text-xs">
                    <div className="space-y-1 text-amber-900 dark:text-amber-200">
                      {activeBatch.warnings.map((w, idx) => (
                        <div key={`w-${idx}`} className="flex items-start gap-2 font-semibold">
                          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                      {activeBatch.errors.map((errText, idx) => (
                        <div key={`e-${idx}`} className="flex items-start gap-2 text-red-700 dark:text-red-300">
                          <AlertCircle size={15} className="shrink-0 mt-0.5" />
                          <span>Detalhe técnico: {errText}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(activeBatch.format === 'PDF' || activeBatch.format === 'IMAGE') &&
                        (activeBatch.fileId || lastFileRef) && (
                          <button
                            type="button"
                            disabled={processing}
                            onClick={() => void handleRunOcrOnActiveBatch()}
                            className="min-h-9 px-3 rounded-lg bg-[#061E3E] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Sparkles size={13} />{' '}
                            {processing ? 'Processando OCR...' : 'Executar / Reprocessar OCR autorizado'}
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={openManualMovementModal}
                        className="min-h-9 px-3 rounded-lg bg-[#059669] text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={14} /> Inserir lançamento manual
                      </button>
                      {sideBySidePreviewUrl && (
                        <button
                          type="button"
                          onClick={() => setShowSideBySideInReview((v) => !v)}
                          className="min-h-9 px-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#11185A] font-bold text-[#061E3E] dark:text-white cursor-pointer"
                        >
                          {showSideBySideInReview ? 'Ocultar documento ao lado' : 'Ver documento ao lado'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Side-by-Side PDF / Image Conference Viewer inside Review */}
              {sideBySidePreviewUrl &&
                (activeBatch.format === 'PDF' || activeBatch.format === 'IMAGE') &&
                showSideBySideInReview && (
                  <section className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-extrabold text-[#061E3E] dark:text-white flex items-center gap-2">
                        <FileText size={16} /> Conferência visual do documento original ({activeBatch.format})
                      </h3>
                      <div className="flex items-center gap-2 text-xs">
                        <a
                          href={sideBySidePreviewUrl}
                          download={activeBatch.fileName}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200"
                        >
                          Baixar original
                        </a>
                        <button
                          type="button"
                          onClick={() => setShowSideBySideInReview(false)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Recolher prévia
                        </button>
                      </div>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
                      {activeBatch.format === 'IMAGE' ? (
                        <img
                          src={sideBySidePreviewUrl}
                          alt={activeBatch.fileName}
                          className="max-h-[420px] w-full object-contain mx-auto"
                        />
                      ) : (
                        <iframe
                          title={`Conferência PDF — ${activeBatch.fileName}`}
                          src={sideBySidePreviewUrl}
                          className="w-full h-[440px] border-0 bg-white"
                        />
                      )}
                    </div>
                  </section>
                )}

              {/* Dedicated Section: Precisa de Identificação */}
              {needsIdentificationItems.length > 0 && (
                <section className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <HelpCircle size={18} className="shrink-0" />
                    <div>
                      <h3 className="text-sm font-extrabold">
                        Precisa de identificação ({needsIdentificationItems.length})
                      </h3>
                      <p className="text-xs opacity-90">
                        Estes registros não foram classificados com segurança automática. Edite ou identifique manualmente antes de aprovar.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {needsIdentificationItems.map((m) => (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-xl bg-white dark:bg-[#11185A] border border-amber-200 dark:border-amber-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-words">
                            {m.originalDescription}
                          </div>
                          <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                            Motivo da dúvida: {m.doubtReason || 'Baixa confiança na leitura'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatDateBR(m.date)} · Sugestão: {m.suggestedCategory} · Confiança{' '}
                            {Math.round(m.confidence * 100)}%
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                          <span className="text-sm font-extrabold tabular-nums text-[#061E3E] dark:text-white">
                            {hideValues ? '' : m.direction === 'INCOME' ? '+ ' : '− '}
                            {m.currency === 'BRL'
                              ? formatarValor(m.amount, hideValues)
                              : `${m.currency} ${hideValues ? '•••••' : formatCurrencyBRL(m.amount)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMovement(m);
                              setSaveRuleKeyword(m.originalDescription.slice(0, 24));
                            }}
                            className="min-h-9 px-3 rounded-lg bg-[#061E3E] text-white text-xs font-bold cursor-pointer"
                          >
                            Confirmar identificação
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Filters & Batch Actions */}
              <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  <input
                    type="text"
                    placeholder="Buscar descrição, favorecido ou ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 min-h-10"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filtrar por status"
                    className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="PENDENTE">Pendentes</option>
                    <option value="PRECISA_IDENTIFICACAO">Precisa de identificação</option>
                    <option value="APROVADO">Aprovados</option>
                    <option value="DUPLICIDADE">Duplicidade</option>
                    <option value="INTEGRADO">Integrados</option>
                    <option value="IGNORADO">Ignorados</option>
                  </select>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    aria-label="Filtrar por tipo de operação"
                    className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                  >
                    <option value="ALL">Todos os tipos econômicos</option>
                    {ALL_MOVEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {EXTRACTION_MOVEMENT_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={currencyFilter}
                    onChange={(e) => setCurrencyFilter(e.target.value)}
                    aria-label="Filtrar por moeda"
                    className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                  >
                    <option value="ALL">Todas as moedas</option>
                    <option value="BRL">BRL</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const selectable = filteredMovements
                          .filter(
                            (m) =>
                              m.reviewStatus === 'PENDENTE' &&
                              m.duplicateStatus !== 'DUPLICIDADE_CONFIRMADA'
                          )
                          .map((m) => m.id);
                        setSelectedMovementIds(new Set(selectable));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer"
                    >
                      Selecionar inéditos pendentes
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMovementIds(new Set())}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold cursor-pointer"
                    >
                      Limpar seleção
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openManualMovementModal}
                      className="min-h-10 px-3.5 rounded-xl border border-[#061E3E] dark:border-blue-400 text-[#061E3E] dark:text-blue-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={14} /> Inserir manual
                    </button>
                    {sideBySidePreviewUrl && !showSideBySideInReview && (
                      <button
                        type="button"
                        onClick={() => setShowSideBySideInReview(true)}
                        className="min-h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                      >
                        Ver documento
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={selectedMovementIds.size === 0}
                      onClick={handleBatchApproveSelected}
                      className="min-h-10 px-4 rounded-xl bg-[#061E3E] hover:bg-[#0F172A] disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                    >
                      Aprovar selecionados ({selectedMovementIds.size})
                    </button>
                    <button
                      type="button"
                      disabled={approvedReadyCount === 0}
                      onClick={handleIntegrateApproved}
                      className="min-h-10 px-4 rounded-xl bg-[#059669] hover:bg-[#059669]/90 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                    >
                      Efetivar Aprovados no Sistema ({approvedReadyCount})
                    </button>
                  </div>
                </div>
              </div>

              {/* Movements List (Responsive Card Layout for 320px+, Clean Grid on Desktop) */}
              <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {filteredMovements.length === 0 ? (
                  <div className="p-6 text-center space-y-3 text-xs sm:text-sm text-slate-500">
                    <p>
                      {activeBatch.movements.length === 0
                        ? 'Nenhuma movimentação extraída automaticamente neste lote ainda.'
                        : 'Nenhuma movimentação encontrada para os filtros selecionados.'}
                    </p>
                    {activeBatch.movements.length === 0 && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          onClick={openManualMovementModal}
                          className="min-h-10 px-4 rounded-xl bg-[#059669] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus size={14} /> Inserir lançamento manualmente
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  filteredMovements.map((m) => {
                    const isIntegrated = m.reviewStatus === 'INTEGRADO';
                    const isSelected = selectedMovementIds.has(m.id);
                    return (
                      <div
                        key={m.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            disabled={isIntegrated}
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(selectedMovementIds);
                              if (e.target.checked) next.add(m.id);
                              else next.delete(m.id);
                              setSelectedMovementIds(next);
                            }}
                            aria-label={`Selecionar ${m.originalDescription}`}
                            className="w-5 h-5 accent-[#059669] mt-0.5 shrink-0"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-words">
                                {m.originalDescription}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                {EXTRACTION_MOVEMENT_LABELS[m.movementType]}
                              </span>
                              <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                {m.suggestedCategory}
                              </span>
                              {m.reviewStatus === 'INTEGRADO' && (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                                  Integrado
                                </span>
                              )}
                              {m.reviewStatus === 'APROVADO' && (
                                <span className="px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 text-[10px] font-bold">
                                  Aprovado (aguard. efetivar)
                                </span>
                              )}
                              {m.duplicateStatus !== 'INEDITA' && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                                  {m.duplicateStatus.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>{formatDateBR(m.date)}</span>
                              {m.counterparty && <span>Contraparte: {m.counterparty}</span>}
                              <span>Titular: {m.entityId || 'Pendente'}</span>
                              {m.investmentMeta?.indexer && (
                                <span>
                                  Indexador: {m.investmentMeta.indexer}{' '}
                                  {m.investmentMeta.indexerRateLabel || ''}
                                </span>
                              )}
                              {m.cryptoMeta && (
                                <span>
                                  Cripto: {m.cryptoMeta.quantity} {m.cryptoMeta.assetSymbol}{' '}
                                  {m.cryptoMeta.network ? `(${m.cryptoMeta.network})` : ''}
                                </span>
                              )}
                              {m.cardMeta?.installmentTotal && (
                                <span>
                                  Parcela {m.cardMeta.installmentCurrent}/{m.cardMeta.installmentTotal}
                                </span>
                              )}
                              {m.bankTransactionId && (
                                <span className="font-mono">ID: {m.bankTransactionId}</span>
                              )}
                            </div>

                            {m.duplicateMatchReason && (
                              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                                {m.duplicateMatchReason}
                              </div>
                            )}
                            {m.integrationError && (
                              <div className="text-[11px] text-[#DC3545] font-semibold">
                                Erro de integração: {m.integrationError}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 pl-8 md:pl-0 shrink-0">
                          <span
                            className={`text-sm font-extrabold tabular-nums ${
                              m.direction === 'INCOME'
                                ? 'text-[#059669]'
                                : 'text-[#DC3545]'
                            }`}
                          >
                            {hideValues ? '' : m.direction === 'INCOME' ? '+ ' : '− '}
                            {m.currency === 'BRL'
                              ? formatarValor(m.amount, hideValues)
                              : `${m.currency} ${hideValues ? '•••••' : formatCurrencyBRL(m.amount)}`}
                          </span>

                          <div className="flex items-center gap-1">
                            {!isIntegrated && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMovement(m);
                                    setSaveRuleKeyword(m.originalDescription.slice(0, 24));
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMovementStatus(m.id, 'APROVADO')}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#059669] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                  title="Aprovar manualmente"
                                >
                                  <Check size={12} /> Aprovar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateMovementStatus(m.id, 'IGNORADO')}
                                  className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-red-600 text-[11px] font-semibold cursor-pointer"
                                  title="Ignorar movimentação"
                                >
                                  <XCircle size={14} />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setTraceLookup({
                                  movement: m,
                                  batch: activeBatch,
                                  institution: institutions.find(
                                    (i) =>
                                      i.id === activeBatch.confirmedInstitutionId ||
                                      i.id === activeBatch.identifiedAccount.institutionId
                                  ),
                                  accountLabel:
                                    accounts.find((a) => a.id === m.targetAccountId)?.accountName ||
                                    activeBatch.identifiedAccount.bankName ||
                                    'Origem extraída',
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-[#061E3E] dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Eye size={12} /> Rastrear
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 3: CONCILIAÇÃO DE SALDOS & TRANSFERÊNCIAS ==================== */}
      {subTab === 'reconcile' && (
        <div className="space-y-5">
          {!activeBatch ? (
            <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center text-xs sm:text-sm text-slate-500">
              Selecione ou importe um extrato para realizar a conciliação matemática de saldos.
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold text-[#061E3E] dark:text-white">
                      Conciliação Matemática do Extrato — {activeBatch.fileName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Saldo final esperado = saldo inicial + créditos − débitos (aplicações e resgates tratados separadamente).
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const val = Number(manualOpeningStr.replace(',', '.'));
                      if (!Number.isFinite(val)) return;
                      const openingCents = toCents(val) as MoneyCents;
                      updateActiveBatch((b) => ({
                        ...b,
                        balanceSummary: computeStatementBalanceSummary({
                          movements: b.movements,
                          openingBalanceCents: openingCents,
                          reportedEndingBalanceCents: b.balanceSummary.reportedEndingBalanceCents,
                          availableBalanceCents: b.balanceSummary.availableBalanceCents,
                          blockedBalanceCents: b.balanceSummary.blockedBalanceCents,
                        }),
                      }));
                    }}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="text"
                      placeholder="Informar saldo inicial"
                      value={manualOpeningStr}
                      onChange={(e) => setManualOpeningStr(e.target.value)}
                      className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 w-40"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-xl bg-[#061E3E] text-white font-bold cursor-pointer"
                    >
                      Recalcular
                    </button>
                  </form>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    {
                      label: 'Saldo Inicial',
                      val:
                        activeBatch.balanceSummary.openingBalanceCents !== undefined
                          ? formatarValor(fromCents(activeBatch.balanceSummary.openingBalanceCents), hideValues)
                          : 'Não informado',
                    },
                    {
                      label: 'Total de Entradas',
                      val: formatarValor(fromCents(activeBatch.balanceSummary.creditsCents), hideValues),
                    },
                    {
                      label: 'Total de Saídas',
                      val: formatarValor(fromCents(activeBatch.balanceSummary.debitsCents), hideValues),
                    },
                    {
                      label: 'Aplicações (Patrimonial)',
                      val: formatarValor(fromCents(activeBatch.balanceSummary.applicationsCents), hideValues),
                    },
                    {
                      label: 'Resgates (Patrimonial)',
                      val: formatarValor(fromCents(activeBatch.balanceSummary.redemptionsCents), hideValues),
                    },
                    {
                      label: 'Saldo Final Calculado',
                      val:
                        activeBatch.balanceSummary.calculatedEndingBalanceCents !== undefined
                          ? formatarValor(
                              fromCents(activeBatch.balanceSummary.calculatedEndingBalanceCents),
                              hideValues
                            )
                          : 'Aguard. saldo inicial',
                    },
                    {
                      label: 'Saldo Informado Banco',
                      val:
                        activeBatch.balanceSummary.reportedEndingBalanceCents !== undefined
                          ? formatarValor(
                              fromCents(activeBatch.balanceSummary.reportedEndingBalanceCents),
                              hideValues
                            )
                          : 'Não informado',
                    },
                    {
                      label: 'Diferença Encontrada',
                      val:
                        activeBatch.balanceSummary.divergenceCents !== undefined
                          ? formatarValor(fromCents(activeBatch.balanceSummary.divergenceCents), hideValues)
                          : formatarValor(0, hideValues),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/60"
                    >
                      <span className="block text-[10px] font-semibold text-slate-400">
                        {item.label}
                      </span>
                      <strong className="block text-sm font-extrabold tabular-nums text-[#061E3E] dark:text-white mt-0.5">
                        {item.val}
                      </strong>
                    </div>
                  ))}
                </div>

                {activeBatch.balanceSummary.hasDivergence && (
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <div>
                      <strong>Divergência identificada na conciliação:</strong> O sistema preservou o saldo contábil oficial e não forçou correspondência automática. Verifique lançamentos pendentes ou saldo inicial.
                    </div>
                  </div>
                )}

                {activeBatch.balanceSummary.notes.length > 0 && (
                  <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc pl-5">
                    {activeBatch.balanceSummary.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Own-Account Transfers Matching */}
              <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-[#061E3E] dark:text-white flex items-center gap-2">
                  <Link2 size={16} className="text-[#059669]" /> Transferências entre contas próprias
                </h4>
                {activeBatch.movements.filter(
                  (m) =>
                    m.movementType === 'TRANSFERENCIA' ||
                    m.duplicateStatus === 'TRANSFERENCIA_PROPRIA'
                ).length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhuma transferência própria identificada neste lote.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeBatch.movements
                      .filter(
                        (m) =>
                          m.movementType === 'TRANSFERENCIA' ||
                          m.duplicateStatus === 'TRANSFERENCIA_PROPRIA'
                      )
                      .map((m) => (
                        <div
                          key={m.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">
                              {m.originalDescription}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {formatDateBR(m.date)} ·{' '}
                              {m.currency === 'BRL'
                                ? formatarValor(m.amount, hideValues)
                                : `${m.currency} ${hideValues ? '•••••' : formatCurrencyBRL(m.amount)}`}{' '}
                              ·{' '}
                              {m.duplicateMatchReason || 'Aguardando vínculo com conta contraparte'}
                            </div>
                          </div>
                          <select
                            value={m.transferCounterpartAccountId || ''}
                            onChange={(e) => {
                              const cpId = e.target.value;
                              updateActiveBatch((b) => ({
                                ...b,
                                movements: b.movements.map((item) =>
                                  item.id === m.id
                                    ? {
                                        ...item,
                                        movementType: 'TRANSFERENCIA',
                                        operationType: 'TRANSFERENCIA_PROPRIA',
                                        suggestedCategory: 'Transferência',
                                        transferCounterpartAccountId: cpId || undefined,
                                      }
                                    : item
                                ),
                              }));
                            }}
                            className="border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                          >
                            <option value="">Selecionar conta destino/origem...</option>
                            {activeAccounts
                              .filter((a) => a.id !== m.targetAccountId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.institutionName} · {a.accountName} ({a.entityId})
                                </option>
                              ))}
                          </select>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== TAB 4: INSTITUIÇÕES E CONTAS ==================== */}
      {subTab === 'institutions' && (
        <InstitutionsAccountsTab
          institutions={institutions}
          accounts={accounts}
          creditCards={creditCards}
          accountExtensions={accountExtensions}
          onSaveInstitution={onSaveInstitution}
          onSaveAccountExtension={onSaveAccountExtension}
          onCreateBankAccount={onCreateBankAccount}
          onFilterExtractionsByAccount={(accId) => {
            const match = batches.find((b) => b.confirmedAccountId === accId);
            if (match) setActiveBatchId(match.id);
            setSubTab('history');
          }}
        />
      )}

      {/* ==================== TAB 5: CONSOLIDAÇÃO FINANCEIRA ==================== */}
      {subTab === 'consolidation' && (
        <ConsolidationPanelTab
          accounts={accounts}
          creditCards={creditCards}
          assets={assets}
          debts={debts}
          transactions={transactions}
          accountExtensions={accountExtensions}
          institutions={institutions}
          preferences={consolidationPrefs}
          period={period}
          onUpdatePreferences={onUpdateConsolidationPrefs}
          onNavigateModule={onNavigateModule}
        />
      )}

      {/* ==================== TAB 6: HISTÓRICO & REGRAS ==================== */}
      {subTab === 'history' && (
        <div className="space-y-5">
          {/* Extraction Batches History (Preserved even when cancelled) */}
          <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#061E3E] dark:text-white flex items-center gap-2">
                <History size={16} /> Histórico de Lotes de Extração ({batches.length})
              </h3>
            </div>

            {batches.length === 0 ? (
              <div className="p-6 text-center text-xs sm:text-sm text-slate-500">
                Nenhuma extração registrada ainda.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {batches.map((b) => {
                  const approvedCnt = b.movements.filter(
                    (m) => m.reviewStatus === 'APROVADO' || m.reviewStatus === 'INTEGRADO'
                  ).length;
                  const ignoredCnt = b.movements.filter((m) => m.reviewStatus === 'IGNORADO').length;
                  const dupCnt = b.movements.filter(
                    (m) =>
                      m.duplicateStatus === 'DUPLICIDADE_CONFIRMADA' ||
                      m.duplicateStatus === 'POSSIVEL_DUPLICIDADE'
                  ).length;
                  return (
                    <div
                      key={b.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm text-[#061E3E] dark:text-white truncate">
                            {b.fileName}
                          </strong>
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px]">
                            {b.format}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              b.status === 'CONCLUIDO'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : b.status === 'CANCELADO'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                          <span>Importado: {new Date(b.importedAt).toLocaleString('pt-BR')}</span>
                          <span>Total: {b.movements.length}</span>
                          <span>Aprov./Integ.: {approvedCnt}</span>
                          <span>Ignoradas: {ignoredCnt}</span>
                          <span>Duplicadas: {dupCnt}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {b.fileId && (
                          <button
                            type="button"
                            onClick={() => void handleOpenOriginalFile(b)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                          >
                            Baixar original
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setActiveBatchId(b.id);
                            setSubTab('review');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#061E3E] text-white font-bold cursor-pointer"
                        >
                          Abrir revisão
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reusable Classification Rules */}
          <div className="bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#061E3E] dark:text-white flex items-center gap-2">
                <Tag size={16} className="text-[#059669]" /> Regras Aprendidas para Futuras Importações
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Regras criam sugestões explícitas considerando instituição, padrão e titularidade CPF/CNPJ — nunca aprovam automaticamente.
              </p>
            </div>

            {onAddCategoryRule && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newRuleKw.trim().length < 2) return;
                  onAddCategoryRule({ keyword: newRuleKw.trim(), category: newRuleCat });
                  setNewRuleKw('');
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs items-end"
              >
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Palavra-chave</label>
                  <input
                    type="text"
                    value={newRuleKw}
                    onChange={(e) => setNewRuleKw(e.target.value)}
                    placeholder="Ex.: Uber, Mercado, Enel..."
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Categoria sugerida</label>
                  <select
                    value={newRuleCat}
                    onChange={(e) => setNewRuleCat(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 min-h-10"
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
                  className="min-h-10 px-4 rounded-xl bg-[#061E3E] text-white font-bold cursor-pointer"
                >
                  Adicionar regra
                </button>
              </form>
            )}

            <div className="flex flex-wrap gap-2">
              {extractionRules.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <strong className="font-mono">&quot;{r.keyword}&quot;</strong>
                  <span>→ {r.category}</span>
                  {r.entityId && <span className="text-[10px] font-bold">({r.entityId})</span>}
                  <button
                    type="button"
                    onClick={() => onDeleteExtractionRule(r.id)}
                    aria-label={`Remover regra ${r.keyword}`}
                    className="text-slate-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
              {categoryRules.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <strong className="font-mono">&quot;{r.keyword}&quot;</strong>
                  <span>→ {r.category}</span>
                  {onDeleteCategoryRule && (
                    <button
                      type="button"
                      onClick={() => onDeleteCategoryRule(r.id)}
                      aria-label={`Remover regra ${r.keyword}`}
                      className="text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Inline Edit Movement + Learn Rule */}
      {editingMovement && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditedMovement}
            className="w-full max-w-lg bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5 text-xs sm:text-sm max-h-[90dvh] overflow-y-auto"
          >
            <h3 className="text-base font-extrabold text-[#061E3E] dark:text-white">
              Revisar & Classificar Movimentação
            </h3>

            <div>
              <label className="block text-xs font-semibold mb-1">Descrição</label>
              <input
                type="text"
                required
                value={editingMovement.originalDescription}
                onChange={(e) =>
                  setEditingMovement({
                    ...editingMovement,
                    originalDescription: e.target.value,
                    normalizedDescription: normalizeDescription(e.target.value),
                  })
                }
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={editingMovement.date}
                  onChange={(e) =>
                    setEditingMovement({ ...editingMovement, date: e.target.value })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Valor ({editingMovement.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editingMovement.amount}
                  onChange={(e) => {
                    const num = Number(e.target.value) || 0;
                    const c = toCents(Math.abs(num));
                    setEditingMovement({
                      ...editingMovement,
                      amount: Math.abs(num),
                      amountCents: c,
                    });
                  }}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Natureza econômica</label>
                <select
                  value={editingMovement.movementType}
                  onChange={(e) =>
                    setEditingMovement({
                      ...editingMovement,
                      movementType: e.target.value as ExtractionMovementType,
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  {ALL_MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EXTRACTION_MOVEMENT_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Categoria</label>
                <select
                  value={editingMovement.suggestedCategory}
                  onChange={(e) =>
                    setEditingMovement({ ...editingMovement, suggestedCategory: e.target.value })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  {APP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Direção</label>
                <select
                  value={editingMovement.direction}
                  onChange={(e) =>
                    setEditingMovement({
                      ...editingMovement,
                      direction: e.target.value as Direction,
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="INCOME">Entrada (+)</option>
                  <option value="EXPENSE">Saída (−)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Titularidade</label>
                <select
                  value={editingMovement.entityId || ''}
                  onChange={(e) =>
                    setEditingMovement({
                      ...editingMovement,
                      entityId: (e.target.value || undefined) as EntityId | undefined,
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="">Selecionar...</option>
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                </select>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-2 text-xs">
              <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveRuleChecked}
                  onChange={(e) => setSaveRuleChecked(e.target.checked)}
                  className="accent-[#059669]"
                />
                <span>Salvar regra para futuras importações</span>
              </label>
              {saveRuleChecked && (
                <input
                  type="text"
                  value={saveRuleKeyword}
                  onChange={(e) => setSaveRuleKeyword(e.target.value)}
                  placeholder="Trecho da descrição para reconhecer..."
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#11185A]"
                />
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMovement(null)}
                className="flex-1 min-h-10 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 min-h-10 rounded-xl bg-[#059669] text-white font-bold cursor-pointer"
              >
                Salvar revisão
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Manual Movement Insertion into Active Extraction Batch */}
      {manualModalOpen && activeBatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateManualMovement}
            className="w-full max-w-lg bg-white dark:bg-[#11185A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3.5 text-xs sm:text-sm max-h-[90dvh] overflow-y-auto"
          >
            <div>
              <h3 className="text-base font-extrabold text-[#061E3E] dark:text-white">
                Inserir Lançamento Manualmente no Lote
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                O item entra em conferência (Camada A) para sua aprovação antes de afetar saldos oficiais.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Descrição</label>
              <input
                type="text"
                required
                placeholder="Ex.: PIX ENVIADO FORNECEDOR"
                value={manualDraft.description}
                onChange={(e) => setManualDraft({ ...manualDraft, description: e.target.value })}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={manualDraft.date}
                  onChange={(e) => setManualDraft({ ...manualDraft, date: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Valor</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  value={manualDraft.amountStr}
                  onChange={(e) => setManualDraft({ ...manualDraft, amountStr: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Moeda</label>
                <select
                  value={manualDraft.currency}
                  onChange={(e) => setManualDraft({ ...manualDraft, currency: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Natureza econômica</label>
                <select
                  value={manualDraft.movementType}
                  onChange={(e) =>
                    setManualDraft({
                      ...manualDraft,
                      movementType: e.target.value as ExtractionMovementType,
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  {ALL_MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EXTRACTION_MOVEMENT_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Categoria</label>
                <select
                  value={manualDraft.suggestedCategory}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, suggestedCategory: e.target.value })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  {APP_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Direção</label>
                <select
                  value={manualDraft.direction}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, direction: e.target.value as Direction })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="EXPENSE">Saída (−)</option>
                  <option value="INCOME">Entrada (+)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Titularidade</label>
                <select
                  value={manualDraft.entityId}
                  onChange={(e) =>
                    setManualDraft({
                      ...manualDraft,
                      entityId: (e.target.value || '') as EntityId | '',
                    })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white dark:bg-slate-800"
                >
                  <option value="">Selecionar...</option>
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Contraparte (opcional)</label>
                <input
                  type="text"
                  value={manualDraft.counterparty}
                  onChange={(e) => setManualDraft({ ...manualDraft, counterparty: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">ID / E2E (opcional)</label>
                <input
                  type="text"
                  value={manualDraft.bankTransactionId}
                  onChange={(e) =>
                    setManualDraft({ ...manualDraft, bankTransactionId: e.target.value })
                  }
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualModalOpen(false)}
                className="flex-1 min-h-10 rounded-xl border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 min-h-10 rounded-xl bg-[#059669] text-white font-bold cursor-pointer"
              >
                Adicionar ao lote
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Traceability Drawer ("Rastrear movimentação") */}
      <TraceabilitySheet
        open={Boolean(traceLookup)}
        onClose={() => setTraceLookup(null)}
        traceability={traceLookup}
      />
    </div>
  );
};
