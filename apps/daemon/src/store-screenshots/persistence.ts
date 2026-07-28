import type Database from 'better-sqlite3';
import {
  StoreScreenshotChangeSetSchema,
  StoreScreenshotDocumentSchema,
  type StoreScreenshotChangeSet,
  type StoreScreenshotDocument,
} from '@launch-studio/store-screenshot';

import type { ProjectStorage } from '../storage/project-storage.js';

export type StoreScreenshotPersistenceErrorCode =
  | 'DOCUMENT_EXISTS'
  | 'DOCUMENT_NOT_FOUND'
  | 'INVALID_DOCUMENT'
  | 'VERSION_CONFLICT'
  | 'VERSION_NOT_FOUND';

export class StoreScreenshotPersistenceError extends Error {
  constructor(
    readonly code: StoreScreenshotPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoreScreenshotPersistenceError';
  }
}

type DocumentIndexRow = {
  projectId: string;
  documentId: string;
  currentVersion: number;
  relativePath: string;
  createdAt: number;
  updatedAt: number;
};

type VersionIndexRow = {
  documentId: string;
  version: number;
  source: StoreScreenshotVersionSource;
  changeSetJson: string | null;
  relativePath: string;
  createdAt: number;
};

export type {
  StoreScreenshotChangeSet,
  StoreScreenshotDocument,
};

export type StoreScreenshotVersionSource =
  | 'manual'
  | 'ai-change-set'
  | 'template'
  | 'asset-replacement'
  | 'page-reorder'
  | 'restore';

export interface StoreScreenshotPersistenceOptions {
  now?: () => number;
}

const DOCUMENT_PATH = 'store-screenshots/document.json';
const VERSION_PATH_PREFIX = 'store-screenshots/versions';

