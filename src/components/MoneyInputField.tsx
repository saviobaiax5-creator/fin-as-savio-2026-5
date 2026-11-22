import React from 'react';
import { formatMoneyBRL, parseMoneyInput } from '../domain/money/money';

interface MoneyInputFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  required?: boolean;
  allowZero?: boolean;
  className?: string;
  inputClassName?: string;
}

/**
 * Sanitizes free-form monetary input without forcing cursor jumps:
 * keeps digits, comma, dot, and optional leading minus only when typed,
 * while computing an exact MoneyCents live preview.
 */
export function sanitizeMoneyKeystrokes(raw: string): string {
  return raw.replace(/[^\d.,]/g, '');
}

export const MoneyInputField: React.FC<MoneyInputFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = '0,00',
  required = false,
  allowZero = false,
  className = '',
  inputClassName = '',
}) => {
  let previewLabel: string | null = null;
  let invalidSyntax = false;

  if (value.trim()) {
    try {
      const parsed = parseMoneyInput(value);
      if (parsed > 0 || (allowZero && parsed === 0)) {
        previewLabel = formatMoneyBRL(parsed);
      } else {
        invalidSyntax = true;
      }
    } catch {
      invalidSyntax = true;
    }
  }

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
          R$
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(sanitizeMoneyKeystrokes(e.target.value))}
          className={`w-full pl-10 pr-3 py-3 border rounded-xl text-sm font-bold outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white min-h-12 transition-colors ${
            invalidSyntax
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
          } ${inputClassName}`}
        />
      </div>
      {previewLabel && (
        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-1">
          Valor exato: {previewLabel}
        </p>
      )}
      {invalidSyntax && (
        <p className="text-[11px] font-medium text-red-600 dark:text-red-400 mt-1">
          Formato inválido. Use ex.: 150,00 ou 1.250,50.
        </p>
      )}
    </div>
  );
};
