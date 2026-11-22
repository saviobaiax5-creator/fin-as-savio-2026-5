import { cents, parseSignedMoneyInput, type MoneyCents } from '../money/money';
import { minimizeAndMaskNotificationText } from '../../core/security/notificationCrypto';
import { formatDateIsoLocal } from '../../utils/dateUtils';
import { resolveInstitutionFromPackage } from './bankRegistry';
import type { ParsedNotificationData, RawNotificationEvent } from './notification.types';

const HIDDEN_CONTENT_PATTERNS = [
  /conte[uú]do\s+oculto/i,
  /notifica[cç][aã]o\s+oculta/i,
  /mensagens?\s+ocultas?/i,
  /desbloqueie\s+(?:o\s+)?(?:celular|aparelho|dispositivo)/i,
  /sensitive\s+notification\s+content\s+hidden/i,
  /contents?\s+hidden/i,
  /novas?\s+notifica[cç][õo]es?/i,
];

const DECLINED_PATTERNS = [
  /\bcompra\s+(?:n[aã]o\s+autorizada|recusada|negada|bloqueada)\b/i,
  /\btransa[cç][aã]o\s+(?:n[aã]o\s+autorizada|recusada|negada|falhou|bloqueada)\b/i,
  /\bpix\s+(?:n[aã]o\s+conclu[ií]do|recusado|falhou|cancelado\s+por\s+falha)\b/i,
  /\bsaldo\s+insuficiente\b/i,
  /\bsenha\s+incorreta\b/i,
  /\bcart[aã]o\s+bloqueado\b/i,
  /\brecusad[ao]\b/i,
  /\bnegad[ao]\b/i,
  /\bn[aã]o\s+aprovad[ao]\b/i,
];

const NON_TRANSACTION_OTP_PATTERNS = [
  /\bc[oó]digo\s+(?:de\s+)?(?:verifica[cç][aã]o|seguran[cç]a|acesso)\b/i,
  /\btoken\s+(?:de\s+)?(?:acesso|seguran[cç]a)\b/i,
  /\bchave\s+de\s+seguran[cç]a\b/i,
  /\baprova[cç][aã]o\s+de\s+dispositivo\b/i,
];

