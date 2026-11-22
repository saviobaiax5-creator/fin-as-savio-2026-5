/**
 * Prevents CSV / Excel formula injection by prepending an apostrophe if text starts with formula triggers.
 */
export function sanitizeCellForSheet(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}
