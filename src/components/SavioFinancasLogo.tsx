import React, { useId } from 'react';

export interface SavioFinancasLogoProps {
  size?: number;
  showName?: boolean;
  subtitle?: boolean;
  className?: string;
}

export function SavioFinancasLogo({
  size = 48,
  showName = true,
  subtitle = false,
  className = '',
}: SavioFinancasLogoProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `sf-bg-${uid}`;
  const goldId = `sf-gold-${uid}`;

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 128 128"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sávio Finanças"
        role="img"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#061E3E" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD85A" />
            <stop offset="100%" stopColor="#F5B719" />
          </linearGradient>
        </defs>

        <rect width="128" height="128" rx="28" fill={`url(#${bgId})`} />

        <rect x="22" y="66" width="15" height="27" rx="4" fill="#FFFFFF" />
        <rect x="44" y="52" width="15" height="41" rx="4" fill="#FFFFFF" />
        <rect x="66" y="36" width="15" height="57" rx="4" fill="#FFFFFF" />

        <path
          d="M17 91 C39 75 58 73 78 57 C88 49 96 41 108 28"
          fill="none"
          stroke={`url(#${goldId})`}
          strokeWidth="9"
          strokeLinecap="round"
        />

        <path
          d="M91 27 L111 24 L108 44"
          fill="none"
          stroke="#F5B719"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M17 101 C40 89 61 89 83 98"
          fill="none"
          stroke="#059669"
          strokeWidth="7"
          strokeLinecap="round"
        />

        <circle cx="91" cy="91" r="17" fill={`url(#${goldId})`} />

        <text
          x="91"
          y="99"
          textAnchor="middle"
          fontSize="25"
          fontWeight="bold"
          fill="#061E3E"
        >
          $
        </text>
      </svg>

      {showName && (
        <div className="flex flex-col min-w-0">
          <strong className="font-display text-lg font-bold tracking-tight text-inherit truncate">
            Sávio <span className="text-[#F5B719]">Finanças</span>
          </strong>

          {subtitle && (
            <span className="text-xs text-slate-400 dark:text-slate-400 truncate">
              Planeje · Controle · Conquiste
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default SavioFinancasLogo;
