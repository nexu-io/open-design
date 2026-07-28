import type Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

import type { ProjectStorage } from '../storage/project-storage.js';

export const MAX_STORE_SCREENSHOT_ASSET_BYTES = 20 * 1024 * 1024;

type SupportedAssetFormat = 'png' | 'jpeg' | 'webp';
type SupportedAssetMime = 'image/png' | 'image/jpeg' | 'image/webp';

export type StoreScreenshotAssetErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'INVALID_ASSET'
  | 'ASSET_STORAGE_FAILED';

export class StoreScreenshotAssetError extends Error {
  constructor(
    readonly code: StoreScreenshotAssetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreScreenshotAssetError';
  }
}

export interface SaveStoreScreenshotAssetInput {
  fileName: string;
  declaredMime?: string;
  data: Buffer;
}

export interface StoreScreenshotAssetStoreOptions {
  now?: () => number;
}

export interface StoredStoreScreenshotAsset {
  id: string;
  mime: SupportedAssetMime;
  width: number;
  height: number;
  contentHash: string;
  relativePath: string;
}

type AssetRow = {
  id: string;
  mime: SupportedAssetMime;
  width: number;
  height: number;
  contentHash: string;
  relativePath: string;
};

const FORMAT_INFO: Record<SupportedAssetFormat, {
  mime: SupportedAssetMime;
  extensions: readonly string[];
  storedExtension: string;
}> = {
  png: {
    mime: 'image/png',
    extensions: ['.png'],
    storedExtension: 'png',
  },
  jpeg: {
    mime: 'image/jpeg',
    extensions: ['.jpg', '.jpeg'],
    storedExtension: 'jpg',
  },
  webp: {
    mime: 'image/webp',
    extensions: ['.webp'],
    storedExtension: 'webp',
  },
};

function normalizeAssetRow(row: AssetRow): StoredStoreScreenshotAsset {
  return {
    id: row.id,
    mime: row.mime,
    width: Number(row.width),
    height: Number(row.height),
    contentHash: row.contentHash,
    relativePath: row.relativePath,
  };
}

export function createStoreScreenshotAssetStore(
  db: Database.Database,
  projectStorage: ProjectStorage,
  options: StoreScreenshotAssetStoreOptions = {},
) {
  const now = options.now ?? Date.now;

  return {
    save: async (
      projectId: string,
      documentId: string,
      input: SaveStoreScreenshotAssetInput,
    ): Promise<StoredStoreScreenshotAsset> => {
      const documentExists = db.prepare(`
        SELECT 1
        FROM store_screenshot_documents
        WHERE project_id = ? AND document_id = ?
      `).get(projectId, documentId);
      if (!documentExists) {
        throw new StoreScreenshotAssetError(
          'DOCUMENT_NOT_FOUND',
          'Store screenshot document not found',
        );
      }
      if (
        !Buffer.isBuffer(input.data)
        || input.data.byteLength === 0
        || input.data.byteLength > MAX_STORE_SCREENSHOT_ASSET_BYTES
      ) {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Asset must be a non-empty image no larger than 20 MiB',
        );
      }

      let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
      try {
        const decoder = sharp(input.data, {
          failOn: 'error',
          limitInputPixels: true,
        });
        metadata = await decoder.metadata();
        // metadata() only parses the container header. Force Sharp to consume
        // the complete pixel stream so truncated/corrupt payloads cannot be
        // indexed as valid assets.
        await decoder.clone().toBuffer();
      } catch {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Asset bytes are not a supported image',
        );
      }
      if (
        metadata.format !== 'png'
        && metadata.format !== 'jpeg'
        && metadata.format !== 'webp'
      ) {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Only PNG, JPEG, and WebP assets are supported',
        );
      }
      const format = metadata.format;
      const formatInfo = FORMAT_INFO[format];
      const extension = path.extname(input.fileName).toLowerCase();
      if (!formatInfo.extensions.includes(extension)) {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Asset extension does not match its decoded image format',
        );
      }
      if (
        input.declaredMime !== undefined
        && input.declaredMime !== formatInfo.mime
      ) {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Asset MIME does not match its decoded image format',
        );
      }
      if (
        !Number.isInteger(metadata.width)
        || !Number.isInteger(metadata.height)
        || (metadata.width ?? 0) < 1
        || (metadata.height ?? 0) < 1
      ) {
        throw new StoreScreenshotAssetError(
          'INVALID_ASSET',
          'Asset dimensions are invalid',
        );
      }

      const contentHash = createHash('sha256').update(input.data).digest('hex');
      const existing = db.prepare(`
        SELECT
          id,
          mime,
          width,
          height,
          content_hash AS contentHash,
          relative_path AS relativePath
        FROM store_screenshot_assets
        WHERE document_id = ? AND content_hash = ?
      `).get(documentId, contentHash) as AssetRow | undefined;
      if (existing) {
        const asset = normalizeAssetRow(existing);
        if (!await projectStorage.statFile(projectId, asset.relativePath)) {
          try {
            await projectStorage.writeFile(projectId, asset.relativePath, input.data);
          } catch {
            throw new StoreScreenshotAssetError(
              'ASSET_STORAGE_FAILED',
              'Asset could not be written to project storage',
            );
          }
        }
        return asset;
      }

      const relativePath = `store-screenshots/assets/${contentHash}.${formatInfo.storedExtension}`;
      try {
        await projectStorage.writeFile(projectId, relativePath, input.data);
      } catch {
        throw new StoreScreenshotAssetError(
          'ASSET_STORAGE_FAILED',
          'Asset could not be written to project storage',
        );
      }
      const id = randomUUID();
      try {
        db.prepare(`
          INSERT INTO store_screenshot_assets
            (id, document_id, relative_path, mime, width, height, content_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          documentId,
          relativePath,
          formatInfo.mime,
          metadata.width,
          metadata.height,
          contentHash,
          now(),
        );
      } catch {
        // Concurrent uploads can both miss the first lookup, but the unique
        // (document_id, content_hash) index still elects one canonical row.
        const winner = db.prepare(`
          SELECT
            id,
            mime,
            width,
            height,
            content_hash AS contentHash,
            relative_path AS relativePath
          FROM store_screenshot_assets
          WHERE document_id = ? AND content_hash = ?
        `).get(documentId, contentHash) as AssetRow | undefined;
        if (winner) return normalizeAssetRow(winner);
        throw new StoreScreenshotAssetError(
          'ASSET_STORAGE_FAILED',
          'Asset metadata could not be saved',
        );
      }
      return {
        id,
        mime: formatInfo.mime,
        width: metadata.width,
        height: metadata.height,
        contentHash,
        relativePath,
      };
    },
  };
}
