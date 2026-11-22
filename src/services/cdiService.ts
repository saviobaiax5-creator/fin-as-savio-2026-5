import { CDIRate, CdiSeriesCacheRecord } from '../types/investment';
import { loadCachedCdiSeries, saveCachedCdiSeries } from './investmentStorage';
import { enqueueOfflineTask } from '../core/sync/offlineQueue';

const BCB_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';
const CLIENT_CACHE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 horas

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function validateCdiArray(result: unknown): CDIRate[] {
  if (!Array.isArray(result)) {
    throw new Error('Resposta inválida da API do Banco Central.');
  }

  return result.map((item: unknown) => {
    const rec = item as { data?: unknown; valor?: unknown };
    if (
      !rec ||
      typeof rec.data !== 'string' ||
      typeof rec.valor !== 'string' ||
      !Number.isFinite(Number(rec.valor))
    ) {
      throw new Error('Registro CDI inválido.');
    }
    return {
      data: rec.data,
      valor: rec.valor,
    };
  });
}

/**
 * Consulta direta compatível com a assinatura BCB SGS Série 12.
 * No navegador, prefira `fetchCdiWithCache` para utilizar o endpoint backend `/api/investments/cdi` com cache.
 */
export async function fetchCDIHistory(startDate: Date, endDate: Date): Promise<CDIRate[]> {
  const params = new URLSearchParams({
    formato: 'json',
    dataInicial: formatDate(startDate),
    dataFinal: formatDate(endDate),
  });

  const response = await fetch(`${BCB_URL}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Erro ao consultar CDI: HTTP ${response.status}`);
  }

  const result: unknown = await response.json();
  return validateCdiArray(result);
}

export interface CdiFetchResponse {
  series: CDIRate[];
  source: string;
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  usedLocalHistory: boolean;
  startDate: string;
  endDate: string;
  warning?: string;
}

/**
 * Consulta `/api/investments/cdi` com cache no servidor e cache persistente local.
 * Nunca substitui falhas por taxas fictícias: em erro, utiliza exclusivamente histórico real já salvo ou informa indisponibilidade.
 */
export async function fetchCdiWithCache(
  startDate: Date,
  endDate: Date,
  options?: { forceRefresh?: boolean }
): Promise<CdiFetchResponse> {
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);
  const cacheKey = `${startStr}_${endStr}`;
  const forceRefresh = Boolean(options?.forceRefresh);

  const localCached = loadCachedCdiSeries();
  if (!forceRefresh && localCached && localCached.key === cacheKey) {
    const ageMs = Date.now() - new Date(localCached.fetchedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < CLIENT_CACHE_MAX_AGE_MS && localCached.series.length > 0) {
      return {
        series: localCached.series,
        source: localCached.source,
        fetchedAt: localCached.fetchedAt,
        cached: true,
        stale: false,
        usedLocalHistory: false,
        startDate: startStr,
        endDate: endStr,
      };
    }
  }

  try {
    const params = new URLSearchParams({
      startDate: startStr,
      endDate: endStr,
      ...(forceRefresh ? { refresh: '1' } : {}),
    });

    const response = await fetch(`/api/investments/cdi?${params.toString()}`);
    const payload = (await response.json()) as {
      series?: unknown;
      source?: string;
      fetchedAt?: string;
      cached?: boolean;
      stale?: boolean;
      warning?: string;
      error?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const series = validateCdiArray(payload.series);
    const fetchedAt = payload.fetchedAt || new Date().toISOString();
    const source = payload.source || 'Banco Central do Brasil · SGS Série 12';

    const cacheRecord: CdiSeriesCacheRecord = {
      key: cacheKey,
      startDate: payload.startDate || startStr,
      endDate: payload.endDate || endStr,
      fetchedAt,
      source,
      series,
    };
    saveCachedCdiSeries(cacheRecord);

    return {
      series,
      source,
      fetchedAt,
      cached: Boolean(payload.cached),
      stale: Boolean(payload.stale),
      usedLocalHistory: false,
      startDate: cacheRecord.startDate,
      endDate: cacheRecord.endDate,
      warning: payload.warning,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Falha na conexão com o Banco Central.';
    enqueueOfflineTask({
      idempotencyKey: `cdi_refresh_${cacheKey}`,
      kind: 'CDI_REFRESH',
      label: `Atualizar taxa CDI BCB (${startStr} a ${endStr})`,
      payload: { startDate: startStr, endDate: endStr },
      lastError: errMsg,
    });
    if (localCached && localCached.series.length > 0) {
      return {
        series: localCached.series,
        source: `${localCached.source} (histórico salvo localmente)`,
        fetchedAt: localCached.fetchedAt,
        cached: true,
        stale: true,
        usedLocalHistory: true,
        startDate: localCached.startDate,
        endDate: localCached.endDate,
        warning: `${errMsg} Exibindo histórico armazenado localmente da consulta de ${new Date(
          localCached.fetchedAt
        ).toLocaleString('pt-BR')}.`,
      };
    }
    throw new Error(errMsg);
  }
}
