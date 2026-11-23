import type { MoneyCents } from '../../money/money';
import type { CsvColumnMapping, ParseResultPayload } from '../../../types/extractions';
import {
  detectTaxDocumentNature,
  sanitizeExtractedText,
  sanitizeRawRowSnapshot,
} from '../fileSecurity';
import { detectBankFromStatement } from '../banksRepository';

export function splitCsvLine(line: string, delimiter: ';' | ',' | '\t'): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function detectCsvDelimiter(lines: string[]): ';' | ',' | '\t' {
  const sample = lines.slice(0, Math.min(8, lines.length));
  const counts: Record<';' | ',' | '\t', number> = { ';': 0, ',': 0, '\t': 0 };
  for (const line of sample) {
    counts[';'] += splitCsvLine(line, ';').length - 1;
    counts[','] += splitCsvLine(line, ',').length - 1;
    counts['\t'] += splitCsvLine(line, '\t').length - 1;
  }
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';';
  if (counts['\t'] >= counts[','] && counts['\t'] > 0) return '\t';
  return ',';
}

export function parseFlexibleDate(raw?: string): string | undefined {
  const s = (raw || '').trim();
  if (!s) return undefined;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  const br = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (br) {
    const d = br[1].padStart(2, '0');
    const m = br[2].padStart(2, '0');
    const yRaw = br[3];
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  return undefined;
}

export function parseFlexibleSignedAmount(raw?: string): number | undefined {
  let s = (raw || '').trim();
  if (!s) return undefined;

  let isNegative = false;
  if (/^\(.*\)$/.test(s)) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }
  if (/[Dd]$/.test(s) && !/USD|CAD|AUD|BRL/i.test(s)) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  } else if (/[Cc]$/.test(s)) {
    s = s.slice(0, -1).trim();
  }

  s = s.replace(/R\$|US\$|BRL|USD|EUR|€/gi, '').replace(/\s+/g, '');
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return undefined;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let normalized = s;
  if (lastComma > lastDot) {
    // Brazilian style: 1.234,56
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US style: 1,234.56 or 1234.56
    normalized = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    normalized = s.replace(',', '.');
  }

  const val = Number(normalized);
  if (!Number.isFinite(val)) return undefined;
  return isNegative ? -Math.abs(val) : val;
}

export function inferColumnMappingFromHeaders(headers: string[], delimiter: ';' | ',' | '\t'): CsvColumnMapping {
  const norm = headers.map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  );

  const findIdx = (patterns: RegExp[]) =>
    norm.findIndex((h) => patterns.some((p) => p.test(h)));

  const dateCol = Math.max(0, findIdx([/data/, /date/, /dt/, /venc/, /lancamento/]));
  let descriptionCol = findIdx([/desc/, /hist/, /memo/, /titulo/, /estabelec/, /detalhe/]);
  if (descriptionCol < 0) descriptionCol = Math.min(1, Math.max(0, headers.length - 1));

  const debitColIdx = findIdx([/^debito$/, /saida/, /valor debit/]);
  const creditColIdx = findIdx([/^credito$/, /entrada/, /valor credit/]);
  let amountCol = findIdx([/valor/, /amount/, /quantia/, /montante/, /total/, /liquido/]);
  if (amountCol < 0 && headers.length > 2) amountCol = headers.length - 1;

  const counterpartyColIdx = findIdx([/favorec/, /pagador/, /destin/, /origem/, /contra/, /merchant/]);
  const balanceColIdx = findIdx([/saldo/, /balance/]);
  const idColIdx = findIdx([/fitid/, /^id$/, /identific/, /codigo/, /e2e/, /txhash/, /nsu/]);
  const currencyColIdx = findIdx([/^moeda$/, /^currency$/, /divisa/]);

  return {
    hasHeader: true,
    delimiter,
    dateCol,
    descriptionCol,
    amountCol: Math.max(0, amountCol),
    debitCol: debitColIdx >= 0 ? debitColIdx : undefined,
    creditCol: creditColIdx >= 0 ? creditColIdx : undefined,
    counterpartyCol: counterpartyColIdx >= 0 ? counterpartyColIdx : undefined,
    balanceCol: balanceColIdx >= 0 ? balanceColIdx : undefined,
    idCol: idColIdx >= 0 ? idColIdx : undefined,
    currencyCol: currencyColIdx >= 0 ? currencyColIdx : undefined,
  };
}

