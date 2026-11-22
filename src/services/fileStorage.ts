import { db, StoredFileRecord } from './indexedDb';
import {
  compressImageBlob,
  blobToBase64,
  dataUrlToBlob,
  formatBytesLabel,
} from '../utils/imageCompression';

export interface SavedFileMeta {
  fileId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sizeLabel: string;
  base64?: string;
}

export interface FileReferenceInfo {
  id: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

const memoryFiles = new Map<string, StoredFileRecord>();

export const fileStorageService = {
  /**
   * Stores an image (compressed safely when possible) or PDF/EPUB (never compressed)
   * inside IndexedDB SavioFinanaDB.files with graceful in-memory fallback.
   */
  async saveDocumentFile(
    documentId: string,
    inputBlob: Blob,
    fileName: string,
    explicitMimeType?: string
  ): Promise<SavedFileMeta> {
    const rawMime = explicitMimeType || inputBlob.type || 'application/octet-stream';
    const isImage =
      rawMime.startsWith('image/') && !rawMime.includes('svg');
    const isPdf = rawMime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');

    let finalBlob = inputBlob;
    let finalMime = rawMime;
    let base64: string | undefined;

    if (isImage && !isPdf) {
      const compressed = await compressImageBlob(inputBlob, 1600, 0.78);
      finalBlob = compressed.blob;
      finalMime = compressed.mimeType;
      base64 = compressed.base64;
    } else if (isPdf) {
      // Never compress or alter PDF binary payloads
      finalBlob = inputBlob;
      finalMime = 'application/pdf';
      base64 = await blobToBase64(inputBlob);
    }

    const fileId = `file-${documentId}`;
    const record: StoredFileRecord = {
      id: fileId,
      documentId,
      fileName,
      mimeType: finalMime,
      sizeBytes: finalBlob.size,
      blob: finalBlob,
      createdAt: new Date().toISOString(),
    };

    if (db) {
      try {
        await db.files.put(record);
      } catch {
        memoryFiles.set(documentId, record);
      }
    } else {
      memoryFiles.set(documentId, record);
    }

    return {
      fileId,
      documentId,
      fileName,
      mimeType: finalMime,
      sizeBytes: finalBlob.size,
      sizeLabel: formatBytesLabel(finalBlob.size),
      base64,
    };
  },

  async saveRawBlob(documentId: string, blob: Blob, mimeType: string, fileName = 'arquivo'): Promise<void> {
    const fileId = `file-${documentId}`;
    const record: StoredFileRecord = {
      id: fileId,
      documentId,
      fileName,
      mimeType: mimeType || blob.type || 'application/octet-stream',
      sizeBytes: blob.size,
      blob,
      createdAt: new Date().toISOString(),
    };

    if (db) {
      try {
        await db.files.put(record);
        return;
      } catch {
        // fallback below
      }
    }
    memoryFiles.set(documentId, record);
  },

  async migrateDataUrlToFile(
    documentId: string,
    dataUrl: string,
    fileName: string,
    mimeType?: string
  ): Promise<SavedFileMeta> {
    const blob = dataUrlToBlob(dataUrl);
    return this.saveDocumentFile(documentId, blob, fileName, mimeType || blob.type);
  },

  async getFile(documentId: string): Promise<StoredFileRecord | null> {
    if (db) {
      try {
        const byDoc = await db.files.where('documentId').equals(documentId).first();
        if (byDoc) return byDoc;
        const byId = await db.files.get(documentId);
        if (byId) return byId;
      } catch {
        // fallback below
      }
    }
    return memoryFiles.get(documentId) || null;
  },

  async getFileObjectUrl(documentId: string): Promise<string | null> {
    const rec = await this.getFile(documentId);
    if (!rec) return null;
    return URL.createObjectURL(rec.blob);
  },

  async deleteFile(documentId: string): Promise<void> {
    memoryFiles.delete(documentId);
    if (!db) return;
    try {
      await db.files.where('documentId').equals(documentId).delete();
      await db.files.delete(`file-${documentId}`);
    } catch {
      // ignore
    }
  },

  async clearAllFiles(): Promise<void> {
    memoryFiles.clear();
    if (!db) return;
    try {
      await db.files.clear();
    } catch {
      // ignore
    }
  },

  async listFileReferences(): Promise<FileReferenceInfo[]> {
    if (!db) {
      return Array.from(memoryFiles.values()).map((f) => ({
        id: f.id,
        documentId: f.documentId,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt,
      }));
    }
    try {
      const all = await db.files.toArray();
      return all.map((f) => ({
        id: f.id,
        documentId: f.documentId,
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
        createdAt: f.createdAt,
      }));
    } catch {
      return [];
    }
  },
};
