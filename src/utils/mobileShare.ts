export interface MobileShareUrlInfo {
  shareUrl: string;
  currentUrl: string;
  isPreviewDevUrl: boolean;
  isShareReadyUrl: boolean;
}

const DEFAULT_FALLBACK_ORIGIN = 'https://ais-pre-25msohbcck4gcpe4p24iba-538369928080.us-west2.run.app';

/**
 * Resolves the canonical mobile-compatible share URL.
 * - Prefers VITE_SHARED_APP_URL if explicitly set.
 * - Automatically converts AI Studio dev URLs (`https://ais-dev-...run.app`) into
 *   the corresponding shareable URL (`https://ais-pre-...run.app`) so phones do not
 *   hit developer IDE authentication gates.
 * - Preserves custom production domains and already-shared URLs cleanly.
 */
export function resolveMobileShareInfo(explicitOrigin?: string): MobileShareUrlInfo {
  const envUrl =
    typeof import.meta !== 'undefined' && import.meta.env
      ? String(import.meta.env.VITE_SHARED_APP_URL || '').trim()
      : '';

  const currentOrigin =
    explicitOrigin?.trim() ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : DEFAULT_FALLBACK_ORIGIN);

  const normalizedCurrent = currentOrigin.replace(/\/+$/, '');
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalizedCurrent);
  const devMatch = normalizedCurrent.match(/^https:\/\/ais-dev-([a-z0-9-]+)\.([a-z0-9.-]+\.run\.app)$/i);

  let shareUrl = normalizedCurrent;
  let isPreviewDevUrl = false;

  if (envUrl) {
    shareUrl = envUrl.replace(/\/+$/, '');
    isPreviewDevUrl = Boolean(devMatch);
  } else if (devMatch) {
    shareUrl = `https://ais-pre-${devMatch[1]}.${devMatch[2]}`;
    isPreviewDevUrl = true;
  } else if (isLocalhost) {
    shareUrl = DEFAULT_FALLBACK_ORIGIN;
  }

  return {
    shareUrl,
    currentUrl: normalizedCurrent,
    isPreviewDevUrl,
    isShareReadyUrl: /^https:\/\//i.test(shareUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(shareUrl),
  };
}

export function buildWhatsAppShareUrl(shareUrl: string): string {
  const text = `Acesse o Sávio Finanças diretamente no seu celular (instalação PWA e sincronização na nuvem): ${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyLinkToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy textarea fallback
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function triggerNativeMobileShare(shareUrl: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canUseNativeShare()) return 'unsupported';
  try {
    await navigator.share({
      title: 'Sávio Finanças — Gestão Financeira Inteligente',
      text: 'Acesse o Sávio Finanças no celular com sincronização em nuvem e modo offline:',
      url: shareUrl,
    });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return 'cancelled';
    }
    return 'unsupported';
  }
}
