import type { MoneyCents } from '../../money/money';
import type { ParseResultPayload } from '../../../types/extractions';
import {
  detectTaxDocumentNature,
  sanitizeExtractedText,
  sanitizeRawRowSnapshot,
} from '../fileSecurity';
import { parseFlexibleDate, parseFlexibleSignedAmount } from './csvParser';

function extractRecordArray(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) {
    return parsed.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'));
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const candidateKeys = [
      'transactions',
      'movimentacoes',
      'movements',
      'items',
      'lancamentos',
      'records',
      'entries',
      'operations',
    ];
    for (const k of candidateKeys) {
      if (Array.isArray(obj[k])) {
        return (obj[k] as unknown[]).filter(
          (x): x is Record<string, unknown> => Boolean(x && typeof x === 'object')
        );
      }
    }
  }
  return [];
}

export function parseJsonStatement(rawText: string, fileName = ''): ParseResultPayload {
  const warnings: string[] = [];
  const errors: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      format: 'JSON',
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true },
      warnings,
      errors: ['Arquivo JSON malformado.'],
      requiresManualReview: true,
      rows: [],
    };
  }

  const objRoot = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
  const records = extractRecordArray(parsed);

  if (records.length === 0) {
    warnings.push('Nenhuma movimentação encontrada na estrutura JSON.');
  }

  const docCandidate = String(objRoot.cpf || objRoot.cnpj || objRoot.documento || '');
  const docInfo = docCandidate ? detectTaxDocumentNature(docCandidate) : undefined;

  const rows: ParseResultPayload['rows'] = [];
  for (const rec of records) {
    const dateVal = parseFlexibleDate(
      String(rec.date || rec.data || rec.timestamp || rec.createdAt || '')
    );
    const rawAmount = rec.amount ?? rec.valor ?? rec.total ?? rec.netAmount ?? rec.value;
    const amtNum =
      typeof rawAmount === 'number'
        ? rawAmount
        : parseFlexibleSignedAmount(String(rawAmount ?? ''));

    if (!dateVal || amtNum === undefined || amtNum === 0) continue;

    const dirHint = String(rec.direction || rec.tipo || rec.type || '').toUpperCase();
    const signedAmt =
      amtNum > 0 && /EXPENSE|DEBIT|DEBITO|SAIDA|COMPRA|BUY|WITHDRAW/.test(dirHint)
        ? -Math.abs(amtNum)
        : amtNum;

    const currency = sanitizeExtractedText(String(rec.currency || rec.moeda || 'BRL'), 10).toUpperCase() || 'BRL';
    const desc = sanitizeExtractedText(
      String(rec.description || rec.descricao || rec.memo || rec.title || rec.asset || 'Movimento JSON'),
      220
    );

    const qty = typeof rec.quantity === 'number' ? rec.quantity : Number(rec.quantidade);
    const assetSym = rec.assetSymbol || rec.ativo || rec.symbol || rec.ticker;
    const txHash = rec.txHash || rec.hash;

    rows.push({
      date: dateVal,
      description: desc,
      amountSignedCents: Math.round(signedAmt * 100) as MoneyCents,
      currency,
      bankTransactionId:
        rec.externalId || rec.fitid || rec.id || txHash
          ? sanitizeExtractedText(String(rec.externalId || rec.fitid || rec.id || txHash), 120)
          : undefined,
      counterparty: rec.counterparty || rec.favorecido
        ? sanitizeExtractedText(String(rec.counterparty || rec.favorecido), 120)
        : undefined,
      rawOperationHint: dirHint || undefined,
      rawRowSnapshot: sanitizeRawRowSnapshot(rec),
      cryptoMeta:
        assetSym && Number.isFinite(qty) && qty > 0 && (rec.network || txHash || /BTC|ETH|SOL|USDT|USDC/i.test(String(assetSym)))
          ? {
              assetSymbol: String(assetSym).toUpperCase(),
              quantity: qty,
              network: rec.network ? String(rec.network) : undefined,
              txHash: txHash ? String(txHash) : undefined,
            }
          : undefined,
      confidence: 0.9,
    });
  }

  return {
    format: 'JSON',
    parseSource: 'LOCAL',
    identifiedAccount: {
      bankName: sanitizeExtractedText(String(objRoot.institution || objRoot.banco || objRoot.exchange || fileName.replace(/\.json$/i, '')), 80),
      maskedDocument: docInfo?.masked,
      documentValid: docInfo?.valid,
      holderNature: docInfo?.valid ? docInfo.nature : undefined,
      currency: sanitizeExtractedText(String(objRoot.currency || 'BRL'), 10) || 'BRL',
      requiresConfirmation: true,
    },
    warnings,
    errors,
    requiresManualReview: rows.length === 0,
    rows,
  };
}

