export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  status: 'PAID' | 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'FUTURE';
  label: string;
  shortLabel: string;
  badgeColor: string;
}

export function calculateCountdown(dueDateStr: string, isPaid: boolean = false): CountdownResult {
  if (isPaid) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      status: 'PAID',
      label: 'Pago',
      shortLabel: 'Pago',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    };
  }

  const now = new Date();
  const [y, m, d] = dueDateStr.split('-').map(Number);
  const due = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59);
  const diffMs = due.getTime() - now.getTime();

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueMidnight = new Date(y, (m || 1) - 1, d || 1).getTime();
  const calendarDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  if (calendarDays < 0 || diffMs < 0) {
    const overdueDays = Math.max(1, Math.abs(calendarDays));
    return {
      days: overdueDays,
      hours: 0,
      minutes: 0,
      status: 'OVERDUE',
      label: `Vencido há ${overdueDays} dia${overdueDays !== 1 ? 's' : ''}`,
      shortLabel: `Vencido há ${overdueDays}d`,
      badgeColor: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
    };
  }

  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (calendarDays === 0) {
    return {
      days: 0,
      hours: diffHours,
      minutes: diffMinutes,
      status: 'DUE_TODAY',
      label: `Vence hoje (${diffHours}h ${diffMinutes}m restantes)`,
      shortLabel: 'Vence hoje',
      badgeColor: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
    };
  }

  if (calendarDays === 1) {
    return {
      days: 1,
      hours: diffHours,
      minutes: diffMinutes,
      status: 'UPCOMING',
      label: `Vence amanhã (${diffHours}h restantes)`,
      shortLabel: 'Vence amanhã',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    };
  }

  if (calendarDays <= 3) {
    return {
      days: calendarDays,
      hours: diffHours,
      minutes: diffMinutes,
      status: 'UPCOMING',
      label: `Vence em ${calendarDays} dias e ${diffHours}h`,
      shortLabel: `Vence em ${calendarDays} dias`,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    };
  }

  return {
    days: calendarDays,
    hours: diffHours,
    minutes: diffMinutes,
    status: 'FUTURE',
    label: `Vence em ${calendarDays} dias`,
    shortLabel: `Vence em ${calendarDays} dias`,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  };
}
