const VAULT_META_KEY = 'finance_ia_vault_meta';
const VAULT_BLOB_KEY = 'finance_ia_encrypted_vault';
const PBKDF2_ITERATIONS = 150_000;
const VERIFIER_TEXT = 'FINANCE_IA_VAULT_OK_V1';

export interface VaultMeta {
  version: 1;
  enabled: boolean;
  saltB64: string;
  verifierIvB64: string;
  verifierCipherB64: string;
  updatedAt: string;
}

export interface EncryptedBlob {
  ivB64: string;
  cipherB64: string;
  updatedAt: string;
}

function getCrypto(): Crypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  throw new Error('WebCrypto API indisponível neste ambiente.');
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export async function deriveVaultKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const cryptoApi = getCrypto();
  const normalizedPin = pin.trim();
  if (normalizedPin.length < 4) {
    throw new Error('O PIN de segurança deve conter pelo menos 4 caracteres.');
  }

  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(normalizedPin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptStringWithKey(
  plainText: string,
  key: CryptoKey
): Promise<{ ivB64: string; cipherB64: string }> {
  const cryptoApi = getCrypto();
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainText)
  );
  return {
    ivB64: toBase64(iv),
    cipherB64: toBase64(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptStringWithKey(
  ivB64: string,
  cipherB64: string,
  key: CryptoKey
): Promise<string> {
  const cryptoApi = getCrypto();
  const iv = fromBase64(ivB64);
  const cipher = fromBase64(cipherB64);
  const plainBuffer = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource
  );
  return new TextDecoder().decode(plainBuffer);
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readVaultMeta(): VaultMeta | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(VAULT_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultMeta;
    return parsed?.enabled ? parsed : null;
  } catch {
    return null;
  }
}

export function isVaultEnabled(): boolean {
  return Boolean(readVaultMeta()?.enabled);
}

export async function createVaultWithPin(
  pin: string,
  initialPlainDatasetJson?: string
): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const cryptoApi = getCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(pin, salt);
  const verifier = await encryptStringWithKey(VERIFIER_TEXT, key);

  const meta: VaultMeta = {
    version: 1,
    enabled: true,
    saltB64: toBase64(salt),
    verifierIvB64: verifier.ivB64,
    verifierCipherB64: verifier.cipherB64,
    updatedAt: new Date().toISOString(),
  };

  const storage = getStorage();
  if (storage) {
    storage.setItem(VAULT_META_KEY, JSON.stringify(meta));
    if (initialPlainDatasetJson) {
      const enc = await encryptStringWithKey(initialPlainDatasetJson, key);
      const blob: EncryptedBlob = {
        ivB64: enc.ivB64,
        cipherB64: enc.cipherB64,
        updatedAt: new Date().toISOString(),
      };
      storage.setItem(VAULT_BLOB_KEY, JSON.stringify(blob));
    }
  }

  return { meta, key };
}

export async function verifyAndUnlockVault(
  pin: string,
  explicitMeta?: VaultMeta
): Promise<{ ok: boolean; key?: CryptoKey; decryptedDatasetJson?: string; error?: string }> {
  const meta = explicitMeta || readVaultMeta();
  if (!meta || !meta.enabled) {
    return { ok: false, error: 'Cofre de segurança não está ativado.' };
  }

  try {
    const salt = fromBase64(meta.saltB64);
    const key = await deriveVaultKey(pin, salt);
    const verifierPlain = await decryptStringWithKey(
      meta.verifierIvB64,
      meta.verifierCipherB64,
      key
    );
    if (verifierPlain !== VERIFIER_TEXT) {
      return { ok: false, error: 'PIN incorreto.' };
    }

    const storage = getStorage();
    let decryptedDatasetJson: string | undefined;
    if (storage) {
      const rawBlob = storage.getItem(VAULT_BLOB_KEY);
      if (rawBlob) {
        const blob = JSON.parse(rawBlob) as EncryptedBlob;
        decryptedDatasetJson = await decryptStringWithKey(blob.ivB64, blob.cipherB64, key);
      }
    }

    return { ok: true, key, decryptedDatasetJson };
  } catch {
    return { ok: false, error: 'PIN incorreto ou dados criptografados inválidos.' };
  }
}

export async function saveEncryptedVaultSnapshot(
  plainJson: string,
  key: CryptoKey
): Promise<boolean> {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const enc = await encryptStringWithKey(plainJson, key);
    const blob: EncryptedBlob = {
      ivB64: enc.ivB64,
      cipherB64: enc.cipherB64,
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(VAULT_BLOB_KEY, JSON.stringify(blob));
    return true;
  } catch {
    return false;
  }
}

export async function disableVaultWithPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const res = await verifyAndUnlockVault(pin);
  if (!res.ok) {
    return { ok: false, error: res.error || 'PIN incorreto.' };
  }
  const storage = getStorage();
  if (storage) {
    storage.removeItem(VAULT_META_KEY);
    storage.removeItem(VAULT_BLOB_KEY);
  }
  return { ok: true };
}
