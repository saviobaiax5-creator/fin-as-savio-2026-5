import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isOriginAllowedForAi } from '../../server/aiGuard';
import {
  createVaultWithPin,
  disableVaultWithPin,
  isVaultEnabled,
  verifyAndUnlockVault,
} from '../../core/security/secureVault';
import { clearDraft, loadDraft, saveDraft } from '../../core/lifecycle/draftPreserver';
import {
  enqueueOfflineTask,
  flushOfflineQueue,
  loadOfflineQueue,
} from '../../core/sync/offlineQueue';
import { computeWindowedRange } from '../../components/VirtualList';
import { sanitizeMoneyKeystrokes } from '../../components/MoneyInputField';
import { buildComparativeChartSeries } from '../../components/investments/GraficoComparativo';
import { getAnnualTotal, getMonthlyTotal } from '../salaryCalculations';
import type { SalaryRecord, SalarySource } from '../../types/salary';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    key(idx: number) {
      return Array.from(store.keys())[idx] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
  };
}

describe('Auditoria de Arquitetura e Segurança Financeira', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage,
      sessionStorage,
      dispatchEvent: () => true,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
  });

  it('aiGuard bloqueia requisições sem Origin em produção mas permite mesma origem', () => {
    expect(
      isOriginAllowedForAi({
        origin: undefined,
        host: 'finance.example.com',
        nodeEnv: 'production',
      })
    ).toBe(false);

    expect(
      isOriginAllowedForAi({
        origin: 'https://finance.example.com',
        host: 'finance.example.com',
        nodeEnv: 'production',
      })
    ).toBe(true);

    expect(
      isOriginAllowedForAi({
        origin: 'https://evil.example.net',
        host: 'finance.example.com',
        nodeEnv: 'production',
      })
    ).toBe(false);

    expect(
      isOriginAllowedForAi({
        origin: undefined,
        host: 'localhost:3000',
        nodeEnv: 'development',
      })
    ).toBe(true);
  });

  it('secureVault criptografa e valida PIN via PBKDF2 + AES-GCM-256', async () => {
    expect(isVaultEnabled()).toBe(false);
    const snapshot = JSON.stringify({ accounts: [{ id: 'a1', balance: 1234.56 }] });

    await createVaultWithPin('4829', snapshot);
    expect(isVaultEnabled()).toBe(true);

    const wrong = await verifyAndUnlockVault('0000');
    expect(wrong.ok).toBe(false);

    const right = await verifyAndUnlockVault('4829');
    expect(right.ok).toBe(true);
    expect(right.key).toBeDefined();
    expect(right.decryptedDatasetJson).toBe(snapshot);

    const disabledFail = await disableVaultWithPin('0000');
    expect(disabledFail.ok).toBe(false);
    expect(isVaultEnabled()).toBe(true);

    const disabledOk = await disableVaultWithPin('4829');
    expect(disabledOk.ok).toBe(true);
    expect(isVaultEnabled()).toBe(false);
  });

  it('draftPreserver salva, recupera e limpa rascunhos de formulário', () => {
    saveDraft('tx_new', { description: 'Mercado', amount: '120,50' });
    const loaded = loadDraft<{ description: string; amount: string }>('tx_new');
    expect(loaded).not.toBeNull();
    expect(loaded?.description).toBe('Mercado');
    expect(loaded?.amount).toBe('120,50');

    clearDraft('tx_new');
    expect(loadDraft('tx_new')).toBeNull();
  });

  it('offlineQueue garante idempotência e limpa itens sincronizados no flush', async () => {
    const first = enqueueOfflineTask({
      idempotencyKey: 'cdi_2026_05',
      kind: 'CDI_REFRESH',
      label: 'Atualizar CDI',
    });
    const dup = enqueueOfflineTask({
      idempotencyKey: 'cdi_2026_05',
      kind: 'CDI_REFRESH',
      label: 'Atualizar CDI duplicado',
    });
    enqueueOfflineTask({
      idempotencyKey: 'sync_2',
      kind: 'WORKSPACE_SYNC',
      label: 'Sync Sheets',
    });

    expect(first.id).toBe(dup.id);
    expect(loadOfflineQueue()).toHaveLength(2);

    const result = await flushOfflineQueue(async (item) => item.kind === 'CDI_REFRESH');
    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.remaining).toBe(1);

    const rem = loadOfflineQueue();
    expect(rem).toHaveLength(1);
    expect(rem[0].kind).toBe('WORKSPACE_SYNC');
    expect(rem[0].attempts).toBe(1);
  });

  it('computeWindowedRange virtualiza listas acima do threshold e calcula espaçadores', () => {
    const small = computeWindowedRange({
      totalCount: 20,
      scrollTop: 0,
      viewportHeight: 600,
      itemHeight: 100,
      threshold: 35,
    });
    expect(small.isVirtualized).toBe(false);
    expect(small.endIndex).toBe(20);

    const large = computeWindowedRange({
      totalCount: 200,
      scrollTop: 2500,
      viewportHeight: 500,
      itemHeight: 100,
      overscan: 2,
      threshold: 35,
    });
    expect(large.isVirtualized).toBe(true);
    expect(large.startIndex).toBe(23);
    expect(large.topPaddingPx).toBe(2300);
    expect(large.endIndex).toBeLessThan(40);
    expect(large.bottomPaddingPx).toBe((200 - large.endIndex) * 100);
  });

  it('sanitizeMoneyKeystrokes mantém apenas dígitos e separadores decimais', () => {
    expect(sanitizeMoneyKeystrokes('R$ 1.250,45abc')).toBe('1.250,45');
    expect(sanitizeMoneyKeystrokes('-99,90')).toBe('99,90');
  });

  it('salaryCalculations evita erro de ponto flutuante binário (0.10 + 0.20 === 0.30)', () => {
    const sources: SalarySource[] = [
      { id: 's1', name: 'A', category: 'salary', active: true, createdAt: '' },
      { id: 's2', name: 'B', category: 'teaching', active: true, createdAt: '' },
    ];
    const records: SalaryRecord[] = [
      {
        id: 'r1',
        sourceId: 's1',
        year: 2026,
        month: 1,
        amount: 0.1,
        status: 'received',
        origin: 'manual',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        sourceId: 's2',
        year: 2026,
        month: 1,
        amount: 0.2,
        status: 'received',
        origin: 'manual',
        createdAt: '',
        updatedAt: '',
      },
    ];

    expect(getMonthlyTotal(records, 2026, 1, sources)).toBe(0.3);
    expect(getAnnualTotal(records, 2026, sources)).toBe(0.3);
  });

  it('buildComparativeChartSeries converte série CDI x CDB para rentabilidade acumulada percentual (%)', () => {
    const sample = [
      { date: '01/10', cdi: 1000, cdb: 1000, invested: 1000 },
      { date: '15/10', cdi: 1005.5, cdb: 1006.33, invested: 1000 },
      { date: '30/10', cdi: 1011.2, cdb: 1012.88, invested: 1000 },
    ];

    const currency = buildComparativeChartSeries(sample, 'currency');
    expect(currency[2].cdi).toBe(1011.2);
    expect(currency[2].cdb).toBe(1012.88);

    const pct = buildComparativeChartSeries(sample, 'percent');
    expect(pct[0].cdi).toBe(0);
    expect(pct[0].cdb).toBe(0);
    expect(pct[2].cdi).toBe(1.12);
    expect(pct[2].cdb).toBe(1.29);
  });
});
