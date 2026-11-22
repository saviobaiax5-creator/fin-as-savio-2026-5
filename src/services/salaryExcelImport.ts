import * as XLSX from 'xlsx';
import type {
  SalaryCategory,
  SalaryImportResult,
  SalaryRecord,
  SalarySource,
} from '../types/salary';
import { formatReferenceMonth } from '../utils/salaryCalculations';
import { generateEntityId } from '../domain/common/id';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const MONTHS_ASCII = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const EXCEL_ERROR_TOKENS = ['#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#N/A', '#NUM!', '#NULL!'];

function createId(): string {
  return generateEntityId('sal');
}

export function classifySource(name: string): SalaryCategory {
  const value = name.toLowerCase();

  if (value.includes('empréstimo') || value.includes('emprestimo')) return 'loan';

  if (value.includes('13º') || value.includes('13o') || value.includes('decimo') || value.includes('décimo')) {
    return 'thirteenth';
  }

  if (value.includes('férias') || value.includes('ferias')) {
    return 'vacation';
  }

  if (value.includes('fgts')) return 'fgts';

  if (value.includes('vale') || value.includes('pis') || value.includes('abono')) {
    return 'benefit';
  }

  if (
    value.includes('unip') ||
    value.includes('unigrande') ||
    value.includes('cei') ||
    value.includes('soter')
  ) {
    return 'teaching';
  }

  if (
    value.includes('extra') ||
    value.includes('pré projeto') ||
    value.includes('pre projeto') ||
    value.includes('pré-projeto') ||
    value.includes('pre-projeto') ||
    value.includes('aprender')
  ) {
    return 'occasional';
  }

  if (value.includes('best pix') || value.includes('recarga') || value.includes('celcoin')) {
    return 'credit';
  }

  if (
    value.includes('câmara') ||
    value.includes('camara') ||
    value.includes('senar') ||
    value.includes('salário') ||
    value.includes('salario')
  ) {
    return 'salary';
  }

  return 'other';
}

