import type { MoneyCents } from '../../money/money';
import type { Account } from '../../../types';
import type { ParseResultPayload } from '../../../types/extractions';
import {
  detectTaxDocumentNature,
  maskAccountNumber,
  sanitizeExtractedText,
  sanitizeRawRowSnapshot,
} from '../fileSecurity';
import { parseFlexibleDate, parseFlexibleSignedAmount } from './csvParser';
import { detectBankFromStatement } from '../banksRepository';

const MAX_OCR_BASE64_LENGTH = 21_500_000;
const CLIENT_OCR_TIMEOUT_MS = 65_000;

let workerConfigured = false;

async function ensurePdfWorkerConfigured(pdfjsLib: {
  GlobalWorkerOptions: { workerSrc: string };
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return false;
  }
  if (!workerConfigured) {
    try {
      const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      if (workerMod?.default) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default;
        workerConfigured = true;
      }
    } catch {
      return false;
    }
  }
  return workerConfigured;
}

/**
 * Extracts readable textual lines synchronously from uncompressed PDF literal streams.
 * Kept as a fast fallback for synthetic/uncompressed streams and test buffers.
 */
export function extractTextFromPdfBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    ascii += String.fromCharCode(bytes[i]);
  }

  // Extract parenthesized PDF text literals inside BT..ET or Tj/TJ operators
  const textChunks: string[] = [];
  const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")?/g;
  let match: RegExpExecArray | null;
  while ((match = literalRegex.exec(ascii)) !== null) {
    const raw = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    // Filter out binary/font garbage
    if (
      /[A-Za-z0-9À-ÿ]{2,}/.test(raw) &&
      !/^(Type|Font|Encoding|Filter|FlateDecode|Catalog|Pages)$/i.test(raw.trim())
    ) {
      textChunks.push(raw.trim());
    }
  }

  // Also grab readable line sequences when plain text streams exist
  if (textChunks.length < 4) {
    const plainLines = ascii
      .split(/\r?\n/)
      .filter((line) => /\d{2}\/\d{2}\/\d{4}/.test(line) && /[-+]?\d+[.,]\d{2}/.test(line));
    textChunks.push(...plainLines);
  }

  return textChunks.join('\n');
}

/**
 * Extracts text locally using PDF.js (supporting FlateDecode, CID fonts, ToUnicode CMaps and
 * coordinate-ordered table rows) with safe fallback to raw stream literal extraction.
 */
export async function extractTextFromPdfBufferAsync(buffer: ArrayBuffer): Promise<{
  text: string;
  pageCount: number;
  engine: 'PDFJS' | 'RAW_STREAM';
}> {
  try {
    const hasBrowserWorker = typeof window !== 'undefined' && typeof Worker !== 'undefined';
    const pdfjsLib = hasBrowserWorker
      ? await import('pdfjs-dist')
      : await import('pdfjs-dist/legacy/build/pdf.mjs');

    if (hasBrowserWorker) {
      await ensurePdfWorkerConfigured(pdfjsLib);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      verbosity: 0,
      useSystemFonts: true,
    });

    const doc = await loadingTask.promise;
    const pageLines: string[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();

      interface PositionedItem {
        x: number;
        y: number;
        str: string;
      }

      const items: PositionedItem[] = [];
      for (const rawItem of content.items as Array<{
        str?: string;
        transform?: number[];
      }>) {
        const text = (rawItem.str || '').trim();
        if (!text) continue;
        const x = Array.isArray(rawItem.transform) ? Number(rawItem.transform[4] || 0) : 0;
        const y = Array.isArray(rawItem.transform) ? Number(rawItem.transform[5] || 0) : 0;
        items.push({ x, y, str: text });
      }

      // Group items into horizontal lines using 3pt vertical tolerance
      items.sort((a, b) => {
        if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
        return a.x - b.x;
      });

      const buckets: PositionedItem[][] = [];
      for (const item of items) {
        const lastBucket = buckets[buckets.length - 1];
        if (lastBucket && Math.abs(lastBucket[0].y - item.y) <= 3) {
          lastBucket.push(item);
        } else {
          buckets.push([item]);
        }
      }

      for (const bucket of buckets) {
        bucket.sort((a, b) => a.x - b.x);
        const line = bucket.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
        if (line) pageLines.push(line);
      }
    }

    const combined = pageLines.join('\n').trim();
    await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();

    if (combined.length > 0) {
      return { text: combined, pageCount: doc.numPages, engine: 'PDFJS' };
    }

    const rawFallback = extractTextFromPdfBuffer(buffer);
    return { text: rawFallback, pageCount: doc.numPages, engine: 'RAW_STREAM' };
  } catch {
    return {
      text: extractTextFromPdfBuffer(buffer),
      pageCount: 0,
      engine: 'RAW_STREAM',
    };
  }
}

