import { fileStorageService } from '../services/fileStorage';

export async function saveDocumentBlob(id: string, blob: Blob, mimeType: string): Promise<void> {
  await fileStorageService.saveRawBlob(id, blob, mimeType);
}

export async function getDocumentBlob(
  id: string
): Promise<{ blob: Blob; mimeType: string } | null> {
  const rec = await fileStorageService.getFile(id);
  if (!rec) return null;
  return { blob: rec.blob, mimeType: rec.mimeType };
}

export async function getDocumentBlobUrl(id: string): Promise<string | null> {
  return fileStorageService.getFileObjectUrl(id);
}

export async function deleteDocumentBlob(id: string): Promise<void> {
  await fileStorageService.deleteFile(id);
}

export async function clearAllDocumentBlobs(): Promise<void> {
  await fileStorageService.clearAllFiles();
}