function extractAmountCents(fullText: string): MoneyCents | null {
  // Prefer explicit BRL prefixed matches: R$ 1.234,56 or R$150,00 or R$ 150
  const brlRegex = /R\$\s*(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|-?\d+(?:,\d{1,2})|-?\d+(?:\.\d{2}))\b/gi;
  const matches = [...fullText.matchAll(brlRegex)];
  for (const m of matches) {
    const rawNum = m[1];
    try {
      const parsed = parseSignedMoneyInput(rawNum);
      if (parsed !== 0) {
        return cents(Math.abs(parsed));
      }
    } catch {
      // continue trying next match
    }
  }

  // Fallback for "valor de 150,00" or "no valor 89,90" without R$
  const noPrefixRegex = /\b(?:valor(?:\s+de)?|de|em)\s+(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\b/i;
  const m2 = fullText.match(noPrefixRegex);
  if (m2?.[1]) {
    try {
      const parsed = parseSignedMoneyInput(m2[1]);
      if (parsed > 0) return parsed;
    } catch {
      return null;
    }
  }

  return null;
}

function extractOccurredDate(
  fullText: string,
  receivedAt: number
): { date: string; source: 'EXTRACTED' | 'EVENT_TIMESTAMP' } {
  const eventDate = new Date(Number.isFinite(receivedAt) ? receivedAt : Date.now());
  const eventIso = formatDateIsoLocal(eventDate);

  // Explicit DD/MM/YYYY
  const fullDateMatch = fullText.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (fullDateMatch) {
    const day = Number(fullDateMatch[1]);
    const month = Number(fullDateMatch[2]);
    const year = Number(fullDateMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2100) {
      return {
        date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        source: 'EXTRACTED',
      };
    }
  }

  // DD/MM (assume event year)
  const shortDateMatch = fullText.match(/\b(\d{2})\/(\d{2})\b/);
  if (shortDateMatch) {
    const day = Number(shortDateMatch[1]);
    const month = Number(shortDateMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = eventDate.getFullYear();
      return {
        date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        source: 'EXTRACTED',
      };
    }
  }

  return { date: eventIso, source: 'EVENT_TIMESTAMP' };
}

function extractCardLast4(fullText: string): string | null {
  const m =
    fullText.match(/(?:final|terminado\s+em|cart[aã]o\s+(?:final\s+)?|[*•xX]{2,4}\s*)(\d{4})\b/i) ||
    fullText.match(/\*{4}\s*(\d{4})\b/);
  return m?.[1] || null;
}

function extractReferenceCode(fullText: string): string | null {
  // Pix E2E ID starts with E + 31 alnum chars, or NSU / Auth codes explicitly labeled
  const e2e = fullText.match(/\b(E\d{8}[a-zA-Z0-9]{10,24})\b/);
  if (e2e?.[1]) return e2e[1];

  const labeled = fullText.match(
    /\b(?:nsu|autoriza[cç][aã]o|autentica[cç][aã]o|comprovante|protocolo)\s*[:#-]?\s*([A-Z0-9-]{5,24})\b/i
  );
  return labeled?.[1] || null;
}

function extractInstallmentLabel(fullText: string): string | null {
  const m = fullText.match(/\bem\s+(\d{1,2})\s*x\b/i) || fullText.match(/\bparcela\s+(\d{1,2}\/\d{1,2})\b/i);
  if (!m?.[1]) return null;
  return m[1].includes('/') ? m[1] : `${m[1]}x`;
}

function cleanEntityName(raw: string): string | null {
  const cleaned = raw
    .replace(/\b(?:no\s+valor\s+de|no\s+cart[aã]o|cart[aã]o\s+final\s+\d{4}|com\s+cart[aã]o|via\s+pix|hoje|ontem)\b.*$/i, '')
    .replace(/\bR\$.*$/i, '')
    .replace(/^[\s:–—-]+|[\s.,:;–—-]+$/g, '')
    .trim();

  if (cleaned.length < 2 || cleaned.length > 80) return null;
  // Do not treat generic words as merchant
  if (/^(voc[eê]|sua\s+conta|seu\s+cart[aã]o|pix|compra|pagamento)$/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function extractMerchantOrCounterparty(title: string, body: string): string | null {
  const candidates = [body, `${title} ${body}`]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const patterns = [
    /\bcompra(?:\s+(?:aprovada|realizada|efetuada))?(?:\s+no\s+(?:cr[eé]dito|d[eé]bito|cart[aã]o(?:\s+de\s+(?:cr[eé]dito|d[eé]bito))?))?(?:\s+(?:aprovada|realizada|efetuada))?\s+(?:em|na|no)\s+(?!(?:cr[eé]dito|d[eé]bito|cart[aã]o|valor|app|aplicativo)\b)([^.;!\n]+)/i,
    /\bvoc[eê]\s+recebeu\s+(?:um\s+)?pix\s+de\s+([^.;!\n]+)/i,
    /\bpix\s+recebido\s+de\s+([^.;!\n]+)/i,
    /\bpix\s+(?:enviado|realizado|transferido)\s+para\s+([^.;!\n]+)/i,
    /\bvoc[eê]\s+(?:enviou|fez|transferiu)\s+(?:um\s+)?pix\s+para\s+([^.;!\n]+)/i,
    /\btransfer[eê]ncia\s+(?:recebida\s+de|enviada\s+para|para|de)\s+([^.;!\n]+)/i,
    /\bestorno(?:\s+recebido)?\s+(?:de|em|da|do)\s+([^.;!\n]+)/i,
    /\bpagamento(?:\s+de\s+boleto)?\s+(?:para|em|a)\s+([^.;!\n]+)/i,
  ];

  for (const text of candidates) {
    for (const regex of patterns) {
      const match = text.match(regex);
      if (match?.[1]) {
        const candidate = cleanEntityName(match[1]);
        if (candidate) return candidate;
      }
    }
  }

  return null;
}

/**
 * Deterministic Brazilian Portuguese financial notification parser.
 * Never fabricates amounts, dates, merchants, or institutions.
 */
export function parseBankNotification(event: RawNotificationEvent): ParsedNotificationData {
  const title = (event.title || '').trim();
  const body = (event.bigText || event.text || '').trim();
  const subText = (event.subText || '').trim();
  const fullText = [title, body, subText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const institutionName = resolveInstitutionFromPackage(event.packageName, event.appLabel);
  const warnings: string[] = [];

  const isHiddenContent =
    !fullText ||
    HIDDEN_CONTENT_PATTERNS.some((rx) => rx.test(fullText));

  if (isHiddenContent) {
    warnings.push('Conteúdo da notificação está oculto nas configurações de privacidade do Android.');
  }

  const isDeclined = DECLINED_PATTERNS.some((rx) => rx.test(fullText));
  if (isDeclined) {
    warnings.push('Transação recusada, negada ou não autorizada pelo banco.');
  }

  const isOtpOnly = NON_TRANSACTION_OTP_PATTERNS.some((rx) => rx.test(fullText));
  if (isOtpOnly) {
    warnings.push('Notificação aparenta ser código de segurança/token e não uma movimentação financeira.');
  }

  const amountCents = isHiddenContent ? null : extractAmountCents(fullText);
  if (!isHiddenContent && amountCents === null) {
    warnings.push('Nenhum valor monetário identificável foi encontrado na notificação.');
  }

  const { date: occurredDate, source: dateSource } = extractOccurredDate(fullText, event.receivedAt);
  const cardLast4 = extractCardLast4(fullText);
  const referenceCode = extractReferenceCode(fullText);
  const installmentLabel = extractInstallmentLabel(fullText);
  const merchantOrCounterparty = isHiddenContent
    ? null
    : extractMerchantOrCounterparty(title, body);

  let confidence = 0.25;
  if (institutionName) confidence += 0.2;
  if (amountCents !== null && amountCents > 0) confidence += 0.35;
  if (merchantOrCounterparty) confidence += 0.15;
  if (cardLast4 || referenceCode) confidence += 0.05;
  if (isHiddenContent || amountCents === null) confidence = Math.min(confidence, 0.3);
  if (isOtpOnly) confidence = 0.1;

  const sanitizedSummary = minimizeAndMaskNotificationText(
    body || title || 'Notificação bancária sem texto'
  );

  return {
    institutionName,
    amountCents,
    occurredDate,
    dateSource,
    merchantOrCounterparty,
    cardLast4,
    referenceCode,
    installmentLabel,
    isDeclined,
    isHiddenContent,
    sanitizedSummary,
    parseConfidence: Number(Math.min(1, Math.max(0, confidence)).toFixed(2)),
    warnings,
  };
}