const AMOUNT_TOKEN_SOURCE =
  '(?:[-+]?\\(?\\s*(?:R\\$\\s*)?\\d{1,3}(?:\\.\\d{3})*,\\d{2}\\)?(?:\\s*[CD])?|[-+]?\\(?\\s*(?:R\\$\\s*)?\\d+\\.\\d{2}\\)?(?:\\s*[CD])?)';
const SINGLE_TAIL_AMOUNT_RE = new RegExp(`(${AMOUNT_TOKEN_SOURCE})$`, 'i');
const DOUBLE_TAIL_AMOUNT_RE = new RegExp(
  `(${AMOUNT_TOKEN_SOURCE})\\s+(${AMOUNT_TOKEN_SOURCE})$`,
  'i'
);

function inferStatementYear(extractedText: string): string {
  const fullDateMatch = extractedText.match(/\b\d{2}\/\d{2}\/(20\d{2})\b/);
  if (fullDateMatch) return fullDateMatch[1];
  const monthYearMatch = extractedText.match(/\b(?:0?[1-9]|1[0-2])\/(20\d{2})\b/);
  if (monthYearMatch) return monthYearMatch[1];
  const isoYearMatch = extractedText.match(/\b(20\d{2})-\d{2}-\d{2}\b/);
  if (isoYearMatch) return isoYearMatch[1];
  return String(new Date().getFullYear());
}

