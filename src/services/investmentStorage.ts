import { CdiSeriesCacheRecord, InvestmentSimulation } from '../types/investment';
import { loadJsonWithRecovery, saveJsonSafe } from './storage';

export const INVESTMENT_STORAGE_KEYS = {
  simulations: 'finance_ia_investment_simulations',
  cdiCache: 'finance_ia_cdi_history_cache',
} as const;

export function loadSavedSimulations(): InvestmentSimulation[] {
  const res = loadJsonWithRecovery<InvestmentSimulation[]>(
    INVESTMENT_STORAGE_KEYS.simulations,
    [],
    Array.isArray
  );
  return res.data;
}

export function saveSimulations(simulations: InvestmentSimulation[]): { ok: boolean; error?: string } {
  return saveJsonSafe(INVESTMENT_STORAGE_KEYS.simulations, simulations);
}

export function loadCachedCdiSeries(): CdiSeriesCacheRecord | null {
  const res = loadJsonWithRecovery<CdiSeriesCacheRecord | null>(
    INVESTMENT_STORAGE_KEYS.cdiCache,
    null,
    (val) =>
      Boolean(
        val &&
          typeof val === 'object' &&
          'series' in val &&
          Array.isArray((val as CdiSeriesCacheRecord).series)
      )
  );
  return res.data;
}

export function saveCachedCdiSeries(record: CdiSeriesCacheRecord): { ok: boolean; error?: string } {
  return saveJsonSafe(INVESTMENT_STORAGE_KEYS.cdiCache, record);
}