export function parseCsvStatement(
  rawText: string,
  fileName = '',
  explicitMapping?: CsvColumnMapping
): ParseResultPayload {
  const warnings: string[] = [];
  const errors: string[] = [];

  const allLines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (allLines.length === 0) {
    return {
      format: 'CSV',
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true, confirmationReason: 'Arquivo CSV vazio.' },
      warnings,
      errors: ['O arquivo CSV está vazio.'],
      requiresManualReview: true,
      rows: [],
    };
  }

  // Skip leading metadata lines (e.g. Banco / Conta / CPF headers before table header)
  const docMatch = rawText.match(/\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/);
  const docInfo = docMatch ? detectTaxDocumentNature(docMatch[1]) : undefined;

  const delimiter = explicitMapping?.delimiter || detectCsvDelimiter(allLines);
  let headerIdx = 0;
  for (let i = 0; i < Math.min(8, allLines.length); i++) {
    const cols = splitCsvLine(allLines[i], delimiter);
    if (cols.length >= 3 && cols.some((c) => /data|date|valor|desc|hist/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = splitCsvLine(allLines[headerIdx], delimiter);
  const mapping = explicitMapping || inferColumnMappingFromHeaders(headers, delimiter);
  const startRow = mapping.hasHeader ? headerIdx + 1 : 0;

  const rows: ParseResultPayload['rows'] = [];
  let minDate: string | undefined;
  let maxDate: string | undefined;
  let lastBalance: number | undefined;
  let firstBalance: number | undefined;

  for (let i = startRow; i < allLines.length; i++) {
    const cols = splitCsvLine(allLines[i], delimiter);
    if (cols.length < 2) continue;

    const rawDate = cols[mapping.dateCol];
    const parsedDate = parseFlexibleDate(rawDate);
    if (!parsedDate) {
      // Check if it's a summary / saldo line
      const joined = cols.join(' ');
      if (/saldo\s*(anterior|inicial)/i.test(joined)) {
        const b = parseFlexibleSignedAmount(cols[cols.length - 1]);
        if (b !== undefined) firstBalance = b;
      } else if (/saldo\s*(final|atual|total)/i.test(joined)) {
        const b = parseFlexibleSignedAmount(cols[cols.length - 1]);
        if (b !== undefined) lastBalance = b;
      }
      continue;
    }

    let amt: number | undefined;
    if (mapping.creditCol !== undefined || mapping.debitCol !== undefined) {
      const credit = mapping.creditCol !== undefined ? parseFlexibleSignedAmount(cols[mapping.creditCol]) : undefined;
      const debit = mapping.debitCol !== undefined ? parseFlexibleSignedAmount(cols[mapping.debitCol]) : undefined;
      if (credit && credit !== 0) amt = Math.abs(credit);
      else if (debit && debit !== 0) amt = -Math.abs(debit);
    }
    if (amt === undefined) {
      amt = parseFlexibleSignedAmount(cols[mapping.amountCol]);
    }
    if (amt === undefined || amt === 0) continue;

    const desc = sanitizeExtractedText(cols[mapping.descriptionCol] || 'Movimento CSV', 220);
    if (/^saldo\s*(anterior|do dia|final)/i.test(desc)) {
      if (mapping.balanceCol !== undefined) {
        const bal = parseFlexibleSignedAmount(cols[mapping.balanceCol]);
        if (bal !== undefined) lastBalance = bal;
      }
      continue;
    }

    if (mapping.balanceCol !== undefined) {
      const bal = parseFlexibleSignedAmount(cols[mapping.balanceCol]);
      if (bal !== undefined) {
        if (firstBalance === undefined) firstBalance = bal - amt;
        lastBalance = bal;
      }
    }

    const signedCents = Math.round(amt * 100) as MoneyCents;
    if (!minDate || parsedDate < minDate) minDate = parsedDate;
    if (!maxDate || parsedDate > maxDate) maxDate = parsedDate;

    const rawObj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rawObj[h || `col_${idx + 1}`] = cols[idx] ?? '';
    });

    const rowCurrency =
      mapping.currencyCol !== undefined
        ? sanitizeExtractedText(cols[mapping.currencyCol] || '', 10).toUpperCase() || 'BRL'
        : 'BRL';

    rows.push({
      date: parsedDate,
      description: desc,
      amountSignedCents: signedCents,
      currency: rowCurrency,
      bankTransactionId: mapping.idCol !== undefined ? sanitizeExtractedText(cols[mapping.idCol] || '', 100) || undefined : undefined,
      counterparty:
        mapping.counterpartyCol !== undefined
          ? sanitizeExtractedText(cols[mapping.counterpartyCol] || '', 120) || undefined
          : undefined,
      rawRowSnapshot: sanitizeRawRowSnapshot(rawObj),
      confidence: 0.9,
    });
  }

  if (rows.length === 0) {
    warnings.push('Nenhuma linha financeira válida foi extraída. Ajuste o mapeamento de colunas abaixo.');
  }

  const sampleRows = allLines
    .slice(startRow, startRow + 6)
    .map((l) => splitCsvLine(l, delimiter));

  const headerSample = allLines.slice(0, 15).join('\n');
  const detectedBank = detectBankFromStatement(headerSample, fileName);

  return {
    format: 'CSV',
    parseSource: 'LOCAL',
    identifiedAccount: {
      bankName:
        detectedBank.type !== 'desconhecido' && detectedBank.name
          ? detectedBank.name
          : fileName
            ? fileName.replace(/\.csv$/i, '')
            : undefined,
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
      currency: 'BRL',
      requiresConfirmation: true,
      confirmationReason: 'Confirme a instituição, titularidade CPF/CNPJ e conta do extrato CSV.',
    },
    periodStart: minDate,
    periodEnd: maxDate,
    openingBalanceCents:
      firstBalance !== undefined ? (Math.round(firstBalance * 100) as MoneyCents) : undefined,
    reportedEndingBalanceCents:
      lastBalance !== undefined ? (Math.round(lastBalance * 100) as MoneyCents) : undefined,
    warnings,
    errors,
    requiresManualReview: rows.length === 0 || warnings.length > 0,
    rows,
    tabularPreview: {
      headers,
      sampleRows,
      detectedMapping: mapping,
    },
  };
}