function parsePdfDateToken(rawDate: string, fallbackYear: string): string | undefined {
  const full = parseFlexibleDate(rawDate);
  if (full) return full;
  const shortMatch = rawDate.trim().match(/^(\d{2})\/(\d{2})$/);
  if (shortMatch) {
    const day = Number(shortMatch[1]);
    const month = Number(shortMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${fallbackYear}-${shortMatch[2]}-${shortMatch[1]}`;
    }
  }
  return undefined;
}

export function parseTextualPdfContent(extractedText: string, fileName = ''): ParseResultPayload {
  const warnings: string[] = [];
  const errors: string[] = [];

  const cleanLines = extractedText
    .split(/\r?\n/)
    .map((l) => sanitizeExtractedText(l, 260))
    .filter(Boolean);

  // Deduplicate repeated headers/footers across pages
  const seenMovementKeys = new Set<string>();
  const rows: ParseResultPayload['rows'] = [];

  const docMatch = extractedText.match(
    /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/
  );
  const docInfo = docMatch ? detectTaxDocumentNature(docMatch[1]) : undefined;
  const agAccountMatch = extractedText.match(
    /ag[eê]ncia[:\s]*(\d{3,5})[^\d]+conta[:\s]*([\d-]{4,14})/i
  );
  const inferredYear = inferStatementYear(extractedText);

  let openingBalanceCents: MoneyCents | undefined;
  let reportedEndingBalanceCents: MoneyCents | undefined;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    if (/^p[aá]gina\s+\d+/i.test(line)) continue;

    if (/saldo\s*(anterior|inicial)/i.test(line)) {
      const m = line.match(/([-+]?R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}|[-+]?\d+\.\d{2})/i);
      const val = m ? parseFlexibleSignedAmount(m[1]) : undefined;
      if (val !== undefined) openingBalanceCents = Math.round(val * 100) as MoneyCents;
      continue;
    }
    if (/saldo\s*(final|atual|dispon[ií]vel)/i.test(line) && !/^\d{2}\/\d{2}/.test(line)) {
      const m = line.match(/([-+]?R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}|[-+]?\d+\.\d{2})/i);
      const val = m ? parseFlexibleSignedAmount(m[1]) : undefined;
      if (val !== undefined) reportedEndingBalanceCents = Math.round(val * 100) as MoneyCents;
      continue;
    }

    // Look for date (YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, or DD/MM)
    const dateMatch = line.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2,4}|\b\d{2}\/\d{2}\b)/);

    const extractTailAmount = (
      targetLine: string
    ): { amountToken: string; stripPattern: string } | null => {
      const dbl = targetLine.match(DOUBLE_TAIL_AMOUNT_RE);
      if (dbl) {
        return { amountToken: dbl[1], stripPattern: dbl[0] };
      }
      const sgl = targetLine.match(SINGLE_TAIL_AMOUNT_RE);
      if (sgl) {
        return { amountToken: sgl[1], stripPattern: sgl[0] };
      }
      return null;
    };

    let candidateLine = line;
    let tailAmt = extractTailAmount(line);

    if (dateMatch && !tailAmt && i + 1 < cleanLines.length) {
      const nextLine = cleanLines[i + 1];
      const nextTail = extractTailAmount(nextLine);
      if (nextTail && !/^\d{2}\/\d{2}/.test(nextLine)) {
        candidateLine = `${line} ${nextLine}`;
        tailAmt = nextTail;
        i++;
      }
    }

    if (!dateMatch || !tailAmt) continue;
    const parsedDate = parsePdfDateToken(dateMatch[1], inferredYear);
    const parsedAmt = parseFlexibleSignedAmount(tailAmt.amountToken);
    if (!parsedDate || parsedAmt === undefined || parsedAmt === 0) continue;

    const descRaw = candidateLine
      .replace(dateMatch[1], '')
      .replace(tailAmt.stripPattern, '')
      .replace(/\s+/g, ' ')
      .trim();
    const desc = descRaw || 'Lançamento PDF';

    // Deduplicate identical page-break duplicate lines
    const pageDedupKey = `${parsedDate}|${Math.round(parsedAmt * 100)}|${desc.toLowerCase()}`;
    if (seenMovementKeys.has(pageDedupKey)) continue;
    seenMovementKeys.add(pageDedupKey);

    rows.push({
      date: parsedDate,
      description: desc,
      amountSignedCents: Math.round(parsedAmt * 100) as MoneyCents,
      currency: 'BRL',
      rawRowSnapshot: sanitizeRawRowSnapshot({
        line: candidateLine,
        date: parsedDate,
        amount: parsedAmt,
      }),
      confidence: 0.84,
    });
  }

  const detectedBank = detectBankFromStatement(extractedText.slice(0, 2500), fileName);

  return {
    format: 'PDF',
    parseSource: 'LOCAL',
    identifiedAccount: {
      bankName:
        detectedBank.type !== 'desconhecido' && detectedBank.name
          ? detectedBank.name
          : fileName.replace(/\.pdf$/i, ''),
      bankCode: detectedBank.code,
      bankIspb: detectedBank.ispb,
      bankType: detectedBank.type,
      detectionConfidence: detectedBank.confidence,
      institutionId: detectedBank.institutionId,
      institutionCategory:
        detectedBank.type === 'fisico'
          ? 'BANCO_FISICO'
          : detectedBank.type === 'digital'
            ? 'BANCO_DIGITAL'
            : undefined,
      maskedDocument: docInfo?.masked,
      documentValid: docInfo?.valid,
      holderNature: docInfo?.valid ? docInfo.nature : undefined,
      agency: agAccountMatch?.[1],
      maskedAccountNumber: maskAccountNumber(agAccountMatch?.[2]),
      currency: 'BRL',
      requiresConfirmation: true,
      confirmationReason:
        rows.length === 0
          ? 'PDF sem camada textual estruturada (possível arquivo digitalizado). Utilize leitura OCR autorizada ou insira os lançamentos manualmente.'
          : 'Confirme a conta e revise as linhas extraídas localmente do PDF.',
    },
    openingBalanceCents,
    reportedEndingBalanceCents,
    warnings,
    errors,
    requiresManualReview: true,
    rows,
  };
}

export interface RemoteOcrResponse {
  transactions?: Array<{
    description: string;
    amount: number;
    date: string;
    category?: string;
    entity?: 'CPF' | 'CNPJ';
    direction: 'INCOME' | 'EXPENSE';
    operationType?: string;
    counterparty?: string;
    externalId?: string;
    confidence?: number;
    confidenceNote?: string;
  }>;
  error?: string;
}

function getApiBaseUrl(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function isCapacitorOfflineRuntime(apiBaseUrl: string): boolean {
  if (apiBaseUrl) return false;
  if (typeof window === 'undefined') return false;
  const protocol = window.location?.protocol || '';
  return protocol === 'capacitor:' || protocol === 'file:';
}

function buildRemoteOcrErrorPayload(params: {
  format: 'PDF' | 'IMAGE';
  fileName: string;
  warning: string;
  error: string;
  confirmationReason: string;
}): ParseResultPayload {
  return {
    format: params.format,
    parseSource: 'OCR_IA',
    identifiedAccount: {
      bankName: params.fileName.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, ''),
      requiresConfirmation: true,
      confirmationReason: params.confirmationReason,
    },
    warnings: [params.warning],
    errors: [params.error],
    requiresManualReview: true,
    rows: [],
  };
}

export async function requestRemoteOcrParse(params: {
  fileName: string;
  mimeType: string;
  base64Data: string;
  knownAccounts: Account[];
  format: 'PDF' | 'IMAGE';
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ParseResultPayload> {
  const fetchImpl = params.fetcher || fetch;
  const apiBaseUrl = getApiBaseUrl();

  if (params.base64Data.length > MAX_OCR_BASE64_LENGTH) {
    return buildRemoteOcrErrorPayload({
      format: params.format,
      fileName: params.fileName,
      warning:
        'O arquivo excedeu o limite máximo suportado para envio ao OCR (15 MB). Comprima o PDF, envie páginas em imagem ou insira manualmente.',
      error: 'Payload excede limite máximo de envio ao OCR.',
      confirmationReason: 'Arquivo acima do limite de envio ao OCR. Revise ao lado ou insira manualmente.',
    });
  }

  if (!params.fetcher && isCapacitorOfflineRuntime(apiBaseUrl)) {
    return buildRemoteOcrErrorPayload({
      format: params.format,
      fileName: params.fileName,
      warning:
        'Serviço de OCR remoto não configurado para execução offline no aplicativo. Você pode revisar o documento ao lado ou inserir manualmente.',
      error: 'Backend de OCR indisponível em ambiente local sem VITE_API_BASE_URL.',
      confirmationReason: 'Leitura OCR remota indisponível neste ambiente. Insira manualmente comparando com o documento.',
    });
  }

  if (!params.fetcher && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return buildRemoteOcrErrorPayload({
      format: params.format,
      fileName: params.fileName,
      warning:
        'Sem conexão com a internet no momento. Você pode revisar o documento ao lado ou inserir manualmente.',
      error: 'Dispositivo offline (navigator.onLine === false).',
      confirmationReason: 'Dispositivo offline. Revise o documento ao lado ou insira os lançamentos manualmente.',
    });
  }

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, CLIENT_OCR_TIMEOUT_MS);

  const forwardAbort = () => timeoutController.abort();
  if (params.signal) {
    if (params.signal.aborted) {
      clearTimeout(timeoutHandle);
      throw new Error('PROCESSAMENTO_CANCELADO');
    }
    params.signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const resp = await fetchImpl(`${apiBaseUrl}/api/ai/parse-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeoutController.signal,
      body: JSON.stringify({
        fileName: params.fileName,
        fileData: {
          mimeType: params.mimeType,
          base64: params.base64Data,
        },
        knownAccounts: params.knownAccounts.map((a) => ({
          institutionName: a.institutionName,
          accountName: a.accountName,
          entityId: a.entityId,
        })),
      }),
    });

    let data: RemoteOcrResponse | null = null;
    if (typeof resp.text === 'function') {
      const rawText = await resp.text();
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText) as RemoteOcrResponse;
        } catch {
          data = null;
        }
      }
    } else if (typeof (resp as unknown as { json?: () => Promise<RemoteOcrResponse> }).json === 'function') {
      data = await (resp as unknown as { json: () => Promise<RemoteOcrResponse> })
        .json()
        .catch(() => null);
    }

    if (!resp.ok || !data || !Array.isArray(data.transactions)) {
      let msg = data?.error;
      if (!msg) {
        if (resp.status === 413) {
          msg =
            'O documento excedeu o limite de tamanho aceito pelo serviço de OCR. Reduza o arquivo, envie páginas em imagem ou insira manualmente.';
        } else if (resp.status === 504 || resp.status === 502 || resp.status === 408) {
          msg =
            'O serviço de OCR demorou mais que o esperado para responder. Tente um arquivo menor/mais nítido ou insira os lançamentos manualmente.';
        } else if (resp.status === 401 || resp.status === 403) {
          msg = 'Acesso não autorizado ao serviço de OCR. Revise o documento ao lado ou insira manualmente.';
        } else if (resp.status === 429) {
          msg = 'Muitas solicitações ao serviço de OCR em sequência. Aguarde alguns segundos e tente novamente.';
        } else if (resp.status === 503) {
          msg = 'Serviço de OCR temporariamente indisponível no servidor. Você pode revisar ou inserir manualmente.';
        } else {
          msg =
            'Não foi possível extrair os dados automaticamente via OCR. Nenhum valor foi inventado — revise o documento ao lado ou insira manualmente.';
        }
      }

      return buildRemoteOcrErrorPayload({
        format: params.format,
        fileName: params.fileName,
        warning: msg,
        error: data?.error || `Falha HTTP ${resp.status} ao analisar documento via OCR.`,
        confirmationReason: msg,
      });
    }

    const warnings: string[] = [];
    const rows: ParseResultPayload['rows'] = [];

    for (const item of data.transactions) {
      const conf = typeof item.confidence === 'number' ? item.confidence : 0.7;
      const amtNum = Number(item.amount || 0);
      if (!Number.isFinite(amtNum) || amtNum <= 0) {
        warnings.push(
          `Item "${item.description || 'sem descrição'}" apresentou valor ilegível (R$ 0,00) e exige correção manual.`
        );
      }

      const signedAmt = item.direction === 'EXPENSE' ? -Math.abs(amtNum) : Math.abs(amtNum);
      rows.push({
        date: parseFlexibleDate(item.date) || '',
        description: sanitizeExtractedText(item.description || 'Item OCR', 220),
        amountSignedCents: Math.round(signedAmt * 100) as MoneyCents,
        currency: 'BRL',
        bankTransactionId: item.externalId ? sanitizeExtractedText(item.externalId, 100) : undefined,
        counterparty: item.counterparty ? sanitizeExtractedText(item.counterparty, 120) : undefined,
        rawOperationHint: item.operationType,
        rawRowSnapshot: sanitizeRawRowSnapshot(item as unknown as Record<string, unknown>),
        confidence: conf,
        doubtReason:
          conf < 0.75 || amtNum <= 0
            ? item.confidenceNote ||
              'Baixa nitidez/confiança na leitura OCR; revise o documento original lado a lado.'
            : item.confidenceNote || undefined,
      });
    }

    if (rows.length === 0) {
      warnings.push(
        'Documento ilegível ou sem movimentações visíveis. Tente enviar outra imagem mais nítida ou insira os itens manualmente.'
      );
    }

    const detectedFromFile = detectBankFromStatement('', params.fileName);

    return {
      format: params.format,
      parseSource: 'OCR_IA',
      identifiedAccount: {
        bankName:
          detectedFromFile.type !== 'desconhecido' && detectedFromFile.name
            ? detectedFromFile.name
            : params.fileName.replace(/\.(pdf|jpg|jpeg|png|webp)$/i, ''),
        bankCode: detectedFromFile.code,
        bankIspb: detectedFromFile.ispb,
        bankType: detectedFromFile.type,
        detectionConfidence: detectedFromFile.confidence,
        institutionId: detectedFromFile.institutionId,
        institutionCategory:
          detectedFromFile.type === 'fisico'
            ? 'BANCO_FISICO'
            : detectedFromFile.type === 'digital'
              ? 'BANCO_DIGITAL'
              : undefined,
        requiresConfirmation: true,
        confirmationReason: 'Revise os dados lidos comparando com o documento original antes de aprovar.',
      },
      warnings,
      errors: [],
      requiresManualReview: true,
      rows,
    };
  } catch (err) {
    if (params.signal?.aborted) {
      throw new Error('PROCESSAMENTO_CANCELADO');
    }
    if (timedOut) {
      return buildRemoteOcrErrorPayload({
        format: params.format,
        fileName: params.fileName,
        warning:
          'Tempo limite excedido ao aguardar o serviço de OCR. Tente um arquivo menor/mais nítido ou insira os lançamentos manualmente.',
        error: 'Timeout do cliente ao aguardar /api/ai/parse-document.',
        confirmationReason: 'Tempo limite excedido no OCR. Revise o documento ao lado ou insira manualmente.',
      });
    }
    return buildRemoteOcrErrorPayload({
      format: params.format,
      fileName: params.fileName,
      warning:
        'Sem conexão com o serviço de OCR no momento. Você pode revisar o documento ao lado ou inserir manualmente.',
      error: err instanceof Error ? err.message : 'Erro de rede no OCR.',
      confirmationReason:
        'Sem conexão com o serviço de OCR. Você pode revisar o documento ao lado ou inserir manualmente.',
    });
  } finally {
    clearTimeout(timeoutHandle);
    if (params.signal) {
      params.signal.removeEventListener('abort', forwardAbort);
    }
  }
}
