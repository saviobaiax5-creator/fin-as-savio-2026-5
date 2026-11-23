import type { Account, CreditCard, EntityId } from '../../types';
import type {
  AccountExtensionMeta,
  IdentifiedAccountInfo,
  InstitutionProfile,
} from '../../types/extractions';
import { maskAccountNumber } from './fileSecurity';
import { inferCategoryFromText, resolveInstitutionMatch } from './institutionRegistry';
import { findBankByCodeOrIspb } from './banksRepository';

export function identifySourceAccount(params: {
  extracted: IdentifiedAccountInfo;
  fileName: string;
  accounts: Account[];
  creditCards: CreditCard[];
  accountExtensions: AccountExtensionMeta[];
  institutions: InstitutionProfile[];
}): IdentifiedAccountInfo {
  const { extracted, fileName, accounts, creditCards, accountExtensions, institutions } = params;

  const matchedInstitution = resolveInstitutionMatch({
    bankCode: extracted.bankCode,
    bankNameHint: extracted.bankName,
    fileNameHint: fileName,
    catalog: institutions,
  });

  const extById = new Map(accountExtensions.map((e) => [e.id, e]));
  const activeAccounts = accounts.filter((a) => !a.archived);

  // Strict rule: do NOT infer holderNature (CPF vs CNPJ) from institution name or user name.
  // Only trust verified document digits extracted from statement.
  const verifiedNature: EntityId | undefined = extracted.documentValid
    ? extracted.holderNature
    : undefined;

  const isCardStatement =
    extracted.institutionCategory === 'CARTAO_CREDITO' ||
    /fatura|cartao|cart[aã]o|visa|master|elo/i.test(`${fileName} ${extracted.accountType || ''}`);

  let matchedCardId: string | undefined;
  let matchedAccountId: string | undefined;
  const candidateAccountIds: string[] = [];

  if (isCardStatement) {
    const instNameLower = (matchedInstitution?.commercialName || extracted.bankName || '').toLowerCase();
    const last4 = (extracted.maskedAccountNumber || '').replace(/\D/g, '').slice(-4);
    const matchingCards = creditCards.filter((c) => {
      const cardMatchInst = instNameLower && c.institutionName.toLowerCase().includes(instNameLower);
      const cardMatchLast4 = last4 && c.last4 === last4;
      const cardMatchNature = !verifiedNature || c.entityId === verifiedNature;
      return (cardMatchInst || cardMatchLast4) && cardMatchNature;
    });
    if (matchingCards.length === 1) {
      matchedCardId = matchingCards[0].id;
    }
  }

  // Match active bank/brokerage/wallet/exchange accounts
  const instTokens = [
    matchedInstitution?.commercialName,
    matchedInstitution?.name,
    extracted.bankName,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  const accountDigits = (extracted.maskedAccountNumber || '').replace(/\D/g, '');
  const accountLast4 = accountDigits.slice(-4);

  for (const acc of activeAccounts) {
    const ext = extById.get(acc.id);
    // Reject mismatched holder nature if verified document is present
    if (verifiedNature && acc.entityId !== verifiedNature) {
      continue;
    }

    const accInstLower = acc.institutionName.toLowerCase();
    const sameInstitution =
      (matchedInstitution && ext?.institutionId === matchedInstitution.id) ||
      instTokens.some((tok) => tok.length >= 3 && (accInstLower.includes(tok) || tok.includes(accInstLower)));

    const extLast4 = (ext?.maskedAccountNumber || '').replace(/\D/g, '').slice(-4);
    const sameNumber = Boolean(accountLast4 && extLast4 && accountLast4 === extLast4);

    if (sameNumber && sameInstitution) {
      candidateAccountIds.unshift(acc.id);
    } else if (sameInstitution) {
      candidateAccountIds.push(acc.id);
    }
  }

  if (candidateAccountIds.length === 1) {
    matchedAccountId = candidateAccountIds[0];
  }

  let confirmationReason = extracted.confirmationReason;
  if (!matchedAccountId && !matchedCardId) {
    if (candidateAccountIds.length > 1) {
      confirmationReason = `Encontradas ${candidateAccountIds.length} contas nesta instituição. Selecione manualmente qual conta recebeu este extrato.`;
    } else if (!verifiedNature) {
      confirmationReason =
        'Documento CPF/CNPJ ausente ou não validado no arquivo. Selecione a conta ou confirme se a titularidade é CPF ou CNPJ.';
    } else {
      confirmationReason =
        'Nenhuma conta cadastrada corresponde exatamente ao extrato. Associe a uma conta existente ou confirme um novo cadastro.';
    }
  }

  const repoMatch = findBankByCodeOrIspb(matchedInstitution?.code || extracted.bankCode);
  const resolvedBankType =
    extracted.bankType && extracted.bankType !== 'desconhecido'
      ? extracted.bankType
      : repoMatch?.tipo ??
        (matchedInstitution?.category === 'BANCO_FISICO'
          ? 'fisico'
          : matchedInstitution?.category === 'BANCO_DIGITAL'
            ? 'digital'
            : 'desconhecido');

  const inferredCategory =
    matchedInstitution?.category ||
    extracted.institutionCategory ||
    (resolvedBankType === 'fisico'
      ? 'BANCO_FISICO'
      : resolvedBankType === 'digital'
        ? 'BANCO_DIGITAL'
        : inferCategoryFromText(`${extracted.bankName || ''} ${fileName} ${extracted.accountType || ''}`));

  return {
    ...extracted,
    institutionId: matchedInstitution?.id || extracted.institutionId || repoMatch?.institutionId,
    bankName: matchedInstitution?.commercialName || repoMatch?.nome || extracted.bankName,
    bankCode: matchedInstitution?.code || repoMatch?.codigo || extracted.bankCode,
    bankIspb: extracted.bankIspb || repoMatch?.ispb,
    bankType: resolvedBankType,
    detectionConfidence:
      extracted.detectionConfidence ||
      (matchedInstitution || repoMatch ? 'alta' : 'baixa'),
    institutionCategory: inferredCategory,
    holderNature: verifiedNature,
    maskedAccountNumber: extracted.maskedAccountNumber
      ? maskAccountNumber(extracted.maskedAccountNumber)
      : undefined,
    matchedAccountId,
    matchedCardId,
    ambiguousCandidateAccountIds:
      candidateAccountIds.length > 1 ? candidateAccountIds : undefined,
    requiresConfirmation: true, // Always require confirmation before creating/modifying accounts
    confirmationReason,
  };
}
