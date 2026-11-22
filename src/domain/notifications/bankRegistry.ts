import type { AuthorizedBankPackage } from './notification.types';

/**
 * Curated Brazilian banking app package registry.
 * NOTE: Package names vary slightly across Play Store / enterprise / PJ variants (e.g. Itaú vs Itaú Empresas).
 * Packages marked verified: true correspond to standard public Play Store IDs; users can inspect,
 * disable, or add validated custom package IDs in NotificationSettings before capturing.
 */
export const KNOWN_BRAZILIAN_BANK_PACKAGES: readonly AuthorizedBankPackage[] = [
  { packageName: 'com.nu.production', institutionName: 'Nubank', verified: true },
  { packageName: 'com.itau', institutionName: 'Itaú', verified: true },
  { packageName: 'com.itau.empresas', institutionName: 'Itaú Empresas', verified: false },
  { packageName: 'br.com.intermedium', institutionName: 'Banco Inter', verified: true },
  { packageName: 'com.bradesco', institutionName: 'Bradesco', verified: true },
  { packageName: 'com.santander.app', institutionName: 'Santander', verified: true },
  { packageName: 'br.com.bb.android', institutionName: 'Banco do Brasil', verified: true },
  { packageName: 'br.com.gabba.Caixa', institutionName: 'Caixa Econômica', verified: true },
  { packageName: 'com.c6bank.app', institutionName: 'C6 Bank', verified: true },
  { packageName: 'com.picpay', institutionName: 'PicPay', verified: true },
  { packageName: 'com.mercadopago.wallet', institutionName: 'Mercado Pago', verified: true },
  { packageName: 'com.btg.pactual.digital.mobile', institutionName: 'BTG Pactual', verified: true },
  { packageName: 'br.com.uol.ps.myaccount', institutionName: 'PagBank', verified: true },
  { packageName: 'br.com.neon', institutionName: 'Neon', verified: true },
  { packageName: 'br.com.original.bank', institutionName: 'Banco Original', verified: false },
  { packageName: 'br.com.sicredi.app', institutionName: 'Sicredi', verified: false },
  { packageName: 'br.com.sicoob.sicoobnetpessoal', institutionName: 'Sicoob', verified: false },
];

export const DEFAULT_AUTHORIZED_PACKAGES: string[] = KNOWN_BRAZILIAN_BANK_PACKAGES.filter(
  (b) => b.verified
).map((b) => b.packageName);

const PACKAGE_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+){1,}$/;

export function isValidAndroidPackageId(pkg: string): boolean {
  const trimmed = pkg.trim();
  if (trimmed.length < 5 || trimmed.length > 140) return false;
  return PACKAGE_NAME_REGEX.test(trimmed);
}

export function resolveInstitutionFromPackage(
  packageName: string,
  appLabel?: string
): string | null {
  const cleanPkg = (packageName || '').trim().toLowerCase();
  const known = KNOWN_BRAZILIAN_BANK_PACKAGES.find(
    (b) => b.packageName.toLowerCase() === cleanPkg
  );
  if (known) return known.institutionName;
  const cleanLabel = (appLabel || '').trim();
  return cleanLabel.length >= 2 ? cleanLabel : null;
}
