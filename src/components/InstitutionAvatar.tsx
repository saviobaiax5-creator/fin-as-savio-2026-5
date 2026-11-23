import React from 'react';
import { findBankVisualBranding } from '../domain/extractions/banksRepository';

interface InstitutionAvatarProps {
  name?: string;
  code?: string;
  sigla?: string;
  cor?: string;
  texto?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<InstitutionAvatarProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-lg text-[11px]',
  md: 'w-[34px] h-[34px] rounded-lg text-[12px]',
  lg: 'w-10 h-10 rounded-[10px] text-[13px]',
};

export const InstitutionAvatar: React.FC<InstitutionAvatarProps> = ({
  name,
  code,
  sigla,
  cor,
  texto,
  size = 'md',
  className = '',
}) => {
  const resolved = findBankVisualBranding(name, code);
  const finalSigla = sigla || resolved.sigla;
  const finalCor = cor || resolved.cor;
  const finalTexto = texto || resolved.texto;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center font-display font-extrabold tracking-tight shrink-0 border border-black/10 dark:border-white/15 select-none ${SIZE_CLASSES[size]} ${className}`}
      style={{
        backgroundColor: finalCor,
        color: finalTexto,
      }}
      title={name || resolved.nome || finalSigla}
    >
      {finalSigla}
    </span>
  );
};
