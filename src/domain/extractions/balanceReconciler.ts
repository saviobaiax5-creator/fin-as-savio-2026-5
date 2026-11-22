import { cents, addMoney, subtractMoney } from '../money/money';
import type { MoneyCents } from '../money/money';
import type { ExtractedMovement, StatementBalanceSummary } from '../../types/extractions';

export function computeStatementBalanceSummary(params: {
  movements: ExtractedMovement[];
  openingBalanceCents?: MoneyCents;
  reportedEndingBalanceCents?: MoneyCents;
  availableBalanceCents?: MoneyCents;
  blockedBalanceCents?: MoneyCents;
}): StatementBalanceSummary {
  const {
    movements,
    openingBalanceCents,
    reportedEndingBalanceCents,
    availableBalanceCents,
    blockedBalanceCents,
  } = params;

  let creditsCents = cents(0);
  let debitsCents = cents(0);
  let applicationsCents = cents(0);
  let redemptionsCents = cents(0);
  const notes: string[] = [];

  for (const m of movements) {
    if (m.reviewStatus === 'IGNORADO' || m.reviewStatus === 'DUPLICIDADE') continue;

    if (m.movementType === 'APLICACAO' || m.movementType === 'COMPRA_ATIVO') {
      applicationsCents = addMoney(applicationsCents, m.amountCents);
      // Bank account still had cash outflow into investment bucket
      if (m.direction === 'EXPENSE') {
        debitsCents = addMoney(debitsCents, m.amountCents);
      }
      continue;
    }

    if (m.movementType === 'RESGATE' || m.movementType === 'VENDA_ATIVO') {
      redemptionsCents = addMoney(redemptionsCents, m.amountCents);
      if (m.direction === 'INCOME') {
        creditsCents = addMoney(creditsCents, m.amountCents);
      }
      continue;
    }

    if (m.direction === 'INCOME') {
      creditsCents = addMoney(creditsCents, m.amountCents);
    } else {
      debitsCents = addMoney(debitsCents, m.amountCents);
    }
  }

  let calculatedEndingBalanceCents: MoneyCents | undefined;
  let divergenceCents: MoneyCents | undefined;
  let hasDivergence = false;

  if (openingBalanceCents !== undefined) {
    calculatedEndingBalanceCents = subtractMoney(
      addMoney(openingBalanceCents, creditsCents),
      debitsCents
    );

    if (reportedEndingBalanceCents !== undefined) {
      const rawDiff = calculatedEndingBalanceCents - reportedEndingBalanceCents;
      divergenceCents = cents(Math.abs(rawDiff));
      hasDivergence = Math.abs(rawDiff) > 1; // 1 cent tolerance for bank rounding

      if (hasDivergence) {
        if (
          availableBalanceCents !== undefined &&
          Math.abs(calculatedEndingBalanceCents - availableBalanceCents) <= 1
        ) {
          notes.push(
            'Saldo calculado coincide com o saldo disponível; diferença em relação ao saldo contábil pode ser valor bloqueado/a compensar.'
          );
        } else {
          notes.push(
            `Divergência matemática de ${(Math.abs(rawDiff) / 100).toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
            })} entre o saldo calculado e o saldo final informado pelo banco. O saldo do sistema NÃO foi alterado automaticamente.`
          );
        }
      }
    }
  } else if (reportedEndingBalanceCents !== undefined) {
    notes.push(
      'Saldo inicial não constava no documento; informe o saldo inicial para validar a conciliação matemática completa.'
    );
  }

  if (applicationsCents > 0 || redemptionsCents > 0) {
    notes.push(
      'Aplicações e resgates estão contabilizados separadamente de receitas e despesas operacionais.'
    );
  }

  return {
    openingBalanceCents,
    reportedEndingBalanceCents,
    availableBalanceCents,
    blockedBalanceCents,
    creditsCents,
    debitsCents,
    applicationsCents,
    redemptionsCents,
    calculatedEndingBalanceCents,
    divergenceCents,
    hasDivergence,
    notes,
  };
}
