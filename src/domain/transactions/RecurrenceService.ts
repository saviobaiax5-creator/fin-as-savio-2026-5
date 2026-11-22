import type { Transaction, TransactionStatus } from '../../types';
import { generateEntityId } from '../common/id';
import { MoneyCents, cents, fromCents, getTransactionAmountCents } from '../money/money';
import { addMonthsLocal } from '../../utils/dateUtils';

export type RecurrenceMode = 'INSTALLMENT' | 'RECURRING';
export type InstallmentAmountMode = 'PER_OCCURRENCE' | 'SPLIT_TOTAL';

export interface GenerateMonthlyRecurrenceInput {
  baseTransaction: Omit<Transaction, 'id'>;
  occurrences: number;
  mode: RecurrenceMode;
  amountMode?: InstallmentAmountMode;
  futureStatus?: Exclude<TransactionStatus, 'CANCELLED' | 'CONFIRMED'>;
  seriesId?: string;
}

export interface GeneratedRecurrencePreview {
  occurrences: number;
  firstDate: string;
  lastDate: string;
  firstAmountCents: MoneyCents;
  regularAmountCents: MoneyCents;
  totalAmountCents: MoneyCents;
}

export function splitCentsAcrossInstallments(
  totalCents: MoneyCents,
  count: number
): MoneyCents[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Quantidade de parcelas inválida.');
  }
  if (totalCents <= 0) {
    throw new Error('O valor total deve ser maior que zero.');
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  const result: MoneyCents[] = [];
  for (let i = 0; i < count; i += 1) {
    // First installment receives any indivisible cent remainder so sum === totalCents exactly
    result.push(cents(i === 0 ? base + remainder : base));
  }
  return result;
}

export function previewMonthlyRecurrence(params: {
  startDate: string;
  amountCents: MoneyCents;
  occurrences: number;
  mode: RecurrenceMode;
  amountMode?: InstallmentAmountMode;
}): GeneratedRecurrencePreview {
  const count = Math.max(2, Math.min(60, Math.floor(params.occurrences)));
  const amountMode = params.amountMode ?? 'PER_OCCURRENCE';

  const amounts =
    params.mode === 'INSTALLMENT' && amountMode === 'SPLIT_TOTAL'
      ? splitCentsAcrossInstallments(params.amountCents, count)
      : Array.from({ length: count }, () => params.amountCents);

  const totalAmountCents = cents(amounts.reduce((acc, v) => acc + v, 0));

  return {
    occurrences: count,
    firstDate: params.startDate,
    lastDate: addMonthsLocal(params.startDate, count - 1),
    firstAmountCents: amounts[0],
    regularAmountCents: amounts[amounts.length - 1],
    totalAmountCents,
  };
}

export function generateMonthlyRecurrenceBatch(
  input: GenerateMonthlyRecurrenceInput
): Transaction[] {
  const count = Math.floor(input.occurrences);
  if (!Number.isFinite(count) || count < 2 || count > 60) {
    throw new Error('A recorrência/parcelamento deve ter entre 2 e 60 ocorrências.');
  }

  const baseAmountCents = getTransactionAmountCents(input.baseTransaction);
  if (baseAmountCents <= 0) {
    throw new Error('O valor do lançamento deve ser maior que zero.');
  }

  const amountMode = input.amountMode ?? 'PER_OCCURRENCE';
  const futureStatus: Exclude<TransactionStatus, 'CANCELLED'> = input.futureStatus ?? 'PENDING';
  const seriesId = input.seriesId || generateEntityId('rec');

  const installmentAmounts: MoneyCents[] =
    input.mode === 'INSTALLMENT' && amountMode === 'SPLIT_TOTAL'
      ? splitCentsAcrossInstallments(baseAmountCents, count)
      : Array.from({ length: count }, () => baseAmountCents);

  const cleanDesc = input.baseTransaction.description.trim();

  const batch: Transaction[] = [];
  for (let i = 0; i < count; i += 1) {
    const occAmountCents = installmentAmounts[i];
    if (occAmountCents <= 0) {
      throw new Error('Cada parcela deve ter valor mínimo de R$ 0,01.');
    }

    const occDate = addMonthsLocal(input.baseTransaction.date, i);
    const occStatus =
      i === 0
        ? input.baseTransaction.status === 'CANCELLED'
          ? 'PENDING'
          : input.baseTransaction.status
        : futureStatus;

    const description =
      input.mode === 'INSTALLMENT' ? `${cleanDesc} (${i + 1}/${count})` : cleanDesc;

    batch.push({
      ...input.baseTransaction,
      id: generateEntityId('tr-rec'),
      date: occDate,
      description,
      amountCents: occAmountCents,
      amount: fromCents(occAmountCents),
      status: occStatus,
      externalId:
        input.baseTransaction.externalId && i === 0
          ? input.baseTransaction.externalId
          : undefined,
      idempotencyKey: `rec:${seriesId}:${i + 1}/${count}`,
    });
  }

  return batch;
}
