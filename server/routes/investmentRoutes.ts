import { Router } from 'express';

export interface CdiRateRecord {
  data: string;
  valor: string;
}

interface CdiCacheEntry {
  series: CdiRateRecord[];
  fetchedAt: string;
  expiresAt: number;
  startDate: string;
  endDate: string;
}

const BCB_SGS12_URL = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BCB_TIMEOUT_MS = 12_000;

const cdiCache = new Map<string, CdiCacheEntry>();

function formatDateBr(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function normalizeBcbDateParam(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return trimmed;
    }
    return null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
    return null;
  }
  return null;
}

function parseBrDateToTime(brDate: string): number {
  const [d, m, y] = brDate.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function validateBcbSeries(payload: unknown): CdiRateRecord[] {
  if (!Array.isArray(payload)) {
    throw new Error('Resposta inválida da API do Banco Central.');
  }

  return payload.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Registro CDI inválido.');
    }
    const rec = item as { data?: unknown; valor?: unknown };
    if (typeof rec.data !== 'string' || typeof rec.valor !== 'string') {
      throw new Error('Campos inválidos no registro CDI.');
    }
    const numericVal = Number(rec.valor);
    if (!Number.isFinite(numericVal) || numericVal < 0 || numericVal > 5) {
      throw new Error('Taxa diária CDI fora do intervalo esperado.');
    }
    return {
      data: rec.data,
      valor: rec.valor,
    };
  });
}

export function createInvestmentRouter(): Router {
  const router = Router();

  router.get('/cdi', async (req, res) => {
    const now = new Date();
    const defaultEnd = formatDateBr(now);
    const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const defaultStart = formatDateBr(yearAgo);

    const startParam = req.query.startDate ? normalizeBcbDateParam(req.query.startDate) : defaultStart;
    const endParam = req.query.endDate ? normalizeBcbDateParam(req.query.endDate) : defaultEnd;

    if (!startParam || !endParam) {
      return res.status(400).json({
        error: 'Parâmetros startDate e endDate devem estar no formato DD/MM/AAAA ou YYYY-MM-DD.',
      });
    }

    const startTime = parseBrDateToTime(startParam);
    const endTime = parseBrDateToTime(endParam);

    if (startTime > endTime) {
      return res.status(400).json({
        error: 'A data inicial não pode ser posterior à data final.',
      });
    }

    // Banco Central SGS caps single window queries to ~10 years
    const maxRangeMs = 10 * 366 * 24 * 60 * 60 * 1000;
    if (endTime - startTime > maxRangeMs) {
      return res.status(400).json({
        error: 'O intervalo máximo por consulta à série CDI do Banco Central é de 10 anos.',
      });
    }

    const cacheKey = `${startParam}_${endParam}`;
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cached = cdiCache.get(cacheKey);

    if (!forceRefresh && cached && Date.now() < cached.expiresAt) {
      return res.json({
        series: cached.series,
        source: 'Banco Central do Brasil · SGS Série 12 (Taxa DI)',
        fetchedAt: cached.fetchedAt,
        cached: true,
        stale: false,
        startDate: startParam,
        endDate: endParam,
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BCB_TIMEOUT_MS);

    try {
      const params = new URLSearchParams({
        formato: 'json',
        dataInicial: startParam,
        dataFinal: endParam,
      });

      const response = await fetch(`${BCB_SGS12_URL}?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SavioFinanaIA/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const raw: unknown = await response.json();
      const series = validateBcbSeries(raw);
      const fetchedAt = new Date().toISOString();

      cdiCache.set(cacheKey, {
        series,
        fetchedAt,
        expiresAt: Date.now() + CACHE_TTL_MS,
        startDate: startParam,
        endDate: endParam,
      });

      return res.json({
        series,
        source: 'Banco Central do Brasil · SGS Série 12 (Taxa DI)',
        fetchedAt,
        cached: false,
        stale: false,
        startDate: startParam,
        endDate: endParam,
      });
    } catch (err) {
      if (cached) {
        return res.json({
          series: cached.series,
          source: 'Banco Central do Brasil · Cache local do servidor',
          fetchedAt: cached.fetchedAt,
          cached: true,
          stale: true,
          warning:
            'Banco Central temporariamente indisponível; exibindo última série histórica válida armazenada em cache.',
          startDate: startParam,
          endDate: endParam,
        });
      }

      const isAbort = err instanceof Error && err.name === 'AbortError';
      return res.status(503).json({
        error: isAbort
          ? 'Tempo esgotado ao consultar a API do Banco Central (SGS 12).'
          : 'Não foi possível consultar a série histórica do CDI no Banco Central no momento.',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  return router;
}
