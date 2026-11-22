/**
 * Timezone-safe local calendar date utilities.
 * Never uses Date.toISOString() directly so UTC offsets (e.g. Brazil UTC-3 after 21:00)
 * never shift local calendar days forward or backward.
 */

export function formatDateIsoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayLocal(now: Date = new Date()): string {
  return formatDateIsoLocal(now);
}

export function currentMonthLocal(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function todayDisplayPtBr(now: Date = new Date()): string {
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}/${month}/${year}`;
}

export function isValidDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();

  let year: number;
  let month: number;
  let day: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    [year, month, day] = trimmed.split('-').map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    [day, month, year] = trimmed.split('/').map(Number);
  } else {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return false;
  }

  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

export function normalizeToIsoDate(dateStr: string): string | null {
  if (!isValidDate(dateStr)) return null;
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const [day, month, year] = trimmed.split('/');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) {
    return new Date(NaN);
  }
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function formatDateBR(dateStr: string): string {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return dateStr;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function getMonthKey(dateStr: string): string {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return '';
  return iso.slice(0, 7);
}

export function addDaysLocal(isoDate: string, days: number): string {
  const parsed = parseLocalDate(isoDate);
  if (isNaN(parsed.getTime())) return isoDate;
  const dt = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + days);
  return formatDateIsoLocal(dt);
}

export function addMonthsLocal(isoDate: string, months: number): string {
  const iso = normalizeToIsoDate(isoDate);
  if (!iso) return isoDate;
  const [year, month, day] = iso.split('-').map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthZero = ((totalMonths % 12) + 12) % 12;
  const maxDayInMonth = new Date(targetYear, targetMonthZero + 1, 0).getDate();
  const clampedDay = Math.min(day, maxDayInMonth);
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonthZero + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}


export interface PeriodOption {
  value: string;
  label: string;
}

const MONTH_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export function formatMonthLabelPt(monthKey: string): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  return `${MONTH_SHORT_PT[idx] || m}/${y}`;
}

/**
 * Generates a dynamic period list derived from current calendar date + transaction/boleto dates.
 */
export function buildDynamicPeriodOptions(
  transactions: Array<{ date: string }>,
  boletos: Array<{ vencimento: string }> = [],
  now: Date = new Date()
): PeriodOption[] {
  const monthSet = new Set<string>();
  const yearSet = new Set<string>();

  // Always include sliding window: 3 previous months, current month, next month
  for (let offset = -3; offset <= 1; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthSet.add(key);
    yearSet.add(String(d.getFullYear()));
  }

  for (const t of transactions) {
    const mk = getMonthKey(t.date);
    if (mk) {
      monthSet.add(mk);
      yearSet.add(mk.slice(0, 4));
    }
  }

  for (const b of boletos) {
    const mk = getMonthKey(b.vencimento);
    if (mk) {
      monthSet.add(mk);
      yearSet.add(mk.slice(0, 4));
    }
  }

  const sortedMonths = Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  const sortedYears = Array.from(yearSet).sort((a, b) => b.localeCompare(a));

  return [
    ...sortedMonths.map((value) => ({
      value,
      label: formatMonthLabelPt(value),
    })),
    ...sortedYears.map((y) => ({
      value: y,
      label: `${y} · Ano`,
    })),
    { value: 'ALL', label: 'Todo período' },
  ];
}
