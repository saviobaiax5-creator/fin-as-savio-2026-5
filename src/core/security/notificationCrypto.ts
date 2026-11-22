import { db } from '../../services/indexedDb';
import { decryptStringWithKey, encryptStringWithKey } from './secureVault';
import type { BankNotificationSensitivePayload } from '../../domain/notifications/notification.types';

const NOTIFICATION_KEY_ID = 'bank_notif_aes_gcm_v1';

let volatileSessionKey: CryptoKey | null = null;

function hasSubtleCrypto(): boolean {
  return typeof globalThis !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

/**
 * Masks full card numbers, CPFs, passwords or token sequences before persisting or displaying snippets.
 * Minimizes captured banking data per security requirements.
 */
export function minimizeAndMaskNotificationText(input: string, maxLength = 220): string {
  if (!input) return '';
  let text = input
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Mask 13-19 digit PANs keeping at most last 4 digits
  text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 13) return match;
    return `•••• ${digits.slice(-4)}`;
  });

  // Mask formatted or raw CPF (11 digits)
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**');

  // Mask OTP / verification codes
  text = text.replace(
    /\b(c[oó]digo(?:\s+de)?\s+(?:seguran[çc]a|verifica[çc][ãa]o|acesso)|token|otp|senha)\s*[:#-]?\s*[a-zA-Z0-9]{4,12}\b/gi,
    '$1: ••••••'
  );

  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1).trimEnd() + '…';
  }
  return text;
}

/**
 * Returns a non-extractable AES-GCM-256 CryptoKey persisted in IndexedDB cryptoKeys table.
 * Falls back to an in-memory CryptoKey if IndexedDB is unavailable.
 */
export async function getOrCreateNotificationQueueKey(): Promise<CryptoKey | null> {
  if (!hasSubtleCrypto()) return null;

  if (db) {
    try {
      const existing = await db.cryptoKeys.get(NOTIFICATION_KEY_ID);
      if (existing?.key) {
        return existing.key;
      }
    } catch {
      // fall through to generate key
    }
  }

  if (volatileSessionKey) return volatileSessionKey;

  try {
    const generated = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable key!
      ['encrypt', 'decrypt']
    );

    if (db) {
      try {
        await db.cryptoKeys.put({
          id: NOTIFICATION_KEY_ID,
          key: generated,
          createdAt: new Date().toISOString(),
        });
      } catch {
        volatileSessionKey = generated;
      }
    } else {
      volatileSessionKey = generated;
    }

    return generated;
  } catch {
    return null;
  }
}

export async function encryptNotificationPayload(
  payload: BankNotificationSensitivePayload
): Promise<{ ivB64: string; cipherB64: string; mode: 'AES-GCM-256' | 'PLAIN_FALLBACK' }> {
  const json = JSON.stringify(payload);
  const key = await getOrCreateNotificationQueueKey();

  if (!key) {
    // Fallback strictly when WebCrypto Subtle is absent (e.g., non-secure context tests)
    const encoded =
      typeof Buffer !== 'undefined'
        ? Buffer.from(json, 'utf-8').toString('base64')
        : btoa(unescape(encodeURIComponent(json)));
    return { ivB64: '', cipherB64: encoded, mode: 'PLAIN_FALLBACK' };
  }

  const enc = await encryptStringWithKey(json, key);
  return { ivB64: enc.ivB64, cipherB64: enc.cipherB64, mode: 'AES-GCM-256' };
}

export async function decryptNotificationPayload(params: {
  ivB64: string;
  cipherB64: string;
  mode: 'AES-GCM-256' | 'PLAIN_FALLBACK';
}): Promise<BankNotificationSensitivePayload | null> {
  try {
    if (params.mode === 'PLAIN_FALLBACK') {
      const rawJson =
        typeof Buffer !== 'undefined'
          ? Buffer.from(params.cipherB64, 'base64').toString('utf-8')
          : decodeURIComponent(escape(atob(params.cipherB64)));
      return JSON.parse(rawJson) as BankNotificationSensitivePayload;
    }

    const key = await getOrCreateNotificationQueueKey();
    if (!key) return null;
    const rawJson = await decryptStringWithKey(params.ivB64, params.cipherB64, key);
    return JSON.parse(rawJson) as BankNotificationSensitivePayload;
  } catch {
    return null;
  }
}

export async function destroyNotificationQueueKey(): Promise<void> {
  volatileSessionKey = null;
  if (db) {
    try {
      await db.cryptoKeys.delete(NOTIFICATION_KEY_ID);
    } catch {
      // ignore key deletion failure
    }
  }
}
