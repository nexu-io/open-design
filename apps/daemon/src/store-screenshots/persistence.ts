import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
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

export interface StoreScreenshotAssetIndex {
  id: string;
  projectId: string;
  documentId: string;
  relativePath: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  contentHash: string;
}

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
const DATABASE_CANONICAL_WRITE_TAILS = new WeakMap<
  Database.Database,
  Map<string, Promise<void>>
>();

async function withCanonicalWriteLock<T>(
  db: Database.Database,
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let projectTails = DATABASE_CANONICAL_WRITE_TAILS.get(db);
  if (!projectTails) {
    projectTails = new Map<string, Promise<void>>();
    DATABASE_CANONICAL_WRITE_TAILS.set(db, projectTails);
  }
  const previous = projectTails.get(projectId) ?? Promise.resolve();
  let release = (): void => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current, () => current);
  projectTails.set(projectId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (projectTails.get(projectId) === tail) {
      projectTails.delete(projectId);
    }
  }
}

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_delete: string;
};

function foreignKeys(db: Database.Database, table: string): ForeignKeyRow[] {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all() as ForeignKeyRow[];
}

function hasDocumentForeignKey(
  db: Database.Database,
  table: 'store_screenshot_versions' | 'store_screenshot_assets',
): boolean {
  return foreignKeys(db, table).some((foreignKey) => (
    foreignKey.table === 'store_screenshot_documents'
    && foreignKey.from === 'document_id'
    && foreignKey.to === 'document_id'
    && foreignKey.on_delete.toUpperCase() === 'CASCADE'
  ));
}

function hasJobDocumentPairForeignKey(db: Database.Database): boolean {
  const pairs = foreignKeys(db, 'store_screenshot_jobs').filter((foreignKey) => (
    foreignKey.table === 'store_screenshot_documents'
    && foreignKey.on_delete.toUpperCase() === 'CASCADE'
  ));
  return (
    pairs.length === 2
    && pairs[0]?.id === pairs[1]?.id
    && pairs.some((foreignKey) => (
      foreignKey.from === 'project_id' && foreignKey.to === 'project_id'
    ))
    && pairs.some((foreignKey) => (
      foreignKey.from === 'document_id' && foreignKey.to === 'document_id'
    ))
  );
}