export function migrateStoreScreenshots(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_screenshot_documents (
      project_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL UNIQUE,
      current_version INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_screenshot_versions (
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      source TEXT NOT NULL,
      changeset_json TEXT,
      relative_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, version)
    );

    CREATE TABLE IF NOT EXISTS store_screenshot_assets (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      mime TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (document_id, content_hash)
    );

    CREATE TABLE IF NOT EXISTS store_screenshot_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      result_json TEXT,
      error_json TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_store_screenshot_versions_document
      ON store_screenshot_versions(document_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_store_screenshot_assets_document
      ON store_screenshot_assets(document_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_store_screenshot_jobs_project
      ON store_screenshot_jobs(project_id, updated_at DESC);
  `);
}

export function createStoreScreenshotPersistence(
  db: Database.Database,
  projectStorage: ProjectStorage,
  options: StoreScreenshotPersistenceOptions = {},
) {
  const now = options.now ?? Date.now;
  const projectOperationTails = new Map<string, Promise<void>>();

  async function withProjectLock<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = projectOperationTails.get(projectId) ?? Promise.resolve();
    let release = (): void => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current, () => current);
    projectOperationTails.set(projectId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (projectOperationTails.get(projectId) === tail) {
        projectOperationTails.delete(projectId);
      }
    }
  }

  function getDocumentIndex(projectId: string): DocumentIndexRow | null {
    return (db.prepare(`
      SELECT
        project_id AS projectId,
        document_id AS documentId,
        current_version AS currentVersion,
        relative_path AS relativePath,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM store_screenshot_documents
      WHERE project_id = ?
    `).get(projectId) as DocumentIndexRow | undefined) ?? null;
  }

  function requireDocumentIndex(projectId: string): DocumentIndexRow {
    const indexed = getDocumentIndex(projectId);
    if (!indexed) {
      throw new StoreScreenshotPersistenceError(
        'DOCUMENT_NOT_FOUND',
        `Store screenshot document not found for project ${projectId}`,
      );
    }
    return indexed;
  }

  function validateDocument(
    projectId: string,
    document: StoreScreenshotDocument,
  ): StoreScreenshotDocument {
    const parsed = StoreScreenshotDocumentSchema.safeParse(document);
    if (!parsed.success || parsed.data.projectId !== projectId) {
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Store screenshot document is invalid or belongs to another project',
      );
    }
    return document;
  }

  async function writeDocumentFiles(
    projectId: string,
    document: StoreScreenshotDocument,
  ): Promise<{ documentPath: string; versionPath: string }> {
    const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const versionPath = `${VERSION_PATH_PREFIX}/${document.version}.json`;
    // The immutable snapshot is written first. If the canonical write fails,
    // the database still points at the previous version and the orphan
    // snapshot is harmless; no absolute storage path enters SQLite.
    await projectStorage.writeFile(projectId, versionPath, body);
    await projectStorage.writeFile(projectId, DOCUMENT_PATH, body);
    return { documentPath: DOCUMENT_PATH, versionPath };
  }

  async function readIndexedDocument(
    projectId: string,
    relativePath: string,
  ): Promise<StoreScreenshotDocument> {
    const body = await projectStorage.readFile(projectId, relativePath);
    let candidate: unknown;
    try {
      candidate = JSON.parse(body.toString('utf8'));
    } catch {
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Stored screenshot document is not valid JSON',
      );
    }
    return validateDocument(projectId, candidate as StoreScreenshotDocument);
  }

  const createUnlocked = async (
    projectId: string,
    document: StoreScreenshotDocument,
  ): Promise<StoreScreenshotDocument> => {
    const parsed = validateDocument(projectId, document);
    if (parsed.version !== 1) {
      throw new StoreScreenshotPersistenceError(
        'VERSION_CONFLICT',
        'A new store screenshot document must start at version 1',
      );
    }
    if (getDocumentIndex(projectId)) {
      throw new StoreScreenshotPersistenceError(
        'DOCUMENT_EXISTS',
        `Store screenshot document already exists for project ${projectId}`,
      );
    }
    const timestamp = now();
    const paths = await writeDocumentFiles(projectId, parsed);
    db.transaction(() => {
      db.prepare(`
        INSERT INTO store_screenshot_documents
          (project_id, document_id, current_version, relative_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        projectId,
        parsed.id,
        parsed.version,
        paths.documentPath,
        timestamp,
        timestamp,
      );
      db.prepare(`
        INSERT INTO store_screenshot_versions
          (document_id, version, source, changeset_json, relative_path, created_at)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).run(parsed.id, parsed.version, 'template', paths.versionPath, timestamp);
    })();
    return parsed;
  };

  const readUnlocked = async (projectId: string): Promise<StoreScreenshotDocument> => {
    const indexed = requireDocumentIndex(projectId);
    const document = await readIndexedDocument(projectId, indexed.relativePath);
    if (
      document.id !== indexed.documentId
      || document.version !== indexed.currentVersion
    ) {
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Stored screenshot document does not match its SQLite index',
      );
    }
    return document;
  };

  const saveUnlocked = async (
    projectId: string,
    document: StoreScreenshotDocument,
    changeSet: StoreScreenshotChangeSet | null,
    source: StoreScreenshotVersionSource,
  ): Promise<StoreScreenshotDocument> => {
    const indexed = requireDocumentIndex(projectId);
    const parsed = validateDocument(projectId, document);
    if (
      parsed.id !== indexed.documentId
      || parsed.version !== indexed.currentVersion + 1
    ) {
      throw new StoreScreenshotPersistenceError(
        'VERSION_CONFLICT',
        `Expected version ${indexed.currentVersion + 1}`,
      );
    }
    const parsedChangeSet = changeSet === null
      ? null
      : StoreScreenshotChangeSetSchema.safeParse(changeSet);
    if (parsedChangeSet !== null && !parsedChangeSet.success) {
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Store screenshot change set is invalid',
      );
    }
    if (
      parsedChangeSet !== null
      && parsedChangeSet.data.baseVersion !== indexed.currentVersion
    ) {
      throw new StoreScreenshotPersistenceError(
        'VERSION_CONFLICT',
        `Change set must be based on version ${indexed.currentVersion}`,
      );
    }
    const timestamp = now();
    const paths = await writeDocumentFiles(projectId, parsed);
    db.transaction(() => {
      const update = db.prepare(`
        UPDATE store_screenshot_documents
        SET current_version = ?, relative_path = ?, updated_at = ?
        WHERE project_id = ? AND current_version = ?
      `).run(
        parsed.version,
        paths.documentPath,
        timestamp,
        projectId,
        indexed.currentVersion,
      );
      if (update.changes !== 1) {
        throw new StoreScreenshotPersistenceError(
          'VERSION_CONFLICT',
          'Store screenshot document changed while saving',
        );
      }
      db.prepare(`
        INSERT INTO store_screenshot_versions
          (document_id, version, source, changeset_json, relative_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        parsed.id,
        parsed.version,
        source,
        parsedChangeSet === null ? null : JSON.stringify(parsedChangeSet.data),
        paths.versionPath,
        timestamp,
      );
    })();
    return parsed;
  };

  return {
    create: (
      projectId: string,
      document: StoreScreenshotDocument,
    ): Promise<StoreScreenshotDocument> => withProjectLock(
      projectId,
      () => createUnlocked(projectId, document),
    ),
    read: (projectId: string): Promise<StoreScreenshotDocument> => withProjectLock(
      projectId,
      () => readUnlocked(projectId),
    ),
    save: (
      projectId: string,
      document: StoreScreenshotDocument,
      changeSet: StoreScreenshotChangeSet | null,
      source: StoreScreenshotVersionSource,
    ): Promise<StoreScreenshotDocument> => withProjectLock(
      projectId,
      () => saveUnlocked(projectId, document, changeSet, source),
    ),
    restore: async (
      projectId: string,
      version: number,
    ): Promise<StoreScreenshotDocument> => withProjectLock(projectId, async () => {
      if (!Number.isInteger(version) || version < 1) {
        throw new StoreScreenshotPersistenceError(
          'VERSION_NOT_FOUND',
          `Store screenshot version ${version} does not exist`,
        );
      }
      const indexed = requireDocumentIndex(projectId);
      const target = db.prepare(`
        SELECT
          document_id AS documentId,
          version,
          source,
          changeset_json AS changeSetJson,
          relative_path AS relativePath,
          created_at AS createdAt
        FROM store_screenshot_versions
        WHERE document_id = ? AND version = ?
      `).get(indexed.documentId, version) as VersionIndexRow | undefined;
      if (!target) {
        throw new StoreScreenshotPersistenceError(
          'VERSION_NOT_FOUND',
          `Store screenshot version ${version} does not exist`,
        );
      }
      const snapshot = await readIndexedDocument(projectId, target.relativePath);
      return saveUnlocked(projectId, {
        ...snapshot,
        version: indexed.currentVersion + 1,
      }, null, 'restore');
    }),
    listVersions: (projectId: string): Promise<Array<{
      version: number;
      source: StoreScreenshotVersionSource;
      createdAt: number;
    }>> => withProjectLock(projectId, async () => {
      const indexed = requireDocumentIndex(projectId);
      return (db.prepare(`
        SELECT
          version,
          source,
          created_at AS createdAt
        FROM store_screenshot_versions
        WHERE document_id = ?
        ORDER BY version DESC
      `).all(indexed.documentId) as Array<{
        version: number;
        source: StoreScreenshotVersionSource;
        createdAt: number;
      }>).map((item) => ({
        version: Number(item.version),
        source: item.source,
        createdAt: Number(item.createdAt),
      }));
    }),
  };
}
