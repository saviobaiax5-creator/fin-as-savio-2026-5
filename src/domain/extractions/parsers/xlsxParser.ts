import * as XLSX from 'xlsx';
import type { MoneyCents } from '../../money/money';
import type { CsvColumnMapping, ParseResultPayload } from '../../../types/extractions';
import {
  detectTaxDocumentNature,
  sanitizeExtractedText,
  sanitizeRawRowSnapshot,
} from '../fileSecurity';
import {
  inferColumnMappingFromHeaders,
  parseFlexibleDate,
  parseFlexibleSignedAmount,
} from './csvParser';
import { sanitizeCellForSheet } from '../../../utils/sheetGuard';
import { detectBankFromStatement } from '../banksRepository';

function excelDateToIso(val: unknown): string | undefined {
  if (typeof val === 'number' && Number.isFinite(val) && val > 25000 && val < 80000) {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return parseFlexibleDate(String(val ?? ''));
}

export function parseSpreadsheetStatement(
  buffer: ArrayBuffer,
  fileName = '',
  selectedSheetName?: string,
  explicitMapping?: CsvColumnMapping
): ParseResultPayload {
  const format = fileName.toLowerCase().endsWith('.xls') ? 'XLS' : 'XLSX';
  const warnings: string[] = [];
  const errors: string[] = [];

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellFormula: false,
      cellHTML: false,
      bookVBA: false,
    });
  } catch (err) {
    return {
      format,
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true },
      warnings,
      errors: [err instanceof Error ? err.message : 'Falha ao abrir planilha.'],
      requiresManualReview: true,
      rows: [],
    };
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return {
      format,
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true },
      warnings,
      errors: ['Nenhuma aba encontrada na planilha.'],
      requiresManualReview: true,
      rows: [],
    };
  }

  const chosenSheet =
    selectedSheetName && sheetNames.includes(selectedSheetName) ? selectedSheetName : sheetNames[0];
  const sheet = workbook.Sheets[chosenSheet];
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  });

  const nonEmptyRows = rawMatrix
    .map((r) =>
      (Array.isArray(r) ? r : []).map((cell) => {
        if (typeof cell === 'number') return cell;
        return String(sanitizeCellForSheet(cell == null ? '' : String(cell))).replace(/^'/, '');
      })
    )
    .filter((r) => r.some((cell) => String(cell).trim() !== ''));

  if (nonEmptyRows.length === 0) {
    return {
      format,
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true },
      warnings: [`A aba "${chosenSheet}" não possui linhas preenchidas.`],
      errors,
      requiresManualReview: true,
      rows: [],
      tabularPreview: {
        sheetNames,
        selectedSheet: chosenSheet,
        headers: [],
        sampleRows: [],
      },
    };
  }

  const allTextSample = nonEmptyRows
    .slice(0, 15)
    .map((r) => r.join(' '))
    .join('\n');
  const docMatch = allTextSample.match(
    /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/
  );
  const docInfo = docMatch ? detectTaxDocumentNature(docMatch[1]) : undefined;

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, nonEmptyRows.length); i++) {
    const strCols = nonEmptyRows[i].map((c) => String(c));
    if (strCols.length >= 3 && strCols.some((c) => /data|date|valor|desc|hist|ativo/i.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = nonEmptyRows[headerIdx].map((c, idx) => String(c || `Coluna ${idx + 1}`).trim());
  const mapping = explicitMapping || inferColumnMappingFromHeaders(headers, ';');
  const startRow = mapping.hasHeader ? headerIdx + 1 : 0;

  const rows: ParseResultPayload['rows'] = [];
  let minDate: string | undefined;
  let maxDate: string | undefined;
  let lastBalance: number | undefined;
  let firstBalance: number | undefined;

  for (let i = startRow; i < nonEmptyRows.length; i++) {
    const rowArr = nonEmptyRows[i];
    if (rowArr.length < 2) continue;

    const dateIso = excelDateToIso(rowArr[mapping.dateCol]);
    if (!dateIso) {
      const joined = rowArr.join(' ');
      if (/saldo\s*(anterior|inicial)/i.test(joined)) {
        const bal = parseFlexibleSignedAmount(String(rowArr[rowArr.length - 1] ?? ''));
        if (bal !== undefined) firstBalance = bal;
      } else if (/saldo\s*(final|atual)/i.test(joined)) {
        const bal = parseFlexibleSignedAmount(String(rowArr[rowArr.length - 1] ?? ''));
        if (bal !== undefined) lastBalance = bal;
      }
      continue;
    }

    let amt: number | undefined;
    if (mapping.creditCol !== undefined || mapping.debitCol !== undefined) {
      const creditCell = mapping.creditCol !== undefined ? rowArr[mapping.creditCol] : undefined;
      const debitCell = mapping.debitCol !== undefined ? rowArr[mapping.debitCol] : undefined;
      const creditVal =
        typeof creditCell === 'number'
          ? creditCell
          : parseFlexibleSignedAmount(String(creditCell ?? ''));
      const debitVal =
        typeof debitCell === 'number'
          ? debitCell
          : parseFlexibleSignedAmount(String(debitCell ?? ''));
      if (creditVal && creditVal !== 0) amt = Math.abs(creditVal);
      else if (debitVal && debitVal !== 0) amt = -Math.abs(debitVal);
    }

    if (amt === undefined) {
      const amtCell = rowArr[mapping.amountCol];
      amt =
        typeof amtCell === 'number' ? amtCell : parseFlexibleSignedAmount(String(amtCell ?? ''));
    }

    if (amt === undefined || !Number.isFinite(amt) || amt === 0) continue;

    const desc = sanitizeExtractedText(String(rowArr[mapping.descriptionCol] || 'Movimento Planilha'), 220);
    if (/^saldo\s*(anterior|do dia|final)/i.test(desc)) continue;

    if (mapping.balanceCol !== undefined) {
      const bCell = rowArr[mapping.balanceCol];
      const bal = typeof bCell === 'number' ? bCell : parseFlexibleSignedAmount(String(bCell ?? ''));
      if (bal !== undefined) {
        if (firstBalance === undefined) firstBalance = bal - amt;
        lastBalance = bal;
      }
    }

    const signedCents = Math.round(amt * 100) as MoneyCents;
    if (!minDate || dateIso < minDate) minDate = dateIso;
    if (!maxDate || dateIso > maxDate) maxDate = dateIso;

    const rawObj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      rawObj[h] = rowArr[idx] ?? '';
    });

    rows.push({
      date: dateIso,
      description: desc,
      amountSignedCents: signedCents,
      currency: 'BRL',
      bankTransactionId:
        mapping.idCol !== undefined
          ? sanitizeExtractedText(String(rowArr[mapping.idCol] ?? ''), 100) || undefined
          : undefined,
      counterparty:
        mapping.counterpartyCol !== undefined
          ? sanitizeExtractedText(String(rowArr[mapping.counterpartyCol] ?? ''), 120) || undefined
          : undefined,
      rawRowSnapshot: sanitizeRawRowSnapshot(rawObj),
      confidence: 0.9,
    });
  }

  if (sheetNames.length > 1) {
    warnings.push(
      `Planilha com ${sheetNames.length} abas (${sheetNames.join(', ')}). Exibindo aba "${chosenSheet}".`
    );
  }

  const detectedBank = detectBankFromStatement(allTextSample, fileName);

  return {
    format,
    parseSource: 'LOCAL',
    identifiedAccount: {
      bankName:
        detectedBank.type !== 'desconhecido' && detectedBank.name
          ? detectedBank.name
          : fileName
            ? fileName.replace(/\.(xlsx|xls)$/i, '')
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
      confirmationReason: 'Confirme a aba selecionada, instituição e conta vinculada.',
    },
    periodStart: minDate,
    periodEnd: maxDate,
    openingBalanceCents:
      firstBalance !== undefined ? (Math.round(firstBalance * 100) as MoneyCents) : undefined,
    reportedEndingBalanceCents:
      lastBalance !== undefined ? (Math.round(lastBalance * 100) as MoneyCents) : undefined,
    warnings,
    errors,
    requiresManualReview: rows.length === 0 || sheetNames.length > 1,
    rows,
    tabularPreview: {
      sheetNames,
      selectedSheet: chosenSheet,
      headers,
      sampleRows: nonEmptyRows
        .slice(startRow, startRow + 6)
        .map((r) => r.map((c) => String(c))),
      detectedMapping: mapping,
    },
  };
}