function upgradeLegacyStoreScreenshotChildTables(db: Database.Database): void {
  if (!hasDocumentForeignKey(db, 'store_screenshot_versions')) {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS store_screenshot_versions_next;
        CREATE TABLE store_screenshot_versions_next (
          document_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          source TEXT NOT NULL,
          changeset_json TEXT,
          relative_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (document_id, version),
          FOREIGN KEY(document_id)
            REFERENCES store_screenshot_documents(document_id)
            ON DELETE CASCADE
        );
        INSERT INTO store_screenshot_versions_next
          (document_id, version, source, changeset_json, relative_path, created_at)
        SELECT
          version.document_id,
          version.version,
          version.source,
          version.changeset_json,
          version.relative_path,
          version.created_at
        FROM store_screenshot_versions AS version
        INNER JOIN store_screenshot_documents AS document
          ON document.document_id = version.document_id;
        DROP TABLE store_screenshot_versions;
        ALTER TABLE store_screenshot_versions_next
          RENAME TO store_screenshot_versions;
      `);
    })();
  }

  if (!hasDocumentForeignKey(db, 'store_screenshot_assets')) {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS store_screenshot_assets_next;
        CREATE TABLE store_screenshot_assets_next (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          relative_path TEXT NOT NULL,
          mime TEXT NOT NULL,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE (document_id, content_hash),
          FOREIGN KEY(document_id)
            REFERENCES store_screenshot_documents(document_id)
            ON DELETE CASCADE
        );
        INSERT INTO store_screenshot_assets_next
          (id, document_id, relative_path, mime, width, height, content_hash, created_at)
        SELECT
          asset.id,
          asset.document_id,
          asset.relative_path,
          asset.mime,
          asset.width,
          asset.height,
          asset.content_hash,
          asset.created_at
        FROM store_screenshot_assets AS asset
        INNER JOIN store_screenshot_documents AS document
          ON document.document_id = asset.document_id
        WHERE asset.rowid = (
          SELECT MIN(candidate.rowid)
          FROM store_screenshot_assets AS candidate
          WHERE candidate.document_id = asset.document_id
            AND candidate.content_hash = asset.content_hash
        );
        DROP TABLE store_screenshot_assets;
        ALTER TABLE store_screenshot_assets_next
          RENAME TO store_screenshot_assets;
      `);
    })();
  }

  if (!hasJobDocumentPairForeignKey(db)) {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS store_screenshot_jobs_next;
        CREATE TABLE store_screenshot_jobs_next (
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
          updated_at INTEGER NOT NULL,
          FOREIGN KEY(project_id, document_id)
            REFERENCES store_screenshot_documents(project_id, document_id)
            ON DELETE CASCADE
        );
        INSERT INTO store_screenshot_jobs_next
          (id, project_id, document_id, type, status, progress_json,
           result_json, error_json, created_at, started_at, ended_at, updated_at)
        SELECT
          job.id,
          job.project_id,
          job.document_id,
          job.type,
          job.status,
          job.progress_json,
          job.result_json,
          job.error_json,
          job.created_at,
          job.started_at,
          job.ended_at,
          job.updated_at
        FROM store_screenshot_jobs AS job
        INNER JOIN store_screenshot_documents AS document
          ON document.project_id = job.project_id
         AND document.document_id = job.document_id;
        DROP TABLE store_screenshot_jobs;
        ALTER TABLE store_screenshot_jobs_next
          RENAME TO store_screenshot_jobs;
      `);
    })();
  }
}

export function migrateStoreScreenshots(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS store_screenshot_documents (
      project_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL UNIQUE,
      current_version INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (project_id, document_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_store_screenshot_documents_document_id
      ON store_screenshot_documents(document_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_store_screenshot_documents_project_document
      ON store_screenshot_documents(project_id, document_id);

    CREATE TABLE IF NOT EXISTS store_screenshot_versions (
      document_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      source TEXT NOT NULL,
      changeset_json TEXT,
      relative_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, version),
      FOREIGN KEY(document_id)
        REFERENCES store_screenshot_documents(document_id)
        ON DELETE CASCADE
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
      UNIQUE (document_id, content_hash),
      FOREIGN KEY(document_id)
        REFERENCES store_screenshot_documents(document_id)
        ON DELETE CASCADE
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
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id, document_id)
        REFERENCES store_screenshot_documents(project_id, document_id)
        ON DELETE CASCADE
    );
  `);

  upgradeLegacyStoreScreenshotChildTables(db);

  db.exec(`
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

  function documentIdExists(documentId: string): boolean {
    return Boolean(db.prepare(`
      SELECT 1
      FROM store_screenshot_documents
      WHERE document_id = ?
    `).get(documentId));
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

  async function writeDocumentCandidate(
    projectId: string,
    document: StoreScreenshotDocument,
  ): Promise<{ body: Buffer; versionPath: string }> {
    const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const contentHash = createHash('sha256').update(body).digest('hex');
    const versionPath = `${VERSION_PATH_PREFIX}/${document.version}-${contentHash}.json`;
    await projectStorage.writeFile(projectId, versionPath, body);
    return { body, versionPath };
  }

  async function deleteCandidateUnlessIndexed(
    projectId: string,
    versionPath: string,
  ): Promise<void> {
    const indexed = db.prepare(`
      SELECT 1 FROM store_screenshot_documents WHERE relative_path = ?
      UNION ALL
      SELECT 1 FROM store_screenshot_versions WHERE relative_path = ?
      LIMIT 1
    `).get(versionPath, versionPath);
    if (!indexed) {
      await projectStorage.deleteFile(projectId, versionPath);
    }
  }

  async function writeCanonicalIfCurrent(
    projectId: string,
    document: StoreScreenshotDocument,
    versionPath: string,
    body: Buffer,
  ): Promise<void> {
    await withCanonicalWriteLock(db, projectId, async () => {
      const current = getDocumentIndex(projectId);
      if (
        current?.documentId === document.id
        && current.currentVersion === document.version
        && current.relativePath === versionPath
      ) {
        await projectStorage.writeFile(projectId, DOCUMENT_PATH, body);
      }
    });
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

  const create = async (
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
    if (getDocumentIndex(projectId) || documentIdExists(parsed.id)) {
      throw new StoreScreenshotPersistenceError(
        'DOCUMENT_EXISTS',
        `Store screenshot document already exists for project ${projectId}`,
      );
    }
    const timestamp = now();
    const candidate = await writeDocumentCandidate(projectId, parsed);
    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO store_screenshot_documents
            (project_id, document_id, current_version, relative_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          projectId,
          parsed.id,
          parsed.version,
          candidate.versionPath,
          timestamp,
          timestamp,
        );
        db.prepare(`
          INSERT INTO store_screenshot_versions
            (document_id, version, source, changeset_json, relative_path, created_at)
          VALUES (?, ?, ?, NULL, ?, ?)
        `).run(
          parsed.id,
          parsed.version,
          'template',
          candidate.versionPath,
          timestamp,
        );
      })();
    } catch {
      await deleteCandidateUnlessIndexed(projectId, candidate.versionPath);
      if (getDocumentIndex(projectId) || documentIdExists(parsed.id)) {
        throw new StoreScreenshotPersistenceError(
          'DOCUMENT_EXISTS',
          'Store screenshot document already exists',
        );
      }
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Store screenshot document metadata could not be created',
      );
    }
    await writeCanonicalIfCurrent(
      projectId,
      parsed,
      candidate.versionPath,
      candidate.body,
    );
    return parsed;
  };

  const read = async (projectId: string): Promise<StoreScreenshotDocument> => {
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

  const save = async (
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
    const candidate = await writeDocumentCandidate(projectId, parsed);
    try {
      db.transaction(() => {
        const update = db.prepare(`
          UPDATE store_screenshot_documents
          SET current_version = ?, relative_path = ?, updated_at = ?
          WHERE project_id = ? AND document_id = ? AND current_version = ?
        `).run(
          parsed.version,
          candidate.versionPath,
          timestamp,
          projectId,
          parsed.id,
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
          candidate.versionPath,
          timestamp,
        );
      })();
    } catch (error) {
      await deleteCandidateUnlessIndexed(projectId, candidate.versionPath);
      if (error instanceof StoreScreenshotPersistenceError) {
        throw error;
      }
      const current = getDocumentIndex(projectId);
      if (
        current?.documentId !== indexed.documentId
        || current.currentVersion !== indexed.currentVersion
      ) {
        throw new StoreScreenshotPersistenceError(
          'VERSION_CONFLICT',
          'Store screenshot document changed while saving',
        );
      }
      throw new StoreScreenshotPersistenceError(
        'INVALID_DOCUMENT',
        'Store screenshot document metadata could not be saved',
      );
    }
    await writeCanonicalIfCurrent(
      projectId,
      parsed,
      candidate.versionPath,
      candidate.body,
    );
    return parsed;
  };

  return {
    create,
    read,
    readIdentity: async (projectId: string): Promise<{
      documentId: string;
      version: number;
    }> => {
      const indexed = requireDocumentIndex(projectId);
      return {
        documentId: indexed.documentId,
        version: indexed.currentVersion,
      };
    },
    findAsset: async (assetId: string): Promise<StoreScreenshotAssetIndex | null> => {
      const row = db.prepare(`
        SELECT
          asset.id,
          document.project_id AS projectId,
          asset.document_id AS documentId,
          asset.relative_path AS relativePath,
          asset.mime,
          asset.width,
          asset.height,
          asset.content_hash AS contentHash
        FROM store_screenshot_assets AS asset
        INNER JOIN store_screenshot_documents AS document
          ON document.document_id = asset.document_id
        WHERE asset.id = ?
      `).get(assetId) as StoreScreenshotAssetIndex | undefined;
      return row ? {
        ...row,
        width: Number(row.width),
        height: Number(row.height),
      } : null;
    },
    save,
    restore: async (
      projectId: string,
      version: number,
    ): Promise<StoreScreenshotDocument> => {
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
      return save(projectId, {
        ...snapshot,
        version: indexed.currentVersion + 1,
      }, null, 'restore');
    },
    listVersions: async (projectId: string): Promise<Array<{
      version: number;
      source: StoreScreenshotVersionSource;
      createdAt: number;
    }>> => {
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
    },
  };
}
