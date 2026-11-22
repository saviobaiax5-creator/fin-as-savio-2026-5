/**
 * Client-side image compression and Blob/base64 conversion utilities.
 * Keeps camera captures and scanned receipts compact before sending to Gemini or storing in IndexedDB.
 */

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header?.match(/data:([^;]+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Falha ao converter arquivo para base64.'));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function formatBytesLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export async function compressImageBlob(
  input: Blob,
  maxDimension = 1600,
  quality = 0.78
): Promise<{ blob: Blob; base64: string; mimeType: string }> {
  const fallbackReturn = async () => ({
    blob: input,
    base64: await blobToBase64(input),
    mimeType: input.type || 'image/jpeg',
  });

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return fallbackReturn();
  }

  const objectUrl = URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Falha ao carregar imagem para compressão.'));
      el.src = objectUrl;
    });

    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) {
      return fallbackReturn();
    }

    const scale = Math.min(1, maxDimension / Math.max(w, h));
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return fallbackReturn();
    }

    // Fill white background in case source PNG has transparency
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compressedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );

    if (!compressedBlob) {
      return fallbackReturn();
    }

    // If compressed version happens to be larger on tiny images, keep whichever is smaller
    const finalBlob = compressedBlob.size <= input.size || scale < 1 ? compressedBlob : input;
    const base64 = await blobToBase64(finalBlob);
    return {
      blob: finalBlob,
      base64,
      mimeType: finalBlob.type || 'image/jpeg',
    };
  } catch {
    return fallbackReturn();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