export function parseXmlStatement(rawText: string, fileName = ''): ParseResultPayload {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Prevent DOCTYPE / ENTITY expansion risks before parsing
  if (/<!DOCTYPE|<!ENTITY/i.test(rawText)) {
    return {
      format: 'XML',
      parseSource: 'LOCAL',
      identifiedAccount: { requiresConfirmation: true },
      warnings,
      errors: ['Arquivo XML contém declarações externas não permitidas por segurança.'],
      requiresManualReview: true,
      rows: [],
    };
  }

  const itemBlocks = rawText.match(
    /<(movimento|movimentacao|transacao|transaction|lancamento|item|entry|negocio)\b[^>]*>[\s\S]*?<\/\1>/gi
  );
  if (!itemBlocks || itemBlocks.length === 0) {
    return {
      format: 'XML',
      parseSource: 'LOCAL',
      identifiedAccount: { bankName: fileName.replace(/\.xml$/i, ''), requiresConfirmation: true },
      warnings: ['Estrutura XML sem blocos de movimentação reconhecidos; revise manualmente.'],
      errors,
      requiresManualReview: true,
      rows: [],
    };
  }

  const extractTagVal = (xml: string, tags: string[]): string | undefined => {
    for (const tag of tags) {
      const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (m?.[1]) return sanitizeExtractedText(m[1], 200);
    }
    return undefined;
  };

  const rows: ParseResultPayload['rows'] = [];
  for (const block of itemBlocks) {
    const rawDate = extractTagVal(block, ['data', 'date', 'dt', 'dataMovimentacao', 'dataNegocio']);
    const parsedDate = parseFlexibleDate(rawDate);
    const rawAmt = extractTagVal(block, ['valor', 'amount', 'valorLiquido', 'total']);
    const amt = parseFlexibleSignedAmount(rawAmt);
    if (!parsedDate || amt === undefined || amt === 0) continue;

    const dirHint = (extractTagVal(block, ['tipo', 'natureza', 'operacao', 'type']) || '').toUpperCase();
    const signedAmt =
      amt > 0 && /D|DEBITO|SAIDA|COMPRA|EXPENSE/.test(dirHint) ? -Math.abs(amt) : amt;

    const desc =
      extractTagVal(block, ['descricao', 'historico', 'memo', 'titulo', 'especificacao']) ||
      'Movimento XML';
    const bankId = extractTagVal(block, ['id', 'codigo', 'fitid', 'protocolo', 'numero']);
    const counterparty = extractTagVal(block, ['favorecido', 'contraparte', 'pagador', 'emissor']);

    rows.push({
      date: parsedDate,
      description: desc,
      amountSignedCents: Math.round(signedAmt * 100) as MoneyCents,
      currency: (extractTagVal(block, ['moeda', 'currency']) || 'BRL').toUpperCase(),
      bankTransactionId: bankId,
      counterparty,
      rawOperationHint: dirHint || undefined,
      rawRowSnapshot: sanitizeRawRowSnapshot({
        date: parsedDate,
        description: desc,
        amount: signedAmt,
        bankTransactionId: bankId || '',
      }),
      confidence: 0.85,
    });
  }

  return {
    format: 'XML',
    parseSource: 'LOCAL',
    identifiedAccount: {
      bankName: fileName.replace(/\.xml$/i, ''),
      currency: 'BRL',
      requiresConfirmation: true,
    },
    warnings,
    errors,
    requiresManualReview: rows.length === 0,
    rows,
  };
}