export function normalizeExcelAmount(
  value: unknown
): { amount: number | null; warning?: string } {
  if (value === null || value === undefined || value === '') {
    return { amount: null };
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? { amount: value } : { amount: null };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return { amount: null };

    if (EXCEL_ERROR_TOKENS.some((err) => trimmed.toUpperCase().includes(err))) {
      return {
        amount: null,
        warning: `Célula com erro de fórmula preservada sem alteração (${trimmed}).`,
      };
    }

    if (/^#+$/.test(trimmed)) {
      return {
        amount: null,
        warning: 'Célula exibida apenas como ###### sem valor numérico subjacente.',
      };
    }

    // Ignore plain percentage strings so ratios aren't imported as currency
    if (trimmed.endsWith('%')) {
      return {
        amount: null,
        warning: `Célula percentual ignorada (${trimmed}).`,
      };
    }

    // Handle BR vs US formatted number strings
    const cleaned = trimmed.replace(/R\$/gi, '').replace(/\s+/g, '');
    const normalized =
      cleaned.includes(',') && cleaned.includes('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.includes(',')
        ? cleaned.replace(',', '.')
        : cleaned;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? { amount: parsed } : { amount: null };
  }

  return { amount: null };
}

function normalizeHeaderMonth(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Importa exclusivamente o bloco salarial A1:O24 da aba Planilha1:
 * - Lê somente colunas A:N (ignora coluna O de total anual e demais tabelas à direita/abaixo)
 * - Preserva células vazias como ausentes (não grava como 0)
 * - Inicia registros com status "unknown" para revisão explícita antes de consolidar
 */
export async function importSalaryExcelFromArrayBuffer(
  buffer: ArrayBuffer
): Promise<SalaryImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: true,
    cellText: true,
  });

  const sheet = workbook.Sheets['Planilha1'];
  if (!sheet) {
    throw new Error('A aba Planilha1 não foi encontrada.');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const header = rows[0];
  const parsedYear = Number(header?.[1]);
  if (
    !header ||
    !Number.isInteger(parsedYear) ||
    parsedYear < 2000 ||
    parsedYear > 2100
  ) {
    throw new Error('Não foi possível identificar o ano na tabela salarial.');
  }

  for (let i = 0; i < 12; i++) {
    const monthName = normalizeHeaderMonth(header[i + 2]);
    if (monthName !== MONTHS[i] && stripAccents(monthName) !== MONTHS_ASCII[i]) {
      throw new Error(`Cabeçalho incorreto na coluna ${i + 3}: esperado ${MONTHS[i]}.`);
    }
  }

  const nowIso = new Date().toISOString();
  const sources: SalarySource[] = [];
  const records: SalaryRecord[] = [];
  const seenSourceNames = new Map<string, string>();

  // Linhas 2 até 24 do Excel -> Índices 1 até 23
  for (let rowIndex = 1; rowIndex <= 23; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;

    const sourceName = String(row[0] ?? '').trim();
    if (!sourceName) continue;

    // Skip explicit summary/total rows if present inside A2:A24
    const normalizedName = sourceName.toLowerCase();
    if (
      normalizedName === 'total' ||
      normalizedName === 'total geral' ||
      normalizedName === 'soma' ||
      normalizedName.startsWith('total ')
    ) {
      warnings.push(`Linha de total ignorada na importação (${sourceName}, linha ${rowIndex + 1}).`);
      continue;
    }

    let sourceId = seenSourceNames.get(normalizedName);
    if (!sourceId) {
      sourceId = createId();
      seenSourceNames.set(normalizedName, sourceId);
      sources.push({
        id: sourceId,
        name: sourceName,
        institution: sourceName,
        category: classifySource(sourceName),
        paymentFrequency:
          classifySource(sourceName) === 'occasional' ||
          classifySource(sourceName) === 'thirteenth' ||
          classifySource(sourceName) === 'vacation'
            ? 'occasional'
            : 'monthly',
        active: true,
        startDate: `${parsedYear}-01-01`,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // Colunas C:N (índices 2..13) -> 12 meses; Coluna O (índice 14) é ignorada de propósito.
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: monthIndex + 2 });
      const cellObj = sheet[cellAddress];
      const cellNumFmt = typeof cellObj?.z === 'string' ? cellObj.z : '';
      const originalValue = row[monthIndex + 2];

      if (
        cellNumFmt.includes('%') &&
        typeof originalValue === 'number' &&
        originalValue >= 0 &&
        originalValue <= 1
      ) {
        warnings.push(
          `Percentual ignorado (${sourceName}, ${MONTHS[monthIndex]}: ${(originalValue * 100).toFixed(1)}%).`
        );
        continue;
      }

      const { amount, warning } = normalizeExcelAmount(originalValue);
      if (warning) {
        warnings.push(`${sourceName} (${MONTHS[monthIndex]}): ${warning}`);
      }

      if (amount === null) continue;

      if (amount < 0) {
        warnings.push(`Valor negativo: ${sourceName}, ${MONTHS[monthIndex]}.`);
      }

      const monthNum = monthIndex + 1;
      records.push({
        id: createId(),
        sourceId,
        year: parsedYear,
        month: monthNum,
        referenceMonth: formatReferenceMonth(parsedYear, monthNum),
        amount,
        status: 'unknown',
        origin: 'excel',
        sourceRow: rowIndex + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  if (sources.length === 0) {
    errors.push('Nenhuma fonte de renda foi encontrada.');
  }

  return {
    year: parsedYear,
    sources,
    records,
    warnings,
    errors,
  };
}

export async function importSalaryExcel(file: File): Promise<SalaryImportResult> {
  const MAX_EXCEL_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_EXCEL_BYTES) {
    throw new Error('O arquivo Excel excede o limite de 15 MB.');
  }
  const buffer = await file.arrayBuffer();
  return importSalaryExcelFromArrayBuffer(buffer);
}
